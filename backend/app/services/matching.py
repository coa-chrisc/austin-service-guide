"""Service matching engine.

Takes a ResidentProfile and returns ranked ServiceMatch results plus
risk assessment and estimated benefit value.
"""

from __future__ import annotations

from collections.abc import Sequence

from app.models import (
    ResidentProfile,
    RiskFlag,
    RiskSeverity,
    Service,
    ServiceMatch,
)
from app.services import catalog
from app.services.catalog_loader import (
    PreventionEntry,
    load_matching_rules,
    local_crisis_lines,
)
from app.services.eligibility import eligibility_note, unconfirmed_gates


# ── Category keyword mapping ──────────────────────────────────────────

_NEED_TO_CATEGORIES: dict[str, list[str]] = {
    "food": ["food"],
    "groceries": ["food"],
    "hungry": ["food"],
    "nutrition": ["food"],
    "snap": ["food"],
    "wic": ["food"],
    "healthcare": ["healthcare"],
    "health": ["healthcare"],
    "medical": ["healthcare"],
    "doctor": ["healthcare"],
    "dental": ["healthcare"],
    "mental health": ["healthcare"],
    "counseling": ["healthcare"],
    "therapy": ["healthcare"],
    "housing": ["housing"],
    "shelter": ["housing", "emergency"],
    "rent": ["housing"],
    "apartment": ["housing"],
    "homeless": ["housing", "emergency"],
    "eviction": ["housing", "legal"],
    "employment": ["employment"],
    "job": ["employment"],
    "career": ["employment"],
    "work": ["employment"],
    "training": ["employment", "education"],
    "childcare": ["childcare"],
    "daycare": ["childcare"],
    "preschool": ["childcare", "education"],
    "senior": ["senior"],
    "aging": ["senior"],
    "elderly": ["senior"],
    "veterans": ["veterans"],
    "veteran": ["veterans"],
    "va": ["veterans"],
    "military": ["veterans"],
    "utilities": ["utilities"],
    "electric": ["utilities"],
    "water": ["utilities"],
    "bill help": ["utilities"],
    "transportation": ["transportation"],
    "bus": ["transportation"],
    "transit": ["transportation"],
    "ride": ["transportation"],
    "legal": ["legal"],
    "lawyer": ["legal"],
    "immigration": ["immigration"],
    "citizenship": ["immigration"],
    "refugee": ["immigration"],
    "disability": ["disability"],
    "accessible": ["disability"],
    "education": ["education"],
    "ged": ["education"],
    "esl": ["education"],
    "computer": ["education"],
    "emergency": ["emergency"],
    "crisis": ["emergency"],
    "domestic violence": ["emergency"],
    "abuse": ["emergency"],
    "unsafe": ["emergency"],
    "cooling": ["cooling"],
    "heat": ["cooling", "utilities"],
    "ac": ["cooling", "utilities"],
    "air conditioning": ["cooling", "utilities"],
    "heat stroke": ["cooling", "healthcare", "emergency"],
}


def _high_heat_zips() -> set[str]:
    """ZIPs with elevated heat vulnerability, from the pack's matching rules."""
    return set(load_matching_rules().high_heat_zips)


def _matching_categories(profile: ResidentProfile) -> set[str]:
    """Determine which categories are relevant for a profile."""
    cats: set[str] = set()
    for need in profile.immediate_needs:
        need_lower = need.lower()
        if need_lower in _NEED_TO_CATEGORIES:
            cats.update(_NEED_TO_CATEGORIES[need_lower])
        else:
            # Direct category slug match
            cats.add(need_lower)

    # Infer additional categories from profile attributes
    if profile.has_children:
        cats.add("childcare")
    if profile.veteran_status:
        cats.add("veterans")
    if profile.has_disability:
        cats.add("disability")
    if profile.age_range and profile.age_range.startswith(("60", "70", "80")):
        cats.add("senior")
    if profile.housing_situation in ("homeless", "unstable"):
        cats.add("housing")
        cats.add("emergency")
    if profile.employment_status in ("unemployed",):
        cats.add("employment")
    if profile.insurance_status == "uninsured":
        cats.add("healthcare")
    if profile.crisis_indicators:
        cats.add("emergency")

    # Heat vulnerability — outdoor work, no AC, or chronic conditions in a
    # high-heat zip all push cooling-related services up the list.
    if (
        profile.is_outdoor_worker
        or profile.has_ac is False
        or (profile.has_chronic_conditions and profile.zip_code in _high_heat_zips())
    ):
        cats.add("cooling")
        cats.add("utilities")

    # Refugee / immigrant — surface resettlement-aware partners. Coordination
    # is the gap, so pull food + healthcare alongside refugee/immigration.
    if profile.is_refugee_or_immigrant:
        cats.add("refugee")
        cats.add("immigration")
        cats.add("food")
        cats.add("healthcare")

    # School-age children with concerns — surface CIS / school-based
    # counseling. Mental-health-flavored concerns also pull in healthcare.
    if profile.school_age_children:
        cats.add("schools")
        for child in profile.school_age_children:
            if any(
                c.lower() in {"anxiety", "depression", "behavioral", "self-harm", "trauma", "mental health"}
                for c in (child.concerns or [])
            ):
                cats.add("healthcare")
                break

    return cats


def _score_service(service: Service, profile: ResidentProfile, target_cats: set[str]) -> float:
    """Score a service 0-100 based on how well it matches the profile."""
    score = 0.0

    # Category overlap (up to 40 points)
    svc_cats = set(service.categories)
    overlap = svc_cats & target_cats
    if overlap:
        score += min(40, len(overlap) * 20)

    # Immediate needs keyword matching (up to 20 points)
    for need in profile.immediate_needs:
        if need.lower() in service.description.lower() or need.lower() in service.name.lower():
            score += 5

    # Language match (10 points)
    if profile.languages_spoken:
        if any(lang in service.languages_offered for lang in profile.languages_spoken):
            score += 10

    # Cost accessibility (10 points)
    if service.cost_type in ("free", "sliding_scale"):
        if profile.income_bracket in ("$0-$10,000", "$10,000-$20,000", "$20,000-$30,000"):
            score += 10

    # Geographic proximity heuristic (10 points) — if zip codes overlap
    if profile.zip_code:
        for loc in service.locations:
            if loc.zip_code == profile.zip_code:
                score += 10
                break
            # Adjacent zip proximity (5 pts)
            if loc.zip_code and loc.zip_code[:3] == profile.zip_code[:3]:
                score += 5
                break

    # Veteran-specific boost (5 points)
    if profile.veteran_status and "veterans" in svc_cats:
        score += 5

    # Disability-specific boost (5 points)
    if profile.has_disability and "disability" in svc_cats:
        score += 5

    return min(100, score)


_MAX_MATCHES = 15


def crisis_services() -> dict[str, list[str]]:
    """Crisis indicator -> service slugs that directly answer it, most local
    first (``crisis_services`` in the pack's matching rules). They skip the
    relevance filter, eligibility gates, and the match cap, and lead the
    application plan."""
    return load_matching_rules().crisis_services


def _crisis_slugs(profile: ResidentProfile) -> list[str]:
    """Crisis-direct service slugs for the profile, in indicator order."""
    out: list[str] = []
    rules = crisis_services()
    for indicator in profile.crisis_indicators:
        for slug in rules.get(indicator, []):
            if slug not in out:
                out.append(slug)
    return out


def _needs_label(cats: set[str]) -> str:
    """Matched categories, highest plan priority first, readable slugs.

    Slugs (underscores → spaces) rather than categories.yaml display names,
    because i18n.translate_match_reasoning translates by slug.
    """
    ordered = sorted(cats, key=lambda c: (-_SEQUENCE_PRIORITY.get(c, 0), c))
    return ", ".join(c.replace("_", " ") for c in ordered)


def _to_match(
    svc: Service,
    score: float,
    unconfirmed: list[str],
    profile: ResidentProfile,
    target_cats: set[str],
    *,
    crisis: bool = False,
) -> ServiceMatch:
    if crisis or score >= 50:
        confidence = "high"
    elif score >= 30:
        confidence = "medium"
    else:
        confidence = "low"

    # Build reasoning
    matched_cats = set(svc.categories) & target_cats
    reasons = []
    if crisis:
        reasons.append("Directly serves the safety concern you shared")
    if matched_cats:
        reasons.append(f"Matches needs: {_needs_label(matched_cats)}")
    if profile.languages_spoken and any(l in svc.languages_offered for l in profile.languages_spoken):
        reasons.append("Available in your language")
    if svc.cost_type in ("free", "sliding_scale"):
        reasons.append("Free or low-cost")
    if unconfirmed:
        reasons.append(eligibility_note(svc, unconfirmed))

    return ServiceMatch(
        service=svc,
        match_confidence=confidence,
        match_reasoning="; ".join(reasons) if reasons else "Potential match based on profile",
        match_score=round(score, 1),
    )


def match_services(profile: ResidentProfile) -> list[ServiceMatch]:
    """Return services ranked by relevance to the resident profile.

    Crisis-direct services (``crisis_services()``) come first and do not
    count toward the cap. Services with ``eligibility_requires`` gates the
    profile contradicts are dropped. Gates the profile cannot confirm keep
    the service, but capped at "low" confidence and ranked after every
    confirmed fit.
    """
    target_cats = _matching_categories(profile)
    if not target_cats:
        return []

    all_services = catalog.get_all_services(page=1, page_size=200)["items"]
    crisis = _crisis_slugs(profile)
    by_slug = {svc.slug: svc for svc in all_services}
    scored: list[tuple[Service, float, list[str]]] = []

    for svc in all_services:
        if svc.slug in crisis:
            continue
        unconfirmed = unconfirmed_gates(svc, profile)
        if unconfirmed is None:
            continue
        # Language/cost/zip points alone are not relevance — require a
        # shared category or a stated need named in the listing.
        text = f"{svc.name} {svc.description}".lower()
        if not (set(svc.categories) & target_cats) and not any(
            n.lower() in text for n in profile.immediate_needs
        ):
            continue
        score = _score_service(svc, profile, target_cats)
        if score > 10:
            if unconfirmed:
                score = min(score, 29.0)  # stays in the "low" band
            scored.append((svc, score, unconfirmed))

    # Confirmed-eligible services first, then by score.
    scored.sort(key=lambda x: (not x[2], x[1]), reverse=True)

    matches = [
        _to_match(by_slug[slug], _score_service(by_slug[slug], profile, target_cats), [],
                  profile, target_cats, crisis=True)
        for slug in crisis if slug in by_slug
    ]
    matches += [
        _to_match(svc, score, unconfirmed, profile, target_cats)
        for svc, score, unconfirmed in scored[:_MAX_MATCHES]
    ]
    return matches


# ── Risk Assessment ───────────────────────────────────────────────────

def _entry_label(entry: PreventionEntry) -> str | None:
    if entry.text is not None:
        return entry.text
    svc = catalog.get_service_by_slug(entry.service or "")
    return svc.name if svc else None


def _prevention(risk_type: str, *, lead: Sequence[str] = (), tail: Sequence[str] = ()) -> list[str]:
    """Prevention services for a risk flag: ``lead``, the pack's entries for
    ``risk_type`` (catalog names or display text), then ``tail``."""
    entries = load_matching_rules().prevention_services.get(risk_type, [])
    pack = [label for label in map(_entry_label, entries) if label]
    return [*lead, *pack, *tail]


def _crisis_line_labels(topic: str) -> list[str]:
    return [f"{r.name} ({r.phone})" for r in local_crisis_lines(topic)]


def assess_risks(profile: ResidentProfile) -> list[RiskFlag]:
    """Identify risk factors from the resident profile."""
    flags: list[RiskFlag] = []

    # Homelessness
    if profile.housing_situation in ("homeless",):
        flags.append(RiskFlag(
            risk_type="homelessness",
            severity=RiskSeverity.critical,
            description="Currently experiencing homelessness",
            contributing_factors=["No stable housing", profile.employment_status or "Unknown employment"],
            prevention_services=_prevention("homelessness"),
        ))
    elif profile.housing_situation in ("unstable",):
        flags.append(RiskFlag(
            risk_type="housing_instability",
            severity=RiskSeverity.high,
            description="At risk of homelessness — unstable housing situation",
            contributing_factors=["Unstable housing"],
            prevention_services=_prevention("housing_instability"),
        ))

    # Food insecurity
    if "food" in profile.immediate_needs and profile.income_bracket in (
        "$0-$10,000", "$10,000-$20,000"
    ):
        flags.append(RiskFlag(
            risk_type="food_insecurity",
            severity=RiskSeverity.high,
            description="High risk of food insecurity based on income and stated need",
            contributing_factors=["Low income", "Food identified as immediate need"],
            prevention_services=_prevention("food_insecurity"),
        ))

    # Uninsured
    if profile.insurance_status == "uninsured":
        sev = RiskSeverity.high if profile.has_children else RiskSeverity.medium
        flags.append(RiskFlag(
            risk_type="uninsured",
            severity=sev,
            description="No health insurance coverage",
            contributing_factors=["Uninsured status"],
            prevention_services=_prevention("uninsured"),
        ))

    # Crisis indicators
    if "domestic_violence" in profile.crisis_indicators:
        flags.append(RiskFlag(
            risk_type="domestic_violence",
            severity=RiskSeverity.critical,
            description="Indicators of domestic violence or unsafe home environment",
            contributing_factors=["Self-reported safety concern"],
            prevention_services=_prevention(
                "domestic_violence",
                lead=_crisis_line_labels("domestic_violence"),
                tail=["National DV Hotline (1-800-799-7233)"],
            ),
        ))

    if "suicidal_ideation" in profile.crisis_indicators:
        flags.append(RiskFlag(
            risk_type="mental_health_crisis",
            severity=RiskSeverity.critical,
            description="Indicators of suicidal ideation or severe mental health crisis",
            contributing_factors=["Self-reported mental health crisis"],
            prevention_services=_prevention(
                "mental_health_crisis",
                lead=["988 Suicide & Crisis Lifeline", *_crisis_line_labels("mental_health")],
            ),
        ))

    if "homelessness" in profile.crisis_indicators:
        if not any(f.risk_type == "homelessness" for f in flags):
            flags.append(RiskFlag(
                risk_type="homelessness",
                severity=RiskSeverity.high,
                description="At risk of or currently experiencing homelessness",
                contributing_factors=["Self-reported homelessness concern"],
                prevention_services=_prevention("homelessness"),
            ))

    # Social isolation (senior alone)
    if (profile.age_range and profile.age_range.startswith(("70", "80"))
        and profile.household_size == 1):
        flags.append(RiskFlag(
            risk_type="social_isolation",
            severity=RiskSeverity.medium,
            description="Older adult living alone — potential social isolation risk",
            contributing_factors=["Age 70+", "Single-person household"],
            prevention_services=_prevention("social_isolation"),
        ))

    # Heat vulnerability — combined risk from outdoor work, no AC, chronic
    # conditions, and/or high-heat zip.
    heat_factors: list[str] = []
    if profile.is_outdoor_worker:
        heat_factors.append("Outdoor occupation in extreme-heat exposure")
    if profile.has_ac is False:
        heat_factors.append("No working AC at home")
    if profile.has_chronic_conditions:
        heat_factors.append("Chronic condition compounding heat risk")
    if profile.zip_code in _high_heat_zips():
        heat_factors.append(f"High-heat zip ({profile.zip_code})")

    # Child mental-health risk — when any school-age child has a flagged
    # concern in {anxiety, depression, behavioral, self-harm, trauma}.
    mh_keywords = {"anxiety", "depression", "behavioral", "self-harm", "trauma", "mental health"}
    flagged_children: list[str] = []
    severe_concern = False
    for child in profile.school_age_children:
        concerns = [c.lower() for c in (child.concerns or [])]
        if any(c in mh_keywords for c in concerns):
            grade = child.grade or "?"
            flagged_children.append(f"Grade {grade}: {', '.join(child.concerns)}")
        if "self-harm" in concerns or "suicidal" in concerns:
            severe_concern = True
    if flagged_children:
        flags.append(RiskFlag(
            risk_type="child_mental_health_risk",
            severity=RiskSeverity.critical if severe_concern else RiskSeverity.high,
            description="School-age child with mental-health concerns reported by household.",
            contributing_factors=flagged_children,
            prevention_services=_prevention("child_mental_health_risk"),
        ))

    if len(heat_factors) >= 2:
        sev = (
            RiskSeverity.critical
            if profile.is_outdoor_worker and profile.has_ac is False
            else RiskSeverity.high
        )
        flags.append(RiskFlag(
            risk_type="heat_vulnerable",
            severity=sev,
            description="Elevated risk of heat-related illness during summer heat advisories",
            contributing_factors=heat_factors,
            prevention_services=_prevention("heat_vulnerable"),
        ))

    return flags


# ── Benefits Estimation ──────────────────────────────────────────────

def calculate_benefits(
    profile: ResidentProfile,
    matched_services: list[ServiceMatch],
) -> dict:
    """Estimate the monthly value of matched benefits."""
    breakdown: list[dict] = []
    total_monthly = 0.0

    estimates = load_matching_rules().benefit_estimates
    uninsured = profile.insurance_status == "uninsured"

    for m in matched_services:
        svc = m.service
        value = 0.0
        label = svc.name

        est = next(
            (e for e in estimates
             if svc.slug in e.services and (uninsured or not e.only_if_uninsured)),
            None,
        )
        if est:
            value = est.monthly_value * ((profile.household_size or 1) if est.per_household_member else 1)
            label = est.label
        elif svc.cost_type == "free":
            # Generic free service modest value
            value = 25.0

        if value > 0:
            breakdown.append({"service": label, "monthly_value": value})
            total_monthly += value

    return {
        "total_monthly_value": round(total_monthly, 2),
        "total_annual_value": round(total_monthly * 12, 2),
        "breakdown": breakdown,
    }


# ── Application sequencing ───────────────────────────────────────────

# Higher score = apply earlier. Crisis tops everything, then food/income
# stabilizers (which often unlock other benefits), then shelter, then
# health, then everything else.
_SEQUENCE_PRIORITY: dict[str, int] = {
    "emergency": 100,
    "cooling": 85,
    "food": 80,
    "housing": 75,
    "refugee": 70,
    "utilities": 65,
    "healthcare": 60,
    "childcare": 55,
    "schools": 50,
    "employment": 45,
    "veterans": 40,
    "senior": 35,
    "disability": 35,
    "transportation": 25,
    "legal": 20,
    "immigration": 20,
    "education": 10,
}

_SEQUENCE_REASONS: dict[str, str] = {
    "emergency": "Address immediate safety first — these resources answer 24/7.",
    "cooling": "Heat illness escalates fast — cooling and AC help come before everything else during a heat advisory.",
    "food": "Food assistance often qualifies you for other programs automatically.",
    "housing": "Keeping a stable place to live comes before longer-term goals.",
    "refugee": "Resettlement coordination can unlock food, healthcare, and school support in a single intake.",
    "utilities": "Keeping the lights on prevents eviction and protects your deposits.",
    "healthcare": "Get covered before any out-of-pocket bills pile up.",
    "childcare": "Childcare unblocks job search, school, and medical appointments.",
    "schools": "School-based mental-health support is the fastest way to reach a struggling student.",
    "employment": "Job placement is faster once basic needs are stable.",
    "veterans": "VA benefits stack with most state and local programs.",
    "senior": "Age-based programs are usually fastest to qualify for.",
    "disability": "Disability documentation unlocks several other benefits.",
    "transportation": "Reliable transit makes appointments and work feasible.",
    "legal": "Legal aid can stop adverse actions already in motion.",
    "immigration": "Legal status work goes alongside everything else.",
    "education": "Plan after immediate needs are handled.",
}


def _rank_category(service: Service, target_cats: set[str]) -> str | None:
    """Highest-priority category the service shares with the resident.

    Only categories the resident actually needs count — a multi-purpose
    provider that also runs an emergency shelter does not jump the queue
    for someone who never asked for emergency help.
    """
    shared = [c for c in service.categories if c in target_cats and c in _SEQUENCE_PRIORITY]
    return max(shared, key=_SEQUENCE_PRIORITY.__getitem__, default=None)


def recommend_application_order(
    matched_services: list[ServiceMatch],
    profile: ResidentProfile,
) -> list[dict]:
    """Return matches re-ordered for action, each with a one-line reason.

    1. Crisis-direct services for the resident's crisis indicators.
    2. The best confirmed-eligible service for each target category, one per
       category, highest-priority category first — so the plan opens with
       breadth (food, housing, healthcare …) instead of five food pantries.
    3. Everything else: confirmed before unconfirmed, then by rank category
       priority, then score.
    Each item's reason comes from the category it was placed for.
    """
    target_cats = _matching_categories(profile)
    rank_cats = {m.service.id: _rank_category(m.service, target_cats) for m in matched_services}
    confirmed = {m.service.id: not unconfirmed_gates(m.service, profile) for m in matched_services}

    def prio(cat: str | None) -> int:
        return _SEQUENCE_PRIORITY.get(cat or "", 0)

    remaining = sorted(
        matched_services,
        key=lambda m: (confirmed[m.service.id], prio(rank_cats[m.service.id]), m.match_score),
        reverse=True,
    )
    picks: list[tuple[ServiceMatch, str | None]] = []

    def take(m: ServiceMatch, cat: str | None) -> None:
        remaining.remove(m)
        picks.append((m, cat))

    for slug in _crisis_slugs(profile):
        m = next((m for m in remaining if m.service.slug == slug), None)
        if m:
            take(m, "emergency")

    for cat in sorted(target_cats & _SEQUENCE_PRIORITY.keys(), key=lambda c: (-prio(c), c)):
        if any(c == cat for _, c in picks):
            continue
        candidates = [m for m in remaining if confirmed[m.service.id] and cat in m.service.categories]
        if candidates:
            take(max(candidates, key=lambda m: m.match_score), cat)

    for m in list(remaining):
        take(m, rank_cats[m.service.id])

    out: list[dict] = []
    for idx, (m, cat) in enumerate(picks, start=1):
        primary_cat = cat or next(
            (c for c in m.service.categories if c in target_cats),
            (m.service.categories[0] if m.service.categories else "other"),
        )
        out.append({
            "rank": idx,
            "service_id": m.service.id,
            "service_slug": m.service.slug,
            "service_name": m.service.name,
            "category": primary_cat,
            "reason": _SEQUENCE_REASONS.get(cat or "")
            or "Apply when you have the time — this one is supportive rather than urgent.",
        })
    return out

"""Service matching engine.

Takes a ResidentProfile and returns ranked ServiceMatch results plus
risk assessment and estimated benefit value.
"""

from __future__ import annotations

from app.models import (
    ResidentProfile,
    RiskFlag,
    RiskSeverity,
    Service,
    ServiceMatch,
)
from app.services import catalog


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
}


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


def match_services(profile: ResidentProfile) -> list[ServiceMatch]:
    """Return services ranked by relevance to the resident profile."""
    target_cats = _matching_categories(profile)
    if not target_cats:
        return []

    all_services = catalog.get_all_services(page=1, page_size=200)["items"]
    scored: list[tuple[Service, float]] = []

    for svc in all_services:
        score = _score_service(svc, profile, target_cats)
        if score > 10:
            scored.append((svc, score))

    scored.sort(key=lambda x: x[1], reverse=True)

    matches: list[ServiceMatch] = []
    for svc, score in scored[:15]:
        if score >= 50:
            confidence = "high"
        elif score >= 30:
            confidence = "medium"
        else:
            confidence = "low"

        # Build reasoning
        svc_cats = set(svc.categories)
        matched_cats = svc_cats & target_cats
        reasons = []
        if matched_cats:
            reasons.append(f"Matches needs: {', '.join(matched_cats)}")
        if profile.languages_spoken and any(l in svc.languages_offered for l in profile.languages_spoken):
            reasons.append("Available in your language")
        if svc.cost_type in ("free", "sliding_scale"):
            reasons.append("Free or low-cost")

        matches.append(ServiceMatch(
            service=svc,
            match_confidence=confidence,
            match_reasoning="; ".join(reasons) if reasons else "Potential match based on profile",
            match_score=round(score, 1),
        ))

    return matches


# ── Risk Assessment ───────────────────────────────────────────────────

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
            prevention_services=["Foundation Communities", "Caritas of Austin", "Salvation Army"],
        ))
    elif profile.housing_situation in ("unstable",):
        flags.append(RiskFlag(
            risk_type="housing_instability",
            severity=RiskSeverity.high,
            description="At risk of homelessness — unstable housing situation",
            contributing_factors=["Unstable housing"],
            prevention_services=["Foundation Communities", "Austin Tenants' Council"],
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
            prevention_services=["Central Texas Food Bank", "SNAP", "WIC"],
        ))

    # Uninsured
    if profile.insurance_status == "uninsured":
        sev = RiskSeverity.high if profile.has_children else RiskSeverity.medium
        flags.append(RiskFlag(
            risk_type="uninsured",
            severity=sev,
            description="No health insurance coverage",
            contributing_factors=["Uninsured status"],
            prevention_services=["CommUnity Care", "People's Community Clinic", "Medicaid Enrollment"],
        ))

    # Crisis indicators
    if "domestic_violence" in profile.crisis_indicators:
        flags.append(RiskFlag(
            risk_type="domestic_violence",
            severity=RiskSeverity.critical,
            description="Indicators of domestic violence or unsafe home environment",
            contributing_factors=["Self-reported safety concern"],
            prevention_services=["SAFE Alliance (512-267-7233)", "National DV Hotline (1-800-799-7233)"],
        ))

    if "suicidal_ideation" in profile.crisis_indicators:
        flags.append(RiskFlag(
            risk_type="mental_health_crisis",
            severity=RiskSeverity.critical,
            description="Indicators of suicidal ideation or severe mental health crisis",
            contributing_factors=["Self-reported mental health crisis"],
            prevention_services=["988 Suicide & Crisis Lifeline", "Integral Care (512-472-4357)"],
        ))

    if "homelessness" in profile.crisis_indicators:
        if not any(f.risk_type == "homelessness" for f in flags):
            flags.append(RiskFlag(
                risk_type="homelessness",
                severity=RiskSeverity.high,
                description="At risk of or currently experiencing homelessness",
                contributing_factors=["Self-reported homelessness concern"],
                prevention_services=["Foundation Communities", "Salvation Army", "Caritas of Austin"],
            ))

    # Social isolation (senior alone)
    if (profile.age_range and profile.age_range.startswith(("70", "80"))
        and profile.household_size == 1):
        flags.append(RiskFlag(
            risk_type="social_isolation",
            severity=RiskSeverity.medium,
            description="Older adult living alone — potential social isolation risk",
            contributing_factors=["Age 70+", "Single-person household"],
            prevention_services=["AGE of Central Texas", "Meals on Wheels"],
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

    for m in matched_services:
        svc = m.service
        value = 0.0
        label = svc.name

        # Rough estimates for common programs
        if "svc-snap" in svc.id or "snap" in svc.slug:
            # SNAP: ~$234/person/month average in TX
            persons = profile.household_size or 1
            value = 234.0 * persons
            label = "SNAP Benefits"
        elif "svc-wic" in svc.id or "wic" in svc.slug:
            value = 75.0
            label = "WIC Benefits"
        elif "svc-cap" in svc.id:
            value = 45.0
            label = "CAP Utility Discount"
        elif "svc-ae-assist" in svc.id:
            value = 150.0
            label = "Utility Assistance (one-time avg.)"
        elif "svc-capmetro" in svc.id:
            value = 41.25  # half-fare monthly pass
            label = "Reduced Transit Pass"
        elif "svc-ctfb" in svc.id:
            value = 120.0
            label = "Food Bank (estimated grocery value)"
        elif "svc-mow" in svc.id:
            value = 200.0
            label = "Meals on Wheels (20 meals)"
        elif "svc-medicaid" in svc.id:
            value = 550.0
            label = "Medicaid Coverage (estimated value)"
        elif "svc-commcare" in svc.id and profile.insurance_status == "uninsured":
            value = 80.0
            label = "Sliding-Scale Healthcare Savings"
        elif "svc-headstart" in svc.id:
            value = 800.0
            label = "Head Start (childcare value)"
        elif "svc-foundation" in svc.id:
            value = 400.0
            label = "Affordable Housing Savings"
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
    "food": 80,
    "housing": 75,
    "utilities": 65,
    "healthcare": 60,
    "childcare": 55,
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
    "food": "Food assistance often qualifies you for other programs automatically.",
    "housing": "Stabilize where you sleep before tackling longer-term goals.",
    "utilities": "Keeping the lights on prevents eviction and protects your deposits.",
    "healthcare": "Get covered before any out-of-pocket bills pile up.",
    "childcare": "Childcare unblocks job search, school, and medical appointments.",
    "employment": "Job placement is faster once basic needs are stable.",
    "veterans": "VA benefits stack with most state and local programs.",
    "senior": "Age-based programs are usually fastest to qualify for.",
    "disability": "Disability documentation unlocks several other benefits.",
    "transportation": "Reliable transit makes appointments and work feasible.",
    "legal": "Legal aid can stop adverse actions already in motion.",
    "immigration": "Legal status work goes alongside everything else.",
    "education": "Plan after immediate needs are handled.",
}


def recommend_application_order(
    matched_services: list[ServiceMatch],
) -> list[dict]:
    """Return matches re-ordered for action, each with a one-line reason."""
    def score(m: ServiceMatch) -> tuple[float, float]:
        cat_score = max(
            (_SEQUENCE_PRIORITY.get(c, 0) for c in m.service.categories),
            default=0,
        )
        return (cat_score, m.match_score)

    ordered = sorted(matched_services, key=score, reverse=True)
    out: list[dict] = []
    for idx, m in enumerate(ordered, start=1):
        primary_cat = next(
            (c for c in m.service.categories if c in _SEQUENCE_PRIORITY),
            (m.service.categories[0] if m.service.categories else "other"),
        )
        out.append({
            "rank": idx,
            "service_id": m.service.id,
            "service_slug": m.service.slug,
            "service_name": m.service.name,
            "category": primary_cat,
            "reason": _SEQUENCE_REASONS.get(
                primary_cat,
                "Apply when you have the time — this one is supportive rather than urgent.",
            ),
        })
    return out

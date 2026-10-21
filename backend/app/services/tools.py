"""Intake tool execution shared by the text agent loop and Realtime voice.

Tools mutate only the per-request ``IntakeSession``; the caller serializes
it back into the client-held state. Service ids that come from the model or
the browser go through ``ground_service_ids`` before they are looked up.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from app.models import (
    MAX_PROFILE_LIST,
    MAX_PROFILE_LIST_ITEM,
    MAX_PROFILE_TEXT,
    MAX_SCHOOL_CHILDREN,
    IntakeSession,
    IntakeStatus,
    ResidentProfile,
    SchoolAgeChild,
)
from app.services import catalog
from app.services.grounding import ground_service_ids
from app.services.matching import assess_risks, calculate_benefits, match_services
from app.services.prompts import format_known_facts

log = logging.getLogger(__name__)

_LANGUAGE_RE = re.compile(r"^[a-z]{2,3}(-[a-z0-9]{2,8})?$")


# ── Intake readiness guards ──────────────────────────────────────────

def _field_question(field: str) -> str:
    questions = {
        "stated_needs": (
            "What kind of help do you need most right now?"
        ),
        "current_housing_situation": (
            "What is your housing situation right now — are you in a place "
            "but behind on rent, staying somewhere temporary, or without housing?"
        ),
        "zip_code": "What zip code are you in?",
        "household_size": (
            "How many people are in your household, including you?"
        ),
        "employment_status": (
            "What is your current work situation?"
        ),
        "monthly_income": (
            "About how much money is coming into the household each month, "
            "even if it is zero?"
        ),
        "insurance_status": (
            "Do you have health insurance right now, such as Medicaid, "
            "Medicare, employer insurance, Marketplace coverage, or none?"
        ),
        "veteran_status": (
            "Is this support for you as a veteran, or for someone else who is a veteran?"
        ),
    }
    return questions.get(field, "What else should I know to match the right services?")


def _profile_needs_text(profile: ResidentProfile, args: dict[str, Any] | None = None) -> str:
    parts = list(profile.immediate_needs)
    if args:
        for key in ("query", "category"):
            val = args.get(key)
            if val:
                parts.append(str(val))
    return " ".join(parts).lower()


def _is_housing_related(profile: ResidentProfile, args: dict[str, Any] | None = None) -> bool:
    text = _profile_needs_text(profile, args)
    return any(
        token in text
        for token in (
            "housing",
            "rent",
            "evict",
            "shelter",
            "homeless",
            "home",
            "veteran",
            "veterans",
        )
    )


def _is_veteran_related(profile: ResidentProfile) -> bool:
    text = _profile_needs_text(profile)
    return "veteran" in text or "veterans" in text


def _missing_interview_fields(
    session: IntakeSession,
    *,
    require_all_core: bool = True,
    args: dict[str, Any] | None = None,
) -> list[str]:
    profile = session.extracted_profile
    housing_related = _is_housing_related(profile, args)
    missing: list[str] = []

    if not profile.immediate_needs and require_all_core:
        missing.append("stated_needs")
    if housing_related and not profile.housing_situation:
        missing.append("current_housing_situation")
    if not profile.zip_code:
        missing.append("zip_code")
    if profile.household_size is None:
        missing.append("household_size")
    if not housing_related and require_all_core and not profile.housing_situation:
        missing.append("current_housing_situation")
    if require_all_core and not profile.employment_status:
        missing.append("employment_status")
    if require_all_core and not profile.income_bracket:
        missing.append("monthly_income")
    if require_all_core and not profile.insurance_status:
        missing.append("insurance_status")
    if require_all_core and _is_veteran_related(profile) and profile.veteran_status is None:
        missing.append("veteran_status")

    return missing


def _deferred_tool_output(action: str, missing_fields: list[str]) -> str:
    next_field = missing_fields[0] if missing_fields else "stated_needs"
    return json.dumps({
        "deferred": True,
        "action": action,
        "missing_fields": missing_fields,
        "next_question": _field_question(next_field),
        "instruction": (
            "Do not mention services yet. Ask next_question exactly once, "
            "then wait for the resident's answer."
        ),
    })


def _guard_search_services(session: IntakeSession, args: dict[str, Any]) -> str | None:
    # Search is intentionally held until the core interview is complete. This
    # keeps both text and voice flows from veering into partial recommendations
    # before the guide has enough information to match responsibly.
    missing = _missing_interview_fields(
        session,
        require_all_core=True,
        args=args,
    )
    if missing:
        return _deferred_tool_output("search_services", missing)
    return None


def _guard_matching_or_completion(session: IntakeSession, action: str) -> str | None:
    missing = _missing_interview_fields(session, require_all_core=True)
    if missing:
        return _deferred_tool_output(action, missing)
    return None


# ── Tool dispatch ────────────────────────────────────────────────────

def dispatch_tool(
    session: IntakeSession,
    name: str,
    args: dict[str, Any],
) -> tuple[str, bool]:
    """Execute a tool call locally. Returns (json_output, crisis_fired)."""
    try:
        if name == "search_services":
            deferred = _guard_search_services(session, args)
            if deferred:
                return deferred, False
            return _tool_search_services(args), False
        if name == "get_service_details":
            return _tool_get_service_details(args), False
        if name == "get_crisis_resources":
            return _tool_get_crisis_resources(session, args), True
        if name == "extract_profile":
            return _tool_extract_profile(session, args), False
        if name == "find_matching_services":
            deferred = _guard_matching_or_completion(session, name)
            if deferred:
                return deferred, False
            return _tool_find_matching_services(session), False
        if name == "set_language":
            return _tool_set_language(session, args), False
        if name == "complete_intake":
            deferred = _guard_matching_or_completion(session, name)
            if deferred:
                return deferred, False
            return _tool_complete_intake(session), False
        if name == "wait_for_user":
            return json.dumps({"wait": True, "no_response": True}), False
        return json.dumps({"error": f"unknown tool: {name}"}), False
    except Exception as exc:  # noqa: BLE001
        # Type only: exception messages (e.g. validation errors) can echo the
        # tool arguments, which are resident-derived.
        log.warning("Tool %s failed: %s", name, type(exc).__name__)
        return json.dumps({"error": f"tool failed ({type(exc).__name__})"}), False


def _tool_search_services(args: dict[str, Any]) -> str:
    query = (args.get("query") or "").strip()
    category = args.get("category") or None
    zip_code = args.get("zip_code") or None

    services = catalog.search_services(query, category=category, zip_code=zip_code)
    payload = [
        {
            "slug": s.slug,
            "name": s.name,
            "provider": s.provider_name,
            "categories": s.categories,
            "cost_type": s.cost_type.value if hasattr(s.cost_type, "value") else s.cost_type,
            "summary": (s.description or "")[:200],
            "phone": s.phone,
            "website": s.website_url,
        }
        for s in services[:10]
    ]
    return json.dumps({"results": payload, "count": len(services)})


def _tool_get_service_details(args: dict[str, Any]) -> str:
    grounded = ground_service_ids([args.get("slug")])
    svc = catalog.get_service_by_id(grounded[0]) if grounded else None
    if not svc:
        return json.dumps({
            "error": "No service with that slug. Use a slug returned by search_services.",
        })
    return json.dumps({
        "slug": svc.slug,
        "name": svc.name,
        "provider": svc.provider_name,
        "description": svc.description,
        "eligibility": svc.eligibility_summary,
        "how_to_apply": svc.how_to_apply,
        "cost": svc.cost,
        "cost_type": svc.cost_type.value if hasattr(svc.cost_type, "value") else svc.cost_type,
        "phone": svc.phone,
        "email": svc.email,
        "website": svc.website_url,
        "languages": svc.languages_offered,
        "categories": svc.categories,
        "locations": [
            {"name": loc.name, "address": loc.address, "phone": loc.phone}
            for loc in svc.locations
        ],
    })


def _tool_get_crisis_resources(session: IntakeSession, args: dict[str, Any]) -> str:
    language = args.get("language") or session.language or None
    resources = catalog.get_crisis_resources(language=language)
    return json.dumps({
        "resources": [
            {
                "name": r.name,
                "phone": r.phone,
                "description": r.description,
                "languages": r.languages,
                "available_24_7": r.available_24_7,
            }
            for r in resources
        ]
    })


_PROFILE_TEXT_FIELDS = (
    "zip_code", "housing_situation", "employment_status", "income_bracket",
    "insurance_status", "primary_language",
)
_PROFILE_BOOL_FIELDS = (
    "has_children", "veteran_status", "has_disability", "is_outdoor_worker",
    "has_ac", "has_chronic_conditions", "is_refugee_or_immigrant",
)


def _clip(value: Any, limit: int) -> str:
    return str(value).strip()[:limit]


def _tool_extract_profile(session: IntakeSession, args: dict[str, Any]) -> str:
    # Arguments come from the model, and in voice mode are relayed by the
    # browser, so every value is type-checked and clipped to the bounds the
    # client-held state accepts on the next request.
    profile = session.extracted_profile
    applied: dict[str, Any] = {}
    size = args.get("household_size")
    if isinstance(size, int) and not isinstance(size, bool) and 0 < size <= 50:
        profile.household_size = size
        applied["household_size"] = size
    for key in _PROFILE_TEXT_FIELDS:
        val = args.get(key)
        if isinstance(val, str) and val.strip():
            setattr(profile, key, _clip(val, MAX_PROFILE_TEXT))
            applied[key] = getattr(profile, key)
    for key in _PROFILE_BOOL_FIELDS:
        val = args.get(key)
        if isinstance(val, bool):
            setattr(profile, key, val)
            applied[key] = val

    needs = args.get("immediate_needs")
    if isinstance(needs, list) and needs:
        new = [_clip(n, MAX_PROFILE_LIST_ITEM).lower() for n in needs if isinstance(n, str)]
        merged = list({*profile.immediate_needs, *[n for n in new if n]})[:MAX_PROFILE_LIST]
        profile.immediate_needs = merged
        applied["immediate_needs"] = merged

    children = args.get("school_age_children")
    if children and isinstance(children, list):
        # Overwrite (not merge) — the model has the latest picture. Filter
        # out malformed items (non-dict) before dereferencing so a stray
        # entry doesn't crash the whole extract_profile tool call.
        valid_children = [c for c in children if isinstance(c, dict)][:MAX_SCHOOL_CHILDREN]
        ignored_count = len(children) - len(valid_children)
        profile.school_age_children = [
            SchoolAgeChild(
                grade=_clip(c.get("grade") or "", MAX_PROFILE_LIST_ITEM),
                district=_clip(c.get("district") or "", MAX_PROFILE_LIST_ITEM),
                concerns=[
                    _clip(x, MAX_PROFILE_LIST_ITEM).lower()
                    for x in (
                        c.get("concerns")
                        if isinstance(c.get("concerns"), list)
                        else []
                    )
                ][:MAX_PROFILE_LIST],
            )
            for c in valid_children
        ]
        applied["school_age_children"] = [c.model_dump() for c in profile.school_age_children]
        if ignored_count:
            applied["school_age_children_ignored"] = (
                f"{ignored_count} entries skipped"
            )
    elif children:
        applied["school_age_children_ignored"] = "expected array of child profiles"

    missing = _missing_interview_fields(session, require_all_core=True)
    payload: dict[str, Any] = {
        "applied": applied,
        "profile_complete": _profile_completeness(profile),
        "missing_fields": missing,
        "current_known_facts": format_known_facts(session),
    }
    if missing:
        payload["next_question"] = _field_question(missing[0])
        payload["instruction"] = (
            "current_known_facts is authoritative — never ask the resident "
            "for any field listed there. Ask next_question exactly once now, "
            "in plain resident-facing language, then wait for the resident's "
            "answer. Do not stop at an acknowledgement."
        )
    else:
        payload["instruction"] = (
            "The core interview is complete. Call complete_intake now before "
            "telling the resident their plan is ready."
        )
    return json.dumps(payload)


def _tool_find_matching_services(session: IntakeSession) -> str:
    matches = match_services(session.extracted_profile)
    payload = [
        {
            "slug": m.service.slug,
            "name": m.service.name,
            "confidence": m.match_confidence,
            "score": m.match_score,
            "reasoning": m.match_reasoning,
            "provider": m.service.provider_name,
            "phone": m.service.phone,
        }
        for m in matches[:10]
    ]
    return json.dumps({"matches": payload, "count": len(matches)})


def _tool_set_language(session: IntakeSession, args: dict[str, Any]) -> str:
    code = str(args.get("code") or "en").strip().lower()
    if not _LANGUAGE_RE.match(code):
        return json.dumps({"error": "Use an ISO language code such as 'es' or 'vi'."})
    session.language = code
    if session.extracted_profile.languages_spoken == ["en"] and code != "en":
        session.extracted_profile.languages_spoken = [code]
    return json.dumps({"language": code})


def _tool_complete_intake(session: IntakeSession) -> str:
    profile = session.extracted_profile
    matches = match_services(profile)
    risks = assess_risks(profile)
    benefits = calculate_benefits(profile, matches)

    session.matches = matches
    session.risk_flags = risks
    session.status = IntakeStatus.completed
    # The plan is built later, statelessly, by POST /api/v1/intake/plan.
    session.plan = None

    return json.dumps({
        "match_count": len(matches),
        "high_confidence_matches": [
            {"name": m.service.name, "reasoning": m.match_reasoning}
            for m in matches if m.match_confidence == "high"
        ][:5],
        "estimated_monthly_value": benefits.get("total_monthly_value", 0),
        "estimated_annual_value": benefits.get("total_annual_value", 0),
        "critical_risks": [
            {"type": r.risk_type, "description": r.description}
            for r in risks if r.severity.value in ("critical", "high")
        ],
    })


# ── Profile completeness / progress ──────────────────────────────────

def _profile_completeness(profile: ResidentProfile) -> int:
    fields = [
        profile.household_size is not None,
        bool(profile.zip_code),
        bool(profile.housing_situation),
        bool(profile.employment_status),
        bool(profile.income_bracket),
        bool(profile.insurance_status),
        len(profile.immediate_needs) > 0,
    ]
    filled = sum(1 for f in fields if f)
    return int((filled / len(fields)) * 100)


def estimate_progress(profile: ResidentProfile) -> int:
    return min(95, _profile_completeness(profile))

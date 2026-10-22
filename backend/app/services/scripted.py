"""Scripted intake used when live AI is off (no API key or DEMO_MODE=true).

Runs entirely on the server with no model calls: fixed questions, regex
extraction of the answers, and the rules-based matching engine.
"""

from __future__ import annotations

import re
from typing import Any

from app.models import IntakeMessage, IntakeSession, IntakeStatus, MessageRole, ResidentProfile
from app.services.city import CityIdentity, get_city
from app.services.i18n import AI_NOTICE_I18N
from app.services.life_events import canonical_life_event_slug, session_life_event_slug
from app.services.matching import assess_risks, calculate_benefits, match_services

def welcome_message(city: CityIdentity) -> str:
    """Scripted greeting; the app name comes from the city config."""
    return (
        f"Welcome to the {city.app_name}! I'm here to help you find "
        "city and community services that fit your needs. It takes about "
        "3-5 minutes.\n\n"
        f"{AI_NOTICE_I18N['en']}\n\n"
        "What brings you here today? Are you looking for help with something "
        "specific, or would you like me to walk you through a few questions?"
    )


DEMO_STEPS: list[dict[str, Any]] = [
    {
        "message": welcome_message(get_city()),
        "buttons": ["Walk me through it", "I need help with food", "I need healthcare", "I need housing help", "I lost my job"],
        "progress": 0,
    },
    {"message": "Thank you for sharing that. Let me ask a few quick questions so I can find the best resources for you.\n\nFirst, how many people are in your household, including yourself?",
     "buttons": ["Just me", "2 people", "3-4 people", "5 or more"], "progress": 15},
    {"message": "Got it. What zip code do you live in? This helps me find services near you.",
     "buttons": ["78741", "78702", "78745", "78753", "78758", "Other"], "progress": 30},
    {"message": "Thanks! Now, what best describes your current housing situation?",
     "buttons": ["I rent", "I own my home", "Staying with friends/family", "Currently without housing", "Other"], "progress": 40},
    {"message": "And what's your current employment situation?",
     "buttons": ["Working full-time", "Working part-time", "Currently unemployed", "Retired", "Unable to work"], "progress": 50},
    {"message": "Approximately what is your household's total monthly income? This helps determine which programs you may qualify for.",
     "buttons": ["Under $1,000", "$1,000-$2,000", "$2,000-$3,500", "$3,500-$5,000", "Over $5,000", "Prefer not to say"], "progress": 60},
    {"message": "Do you currently have health insurance?",
     "buttons": ["Yes, through employer", "Medicaid", "Medicare", "ACA Marketplace", "No insurance", "Not sure"], "progress": 70},
    {"message": "Almost done! Are there any other areas where you could use help? Select all that apply, or type your own.",
     "buttons": ["Childcare", "Legal help", "Transportation", "Mental health", "Disability services", "Senior services", "None of these"], "progress": 85},
]


def _extract_household_size(text: str) -> int | None:
    t = text.lower().strip()
    if "just me" in t or t == "1":
        return 1
    if "2" in t:
        return 2
    m = re.search(r"(\d+)", t)
    if m:
        return int(m.group(1))
    if "3" in t or "4" in t or "3-4" in t:
        return 4
    if "5" in t or "more" in t:
        return 6
    return None


def _extract_zip(text: str) -> str:
    m = re.search(r"\b(78\d{3})\b", text)
    return m.group(1) if m else ""


def _extract_housing(text: str) -> str:
    """Answer to the housing question. Homeless/unstable wording wins over
    renting/owning so "I rent but got evicted" keeps homeless services, and
    whole-word matching keeps "Currently without housing" from reading as
    "rent"."""
    for value, pattern in _HOUSING_ANSWER:
        if pattern.search(text):
            return value
    return "other"


def _extract_employment(text: str) -> str:
    t = text.lower()
    if "full" in t:
        return "full-time"
    if "part" in t:
        return "part-time"
    if "unemployed" in t or "looking" in t or "not working" in t:
        return "unemployed"
    if "retire" in t:
        return "retired"
    if "unable" in t or "disabled" in t or "disability" in t:
        return "disabled"
    return "unemployed"


def _extract_income(text: str) -> str:
    t = text.lower()
    if "under" in t or "less" in t:
        return "$0-$10,000"
    if "1,000" in t and "2,000" in t:
        return "$10,000-$20,000"
    if "2,000" in t or "3,500" in t:
        return "$20,000-$30,000"
    if "5,000" in t:
        return "$40,000-$50,000"
    if "over" in t:
        return "$60,000-$80,000"
    if "prefer" in t:
        return ""
    return "$20,000-$30,000"


def _extract_insurance(text: str) -> str:
    t = text.lower()
    if "employer" in t:
        return "employer"
    if "medicaid" in t:
        return "medicaid"
    if "medicare" in t:
        return "medicare"
    if "marketplace" in t or "aca" in t:
        return "marketplace"
    if "no " in t or "uninsured" in t or "none" in t or "don't" in t:
        return "uninsured"
    return "unknown"


def _extract_initial_needs(text: str) -> list[str]:
    t = text.lower()
    needs: list[str] = []
    mapping = {
        "food": ["food", "hungry", "groceries", "eat", "snap", "nutrition"],
        "healthcare": ["health", "medical", "doctor", "clinic", "sick", "dental"],
        "housing": ["housing", "rent", "apartment", "shelter", "evict", "homeless"],
        "employment": ["job", "work", "employ", "career", "lost my job", "laid off"],
        "childcare": ["childcare", "daycare", "child care", "babysit", "preschool"],
        "utilities": ["utility", "utilities", "electric", "water", "bill"],
        "legal": ["legal", "lawyer", "court"],
        "transportation": ["transport", "bus", "ride"],
        "mental health": ["mental", "counseling", "therapy", "depress", "anxiety"],
    }
    for need, keywords in mapping.items():
        if any(kw in t for kw in keywords):
            needs.append(need)
    return needs


def _extract_additional_needs(text: str) -> list[str]:
    t = text.lower()
    needs: list[str] = []
    if "child" in t:
        needs.append("childcare")
    if "legal" in t:
        needs.append("legal")
    if "transport" in t or "bus" in t:
        needs.append("transportation")
    if "mental" in t or "counseling" in t:
        needs.append("healthcare")
    if "disab" in t:
        needs.append("disability")
    if "senior" in t or "elder" in t or "aging" in t:
        needs.append("senior")
    return needs


# Profile field each scripted question collects, keyed by DEMO_STEPS index.
_DEMO_STEP_FIELDS: dict[int, str] = {
    1: "household_size",
    2: "zip_code",
    3: "housing_situation",
    4: "employment_status",
    5: "income_bracket",
    6: "insurance_status",
}

_COUNT_WORDS = {
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
    "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
}
_COUNT = r"(\d{1,2}|" + "|".join(_COUNT_WORDS) + r")"
_STATED_HOUSEHOLD_RE = re.compile(
    rf"\b{_COUNT}\s+(?:people|persons|of us)\b|\b(?:family|household)\s+of\s+{_COUNT}\b",
    re.IGNORECASE,
)
_SOLO_RE = re.compile(r"\b(?:just me|i live alone|by myself)\b", re.IGNORECASE)
_HOMELESS_RE = re.compile(
    r"\b(?:homeless|unhoused|in a shelter|(?:sleep(?:ing)?|liv(?:e|ing)) in (?:my|our|a|the) (?:car|truck|van)"
    r"|on the streets?)\b",
    re.IGNORECASE,
)
# Losing housing, or housed only temporarily. Eviction is here, not under
# renting: someone evicted with nowhere to go qualifies for homeless services.
_UNSTABLE_RE = re.compile(
    r"\b(?:couch[- ]?surfing|staying with (?:friends|family|a friend|relatives)"
    r"|evict(?:ed|ion|ing)?|kicked (?:me |us )?out|nowhere (?:to|else to) (?:go|live|stay|sleep)"
    r"|no(?:where| place) to (?:go|live|stay|sleep)|losing (?:my|our) (?:home|house|apartment|place)"
    r"|foreclos(?:ure|ed|ing))\b",
    re.IGNORECASE,
)
# Only explicit first-person statements. Inferred housing skips the housing
# question, and renting/own_home rule out homeless services, so a passing
# mention ("help with rent", "my landlord") must leave the field unknown.
_STATED_HOUSING: list[tuple[str, re.Pattern[str]]] = [
    ("homeless", _HOMELESS_RE),
    ("unstable", _UNSTABLE_RE),
    ("renting", re.compile(
        r"\b(?:i|we) (?:currently )?rent\b|\b(?:i'?m|i am|we'?re|we are) renting\b", re.IGNORECASE,
    )),
    ("own_home", re.compile(
        r"\b(?:i|we) own (?:my|our|a) (?:home|house)\b|\bhomeowners?\b", re.IGNORECASE,
    )),
]
# Direct answers to the housing question (buttons or free text), in
# precedence order.
_HOUSING_ANSWER: list[tuple[str, re.Pattern[str]]] = [
    ("homeless", re.compile(r"\bwithout (?:housing|a home)\b|\bshelter\b", re.IGNORECASE)),
    ("homeless", _HOMELESS_RE),
    ("unstable", _UNSTABLE_RE),
    ("renting", re.compile(r"\brent(?:ing|er)?\b", re.IGNORECASE)),
    ("own_home", re.compile(
        r"\bown (?:my |our |a |the )?(?:home|house|condo|place)\b|\bhomeowner\b|\bmortgage\b",
        re.IGNORECASE,
    )),
    ("unstable", re.compile(r"\b(?:friends?|family|staying|couch)\b", re.IGNORECASE)),
]
_STATED_EMPLOYMENT: list[tuple[str, re.Pattern[str]]] = [
    ("unemployed", re.compile(
        r"\b(?:lost my job|laid off|unemployed|not working|out of work|got fired)\b",
        re.IGNORECASE,
    )),
    ("part-time", re.compile(r"\bpart[- ]time\b", re.IGNORECASE)),
    ("full-time", re.compile(r"\bfull[- ]time\b", re.IGNORECASE)),
    ("retired", re.compile(r"\bretired\b", re.IGNORECASE)),
]
_STATED_UNINSURED_RE = re.compile(
    r"\b(?:no insurance|uninsured|don'?t have (?:health )?insurance"
    r"|lost (?:my )?(?:health )?(?:insurance|coverage))\b",
    re.IGNORECASE,
)


def _capture_stated_facts(session: IntakeSession) -> None:
    """Fill blank profile fields the resident already stated in passing.

    Scans every resident turn (including the life-event scenario answer the
    scripted step counter never sees) with high-confidence phrases only, so
    the scripted flow doesn't re-ask something the resident already said.
    """
    profile = session.extracted_profile
    if (
        not profile.employment_status
        and canonical_life_event_slug(session_life_event_slug(session)) == "lost-job"
    ):
        profile.employment_status = "unemployed"

    user_texts = [m.content for m in session.conversation if m.role == MessageRole.user]
    if not profile.housing_situation:
        # Precedence across all turns, not first turn wins: "I rent" early on
        # must not hide "we got evicted" later.
        profile.housing_situation = next(
            (
                value for value, pattern in _STATED_HOUSING
                if any(pattern.search(text) for text in user_texts)
            ),
            "",
        )

    for text in user_texts:
        if not profile.zip_code:
            profile.zip_code = _extract_zip(text)
        if profile.household_size is None:
            if _SOLO_RE.search(text):
                profile.household_size = 1
            elif hit := _STATED_HOUSEHOLD_RE.search(text):
                raw = (hit.group(1) or hit.group(2)).lower()
                profile.household_size = _COUNT_WORDS.get(raw) or int(raw)
            _infer_has_children(profile)
        if not profile.employment_status:
            profile.employment_status = next(
                (value for value, pattern in _STATED_EMPLOYMENT if pattern.search(text)), ""
            )
        if not profile.insurance_status and _STATED_UNINSURED_RE.search(text):
            profile.insurance_status = "uninsured"


def _infer_has_children(profile: ResidentProfile) -> None:
    """A household of 3+ suggests children; never infer the opposite.

    has_children=False would exclude family services, and a household of 2
    can be a single parent with one child, so smaller households stay
    unknown.
    """
    if profile.has_children is None and (profile.household_size or 0) >= 3:
        profile.has_children = True


def _next_unanswered_step(profile: ResidentProfile, step_idx: int) -> int:
    """First scripted question at or after ``step_idx`` whose field is blank."""
    while step_idx in _DEMO_STEP_FIELDS and getattr(profile, _DEMO_STEP_FIELDS[step_idx]) not in (None, ""):
        step_idx += 1
    return step_idx


async def demo_flow(session: IntakeSession, user_text: str, step_num: int) -> IntakeMessage:
    """Scripted fallback used when no API key is configured."""
    profile = session.extracted_profile

    if step_num == 1:
        needs = _extract_initial_needs(user_text)
        if needs:
            profile.immediate_needs = list(set(profile.immediate_needs + needs))
    elif step_num == 2:
        hs = _extract_household_size(user_text)
        if hs:
            profile.household_size = hs
            _infer_has_children(profile)
    elif step_num == 3:
        z = _extract_zip(user_text)
        if z:
            profile.zip_code = z
    elif step_num == 4:
        profile.housing_situation = _extract_housing(user_text)
    elif step_num == 5:
        profile.employment_status = _extract_employment(user_text)
    elif step_num == 6:
        profile.income_bracket = _extract_income(user_text)
    elif step_num == 7:
        profile.insurance_status = _extract_insurance(user_text)
    elif step_num >= 8:
        additional = _extract_additional_needs(user_text)
        profile.immediate_needs = list(set(profile.immediate_needs + additional))
        return await _complete_intake_demo(session)

    _capture_stated_facts(session)

    if step_num < len(DEMO_STEPS):
        next_step = _next_unanswered_step(profile, step_num)
        # Skipped questions never get an answer turn, so shift the step
        # counter forward by the same amount.
        session.scripted_turns_skipped -= next_step - step_num
        step = DEMO_STEPS[next_step]
        msg = IntakeMessage(
            role=MessageRole.assistant,
            content=step["message"],
            suggested_buttons=step.get("buttons", []),
            progress_percent=step.get("progress", 0),
        )
        session.conversation.append(msg)
        return msg
    return await _complete_intake_demo(session)


async def _complete_intake_demo(session: IntakeSession) -> IntakeMessage:
    profile = session.extracted_profile
    profile.languages_spoken = [session.language] if session.language != "en" else ["en"]

    matches = match_services(profile)
    risks = assess_risks(profile)
    benefits = calculate_benefits(profile, matches)

    session.matches = matches
    session.risk_flags = risks
    session.status = IntakeStatus.completed

    match_count = len(matches)
    high_matches = [m for m in matches if m.match_confidence == "high"]

    lines = [
        f"Great news! Based on what you've told me, I found **{match_count} services** that may be able to help you.",
    ]

    if benefits.get("total_monthly_value", 0) > 0:
        lines.append(
            f"\n**Estimated monthly benefit value: ${benefits['total_monthly_value']:,.0f}/month** "
            f"(${benefits['total_annual_value']:,.0f}/year)"
        )

    if high_matches:
        lines.append("\nHere are your top matches:\n")
        for i, m in enumerate(high_matches[:5], 1):
            lines.append(f"**{i}. {m.service.name}** — {m.match_reasoning}")

    if risks:
        critical = [r for r in risks if r.severity.value in ("critical", "high")]
        if critical:
            lines.append(
                "\n> **Important:** I've identified some urgent needs. "
                "A case worker may reach out to connect you with additional support."
            )

    lines.append("\nClick **View Full Results** to see all your matches with details on how to apply.")

    msg = IntakeMessage(
        role=MessageRole.assistant,
        content="\n".join(lines),
        progress_percent=100,
        is_complete=True,
        suggested_buttons=["View Full Results", "Start Over"],
    )
    session.conversation.append(msg)
    return msg

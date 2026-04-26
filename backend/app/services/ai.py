"""AI service for the guided intake conversation.

Live mode (default when ``OPENAI_API_KEY`` is set and ``DEMO_MODE`` is false)
runs an agent loop against the OpenAI **Responses API** with ``gpt-5.5`` at
``reasoning_effort="medium"``. The model has seven tools available to query
the catalog, persist profile fields, switch language, and finalize matches.

Fallback mode (no key, or ``DEMO_MODE=true``) uses a scripted nine-step
conversation so the demo still works without an API key.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from app.config import get_settings
from app.models import (
    IntakeMessage,
    IntakeSession,
    IntakeStatus,
    MessageRole,
    ResidentProfile,
)
from app.services import catalog
from app.services.matching import assess_risks, calculate_benefits, match_services

log = logging.getLogger(__name__)


# ── In-memory session store ───────────────────────────────────────────

_sessions: dict[str, IntakeSession] = {}


# ── Demo conversation steps (used when no API key) ───────────────────

_DEMO_STEPS: list[dict[str, Any]] = [
    {
        "message": (
            "Welcome to the Austin Service Guide! I'm here to help you find "
            "city and community services that fit your needs. This conversation "
            "is confidential and takes about 3-5 minutes.\n\n"
            "What brings you here today? Are you looking for help with something "
            "specific, or would you like me to walk you through a few questions?"
        ),
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


# ── Public entrypoints ───────────────────────────────────────────────

async def start_session(language: str = "en") -> IntakeSession:
    """Create a new intake session and seed the greeting."""
    session = IntakeSession(language=language)
    _sessions[session.id] = session

    settings = get_settings()
    if settings.use_live_ai:
        greeting_text = await _live_greeting(session)
    else:
        step = _DEMO_STEPS[0]
        greeting_text = step["message"]
        greeting = IntakeMessage(
            role=MessageRole.assistant,
            content=greeting_text,
            suggested_buttons=step["buttons"],
            progress_percent=step["progress"],
        )
        session.conversation.append(greeting)
        return session

    greeting = IntakeMessage(
        role=MessageRole.assistant,
        content=greeting_text,
        suggested_buttons=[],
        progress_percent=0,
    )
    session.conversation.append(greeting)
    return session


async def process_message(
    session_id: str,
    user_text: str,
    language: str = "en",
) -> IntakeMessage:
    """Process a user message and return the assistant's response."""
    session = _sessions.get(session_id)
    if not session:
        return IntakeMessage(
            role=MessageRole.assistant,
            content="Session not found. Please start a new conversation.",
            is_complete=True,
        )

    if language and language != session.language:
        session.language = language

    settings = get_settings()

    # Append the raw user message to our visible conversation
    session.conversation.append(IntakeMessage(
        role=MessageRole.user,
        content=user_text,
    ))

    # Backend-side crisis check (cheap safety net independent of the model)
    crisis_kind = _check_crisis(user_text)
    if crisis_kind:
        session.extracted_profile.crisis_indicators.append(crisis_kind)
        if crisis_kind == "immediate_danger":
            return _crisis_response(session)

    if settings.use_live_ai:
        try:
            return await _responses_flow(session, user_text)
        except Exception as exc:  # noqa: BLE001 — surface anything from the SDK
            log.exception("Responses API call failed; falling back to scripted demo")
            err_msg = IntakeMessage(
                role=MessageRole.assistant,
                content=(
                    "I hit a problem reaching the AI service "
                    f"(`{type(exc).__name__}: {exc}`). "
                    "Switching to the offline guided flow so we can keep going."
                ),
                progress_percent=0,
            )
            session.conversation.append(err_msg)
            user_msg_count = sum(1 for m in session.conversation if m.role == MessageRole.user)
            return await _demo_flow(session, user_text, user_msg_count)

    user_msg_count = sum(1 for m in session.conversation if m.role == MessageRole.user)
    return await _demo_flow(session, user_text, user_msg_count)


def get_session(session_id: str) -> IntakeSession | None:
    return _sessions.get(session_id)


# ─────────────────────────────────────────────────────────────────────
# Live (Responses API) flow
# ─────────────────────────────────────────────────────────────────────

_TOOL_SCHEMAS: list[dict[str, Any]] = [
    {
        "type": "function",
        "name": "search_services",
        "description": (
            "Keyword search the Austin service catalog. Use when the user "
            "describes a need so you can show concrete, relevant services. "
            "Always search in English (translate the user's words yourself "
            "if needed) — the catalog is English-canonical."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "English keywords or short phrase to search."},
                "category": {
                    "type": ["string", "null"],
                    "description": "Optional category slug filter, e.g. 'food', 'housing', 'healthcare'.",
                },
                "zip_code": {
                    "type": ["string", "null"],
                    "description": "Optional Austin zip code (e.g. '78741') to limit by proximity.",
                },
            },
            "required": ["query", "category", "zip_code"],
            "additionalProperties": False,
        },
        "strict": True,
    },
    {
        "type": "function",
        "name": "get_service_details",
        "description": "Return full details for one service by its slug.",
        "parameters": {
            "type": "object",
            "properties": {"slug": {"type": "string"}},
            "required": ["slug"],
            "additionalProperties": False,
        },
        "strict": True,
    },
    {
        "type": "function",
        "name": "get_crisis_resources",
        "description": (
            "Return 24/7 crisis hotlines (988, DV, Integral Care, etc.). "
            "Call this immediately when the user mentions suicidal thoughts, "
            "domestic violence, or being in danger."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "language": {
                    "type": ["string", "null"],
                    "description": "ISO language code to filter resources by language support.",
                }
            },
            "required": ["language"],
            "additionalProperties": False,
        },
        "strict": True,
    },
    {
        "type": "function",
        "name": "extract_profile",
        "description": (
            "Persist resident profile fields you've inferred from the "
            "conversation. Call this every time you learn a new fact "
            "(household size, zip, housing, income, etc.) so matching "
            "stays current. Pass only the fields you have evidence for."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "household_size": {"type": ["integer", "null"]},
                "zip_code": {"type": ["string", "null"]},
                "housing_situation": {
                    "type": ["string", "null"],
                    "description": "One of: renting, own_home, unstable, homeless, other.",
                },
                "employment_status": {
                    "type": ["string", "null"],
                    "description": "One of: full-time, part-time, unemployed, retired, disabled.",
                },
                "income_bracket": {
                    "type": ["string", "null"],
                    "description": "Bracket like '$0-$10,000' or '$20,000-$30,000'.",
                },
                "insurance_status": {
                    "type": ["string", "null"],
                    "description": "One of: employer, medicaid, medicare, marketplace, uninsured, unknown.",
                },
                "has_children": {"type": ["boolean", "null"]},
                "veteran_status": {"type": ["boolean", "null"]},
                "has_disability": {"type": ["boolean", "null"]},
                "immediate_needs": {
                    "type": ["array", "null"],
                    "items": {"type": "string"},
                    "description": "Lower-case English need keywords e.g. ['food', 'housing'].",
                },
            },
            "required": [
                "household_size", "zip_code", "housing_situation",
                "employment_status", "income_bracket", "insurance_status",
                "has_children", "veteran_status", "has_disability",
                "immediate_needs",
            ],
            "additionalProperties": False,
        },
        "strict": True,
    },
    {
        "type": "function",
        "name": "find_matching_services",
        "description": (
            "Run the rules-based matching engine on the current resident "
            "profile and return ranked services. Use this once you have "
            "enough profile data to give meaningful recommendations."
        ),
        "parameters": {"type": "object", "properties": {}, "additionalProperties": False, "required": []},
        "strict": True,
    },
    {
        "type": "function",
        "name": "set_language",
        "description": (
            "Switch the conversation language when the user writes in or "
            "asks for a different language. Use ISO codes ('es', 'vi', "
            "'zh', 'ar', 'en', etc.). After calling this, continue in the "
            "new language."
        ),
        "parameters": {
            "type": "object",
            "properties": {"code": {"type": "string"}},
            "required": ["code"],
            "additionalProperties": False,
        },
        "strict": True,
    },
    {
        "type": "function",
        "name": "complete_intake",
        "description": (
            "Finalize the intake: runs matching + risk + benefit estimation "
            "on the current profile, marks the session complete, and "
            "returns a structured summary you should weave into a warm "
            "closing message that invites the user to view full results."
        ),
        "parameters": {"type": "object", "properties": {}, "additionalProperties": False, "required": []},
        "strict": True,
    },
]


def _build_instructions(session: IntakeSession) -> str:
    """System instructions sent every Responses API call."""
    lang_note = (
        f"The resident's preferred language is '{session.language}'. "
        "Always respond in that language. If they switch languages mid-"
        "conversation, call set_language and switch with them."
    )

    profile = session.extracted_profile
    known: list[str] = []
    if profile.household_size:
        known.append(f"household_size={profile.household_size}")
    if profile.zip_code:
        known.append(f"zip={profile.zip_code}")
    if profile.housing_situation:
        known.append(f"housing={profile.housing_situation}")
    if profile.employment_status:
        known.append(f"employment={profile.employment_status}")
    if profile.income_bracket:
        known.append(f"income={profile.income_bracket}")
    if profile.insurance_status:
        known.append(f"insurance={profile.insurance_status}")
    if profile.immediate_needs:
        known.append(f"needs={profile.immediate_needs}")
    profile_note = (
        f"Currently known about the resident: {', '.join(known)}." if known
        else "Nothing is known about the resident yet."
    )

    return (
        "You are the intake assistant for the Austin Service Guide, a "
        "City of Austin / Austin Public Health portal that helps residents "
        "discover social services and benefits they may qualify for.\n\n"
        "Your job: have a brief, warm, non-clinical conversation (5-8 "
        "exchanges) to understand the resident's situation, then surface "
        "concrete services that fit. Ask one question at a time. Never "
        "moralize or lecture. Treat everyone with dignity regardless of "
        "income, status, or background.\n\n"
        "Tools you have:\n"
        "  - search_services: query the catalog when a need is named\n"
        "  - get_service_details: drill into a single service\n"
        "  - get_crisis_resources: surface 24/7 hotlines (call IMMEDIATELY "
        "for suicide, DV, immediate danger)\n"
        "  - extract_profile: persist facts as you learn them\n"
        "  - find_matching_services: run the matching engine\n"
        "  - set_language: switch language codes mid-conversation\n"
        "  - complete_intake: finalize and produce the summary\n\n"
        "Rules:\n"
        "  - Call extract_profile every time you learn a new fact.\n"
        "  - When you've gathered enough (household, zip, housing, "
        "employment, income, insurance, plus stated needs), call "
        "complete_intake and weave the returned summary into a warm "
        "closing message.\n"
        "  - The catalog is English-canonical: search in English even if "
        "the conversation is in another language; translate results when "
        "you cite them.\n"
        "  - Never invent services not returned by your tools.\n\n"
        f"{lang_note}\n{profile_note}"
    )


async def _live_greeting(session: IntakeSession) -> str:
    """Generate the opening greeting via the Responses API."""
    settings = get_settings()
    from openai import AsyncOpenAI

    client = AsyncOpenAI(api_key=settings.openai_api_key)
    instructions = _build_instructions(session)

    seed_input = [{
        "role": "user",
        "content": (
            "Begin the intake. Greet the resident warmly in their preferred "
            "language, briefly explain you'll ask a few questions to find "
            "services that fit, mention the conversation is confidential "
            "and takes 3-5 minutes, and end with an open question about "
            "what brings them here today."
        ),
    }]

    response = await client.responses.create(
        model=settings.openai_model,
        instructions=instructions,
        input=seed_input,
        reasoning={"effort": settings.openai_reasoning_effort},
        max_output_tokens=600,
    )
    text = (response.output_text or "").strip()

    # Don't seed responses_input with the synthetic prompt — start with a
    # clean slate where the model's greeting is the first assistant message.
    session.responses_input = [
        {"role": "assistant", "content": text or _DEMO_STEPS[0]["message"]},
    ]
    return text or _DEMO_STEPS[0]["message"]


async def _responses_flow(session: IntakeSession, user_text: str) -> IntakeMessage:
    """Run a single user turn through the Responses API agent loop."""
    settings = get_settings()
    from openai import AsyncOpenAI

    client = AsyncOpenAI(api_key=settings.openai_api_key)

    # Append the new user message to the rolling Responses-API context
    session.responses_input.append({"role": "user", "content": user_text})

    crisis_seen = False
    iterations = 0
    final_text = ""

    while iterations <= settings.openai_max_tool_iterations:
        instructions = _build_instructions(session)

        response = await client.responses.create(
            model=settings.openai_model,
            instructions=instructions,
            input=session.responses_input,
            tools=_TOOL_SCHEMAS,
            reasoning={"effort": settings.openai_reasoning_effort},
            max_output_tokens=2000,
        )

        # Persist every output item (reasoning, text, tool calls) so the
        # next turn has full context — required for reasoning models.
        for item in response.output:
            session.responses_input.append(_item_to_dict(item))

        function_calls = [
            it for it in response.output if getattr(it, "type", None) == "function_call"
        ]

        if function_calls:
            for fc in function_calls:
                args: dict[str, Any] = {}
                if fc.arguments:
                    try:
                        args = json.loads(fc.arguments)
                    except json.JSONDecodeError:
                        args = {}
                output_str, fired_crisis = _dispatch_tool(session, fc.name, args)
                crisis_seen = crisis_seen or fired_crisis
                session.responses_input.append({
                    "type": "function_call_output",
                    "call_id": fc.call_id,
                    "output": output_str,
                })
            iterations += 1
            continue

        final_text = (response.output_text or "").strip()
        break
    else:
        # Loop hit the iteration cap without producing text
        final_text = (
            "I gathered some information for you but ran out of time to "
            "finish. Tap 'View Results' to see what I have so far."
        )

    if not final_text:
        final_text = "Could you tell me a bit more about what you're looking for?"

    msg = IntakeMessage(
        role=MessageRole.assistant,
        content=final_text,
        suggested_buttons=[],
        progress_percent=_estimate_progress(session.extracted_profile),
        is_complete=session.status == IntakeStatus.completed,
        crisis_detected=crisis_seen,
    )
    session.conversation.append(msg)
    return msg


def _item_to_dict(item: Any) -> dict[str, Any]:
    """Best-effort conversion of a Responses output item to a dict.

    The OpenAI SDK returns Pydantic models; ``model_dump`` keeps the shape
    the API expects when we send the same items back as ``input`` next turn.
    """
    if hasattr(item, "model_dump"):
        return item.model_dump(exclude_none=True, mode="json")
    if isinstance(item, dict):
        return item
    return json.loads(json.dumps(item, default=str))


# ── Tool dispatch ────────────────────────────────────────────────────

def _dispatch_tool(
    session: IntakeSession,
    name: str,
    args: dict[str, Any],
) -> tuple[str, bool]:
    """Execute a tool call locally. Returns (json_output, crisis_fired)."""
    try:
        if name == "search_services":
            return _tool_search_services(args), False
        if name == "get_service_details":
            return _tool_get_service_details(args), False
        if name == "get_crisis_resources":
            return _tool_get_crisis_resources(session, args), True
        if name == "extract_profile":
            return _tool_extract_profile(session, args), False
        if name == "find_matching_services":
            return _tool_find_matching_services(session), False
        if name == "set_language":
            return _tool_set_language(session, args), False
        if name == "complete_intake":
            return _tool_complete_intake(session), False
        return json.dumps({"error": f"unknown tool: {name}"}), False
    except Exception as exc:  # noqa: BLE001
        log.exception("Tool %s failed", name)
        return json.dumps({"error": f"{type(exc).__name__}: {exc}"}), False


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
    slug = args.get("slug", "")
    svc = catalog.get_service_by_slug(slug)
    if not svc:
        return json.dumps({"error": f"no service with slug '{slug}'"})
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


def _tool_extract_profile(session: IntakeSession, args: dict[str, Any]) -> str:
    profile = session.extracted_profile
    applied: dict[str, Any] = {}
    for key in (
        "household_size", "zip_code", "housing_situation",
        "employment_status", "income_bracket", "insurance_status",
        "has_children", "veteran_status", "has_disability",
    ):
        val = args.get(key)
        if val is None:
            continue
        if key == "zip_code" and not str(val).strip():
            continue
        setattr(profile, key, val)
        applied[key] = val

    needs = args.get("immediate_needs")
    if needs:
        merged = list({*profile.immediate_needs, *[n.lower() for n in needs]})
        profile.immediate_needs = merged
        applied["immediate_needs"] = merged

    return json.dumps({"applied": applied, "profile_complete": _profile_completeness(profile)})


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
    code = (args.get("code") or "en").strip().lower()
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


def _estimate_progress(profile: ResidentProfile) -> int:
    return min(95, _profile_completeness(profile))


# ─────────────────────────────────────────────────────────────────────
# Crisis detection (backend-side safety net)
# ─────────────────────────────────────────────────────────────────────

def _check_crisis(text: str) -> str:
    t = text.lower()
    if any(w in t for w in ["kill myself", "suicide", "want to die", "end my life", "self-harm"]):
        return "suicidal_ideation"
    if any(w in t for w in ["hitting me", "beats me", "abusing me", "domestic violence", "he hurts", "she hurts", "afraid of my partner"]):
        return "domestic_violence"
    if any(w in t for w in ["in danger", "not safe", "threatened", "going to hurt me"]):
        return "immediate_danger"
    return ""


def _crisis_response(session: IntakeSession) -> IntakeMessage:
    msg = IntakeMessage(
        role=MessageRole.assistant,
        content=(
            "I hear you, and I want you to know that help is available right now.\n\n"
            "**If you are in immediate danger, call 9-1-1.**\n\n"
            "Here are crisis resources available 24/7:\n\n"
            "- **988 Suicide & Crisis Lifeline** — Call or text **988**\n"
            "- **Integral Care Crisis Line** — **512-472-4357**\n"
            "- **SAFE Alliance (DV/SA)** — **512-267-7233**\n"
            "- **National DV Hotline** — **1-800-799-7233**\n\n"
            "You don't have to go through this alone. Would you like to continue "
            "finding services, or would you prefer to connect with a crisis counselor?"
        ),
        crisis_detected=True,
        suggested_buttons=["Connect with crisis counselor", "Continue finding services"],
        progress_percent=0,
    )
    session.conversation.append(msg)
    return msg


# ─────────────────────────────────────────────────────────────────────
# Scripted demo flow (used when no API key)
# ─────────────────────────────────────────────────────────────────────

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
    t = text.lower()
    if "rent" in t:
        return "renting"
    if "own" in t:
        return "own_home"
    if "friend" in t or "family" in t or "staying" in t or "couch" in t:
        return "unstable"
    if "without" in t or "homeless" in t or "shelter" in t:
        return "homeless"
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


async def _demo_flow(session: IntakeSession, user_text: str, step_num: int) -> IntakeMessage:
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
            profile.has_children = hs >= 3
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

    if step_num < len(_DEMO_STEPS):
        step = _DEMO_STEPS[step_num]
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

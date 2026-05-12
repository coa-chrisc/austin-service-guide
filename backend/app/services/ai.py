"""AI service for the guided intake conversation.

Live mode (default when ``OPENAI_API_KEY`` is set and ``DEMO_MODE`` is false)
runs an agent loop against the OpenAI **Responses API** with ``gpt-5.5`` at
``reasoning_effort="medium"``. The model has eight tools available to query
the catalog, persist profile fields, switch language, and finalize matches.

Fallback mode (no key, or ``DEMO_MODE=true``) uses a scripted nine-step
conversation so the demo still works without an API key.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
from collections import deque
from datetime import datetime
from pathlib import Path
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

# Plan-build tasks/results keyed by session_id. Populated when the model
# calls complete_intake; awaited (or computed lazily) when /results is hit.
_plan_tasks: dict[str, "asyncio.Task[dict]"] = {}
_plan_cache: dict[str, dict] = {}

# Bounded in-memory debug traces for Realtime voice sessions. This is
# intentionally lightweight for local/dev troubleshooting; production can
# swap this behind the same helpers for structured log storage.
_MAX_REALTIME_DEBUG_EVENTS = 500
_MAX_REALTIME_DEBUG_TEXT = 1000
_MAX_REALTIME_DEBUG_FILE_READ = 10000
_BACKEND_ROOT = Path(__file__).resolve().parents[2]
_realtime_debug_logs: dict[str, list[dict[str, Any]]] = {}
_realtime_debug_seq: dict[str, int] = {}


_LANGUAGE_NAMES: dict[str, str] = {
    "en": "English",
    "es": "Spanish",
    "zh": "Mandarin Chinese",
    "hi": "Hindi",
    "ar": "Arabic",
    "vi": "Vietnamese",
    "fr": "French",
    "ko": "Korean",
}


def _clip_debug_text(value: str, limit: int = _MAX_REALTIME_DEBUG_TEXT) -> str:
    text = value.strip()
    if len(text) <= limit:
        return text
    return f"{text[:limit]}... [truncated {len(text) - limit} chars]"


def _sanitize_debug_value(value: Any, depth: int = 0) -> Any:
    """Keep debug payloads useful without letting them become huge."""
    if depth > 4:
        return _clip_debug_text(str(value), 300)
    if value is None or isinstance(value, (bool, int, float)):
        return value
    if isinstance(value, str):
        return _clip_debug_text(value)
    if isinstance(value, dict):
        cleaned: dict[str, Any] = {}
        for idx, (key, child) in enumerate(value.items()):
            if idx >= 50:
                cleaned["_truncated_keys"] = len(value) - idx
                break
            cleaned[_clip_debug_text(str(key), 120)] = _sanitize_debug_value(
                child,
                depth + 1,
            )
        return cleaned
    if isinstance(value, (list, tuple, set)):
        items = list(value)
        cleaned_items = [_sanitize_debug_value(item, depth + 1) for item in items[:40]]
        if len(items) > 40:
            cleaned_items.append({"_truncated_items": len(items) - 40})
        return cleaned_items
    return _clip_debug_text(str(value))


def _realtime_debug_log_path() -> Path:
    configured = get_settings().realtime_debug_log_path
    path = Path(configured)
    if not path.is_absolute():
        path = _BACKEND_ROOT / path
    return path


def _append_realtime_debug_log(entry: dict[str, Any]) -> None:
    if not get_settings().realtime_debug_log_enabled:
        return
    try:
        path = _realtime_debug_log_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except Exception:  # noqa: BLE001
        log.exception("Failed to write Realtime debug log")


def _read_realtime_debug_file(
    session_id: str | None = None,
    limit: int = _MAX_REALTIME_DEBUG_FILE_READ,
) -> list[dict[str, Any]]:
    safe_limit = max(1, min(_MAX_REALTIME_DEBUG_FILE_READ, limit))
    path = _realtime_debug_log_path()
    if not path.exists():
        return []

    events: deque[dict[str, Any]] = deque(maxlen=safe_limit)
    try:
        with path.open("r", encoding="utf-8") as handle:
            for line in handle:
                if not line.strip():
                    continue
                try:
                    entry = json.loads(line)
                except json.JSONDecodeError:
                    continue
                if not isinstance(entry, dict):
                    continue
                if session_id and entry.get("session_id") != session_id:
                    continue
                events.append(entry)
    except OSError:
        log.exception("Failed to read Realtime debug log")
        return []
    return list(events)


def record_realtime_debug_event(
    session_id: str,
    event: dict[str, Any],
) -> dict[str, Any]:
    """Store a bounded Realtime troubleshooting event for an intake session.

    Short-circuits entirely when REALTIME_DEBUG_LOG_ENABLED is false so the
    default-off privacy posture also covers in-memory storage and log lines.
    """
    if not get_settings().realtime_debug_log_enabled:
        return {}
    _realtime_debug_seq[session_id] = _realtime_debug_seq.get(session_id, 0) + 1
    detail = event.get("detail", {})
    entry = {
        "session_id": session_id,
        "seq": _realtime_debug_seq[session_id],
        "timestamp": f"{datetime.utcnow().isoformat()}Z",
        "event": _clip_debug_text(str(event.get("event") or event.get("type") or "event"), 120),
        "source": _clip_debug_text(str(event.get("source") or "server"), 40),
        "status": (
            _clip_debug_text(str(event.get("status")), 80)
            if event.get("status") is not None
            else None
        ),
        "detail": _sanitize_debug_value(detail if isinstance(detail, dict) else {"value": detail}),
    }
    bucket = _realtime_debug_logs.setdefault(session_id, [])
    bucket.append(entry)
    if len(bucket) > _MAX_REALTIME_DEBUG_EVENTS:
        del bucket[: len(bucket) - _MAX_REALTIME_DEBUG_EVENTS]
    _append_realtime_debug_log(entry)
    log.info(
        "Realtime debug session=%s seq=%s event=%s source=%s status=%s",
        session_id,
        entry["seq"],
        entry["event"],
        entry["source"],
        entry["status"],
    )
    return entry


def get_realtime_debug_events(session_id: str, limit: int = 200) -> list[dict[str, Any]]:
    """Return the latest Realtime troubleshooting events for a session."""
    safe_limit = max(1, min(500, limit))
    file_events = _read_realtime_debug_file(session_id=session_id, limit=safe_limit)
    if file_events:
        return file_events[-safe_limit:]
    return list(_realtime_debug_logs.get(session_id, [])[-safe_limit:])


def get_realtime_debug_sessions(limit: int = 20) -> list[dict[str, Any]]:
    """Return recent Realtime sessions with enough signal to pick a trace."""
    safe_limit = max(1, min(100, limit))
    events = _read_realtime_debug_file(limit=_MAX_REALTIME_DEBUG_FILE_READ)
    seen = {
        (
            entry.get("session_id"),
            entry.get("seq"),
            entry.get("timestamp"),
            entry.get("event"),
            entry.get("source"),
        )
        for entry in events
    }
    for session_id, bucket in _realtime_debug_logs.items():
        for entry in bucket:
            identity = (
                session_id,
                entry.get("seq"),
                entry.get("timestamp"),
                entry.get("event"),
                entry.get("source"),
            )
            if identity not in seen:
                events.append(entry)
                seen.add(identity)

    sessions: dict[str, dict[str, Any]] = {}
    for entry in events:
        session_id = str(entry.get("session_id") or "")
        if not session_id:
            continue
        event_name = str(entry.get("event") or "")
        status = entry.get("status")
        timestamp = str(entry.get("timestamp") or "")
        detail = entry.get("detail") if isinstance(entry.get("detail"), dict) else {}
        summary = sessions.setdefault(
            session_id,
            {
                "session_id": session_id,
                "first_timestamp": timestamp,
                "last_timestamp": timestamp,
                "event_count": 0,
                "last_event": event_name,
                "last_status": status,
                "has_error": False,
                "has_thinking_timeout": False,
                "has_completion": False,
                "response_create_count": 0,
                "tool_call_count": 0,
                "last_progress_percent": None,
            },
        )
        summary["event_count"] += 1
        if timestamp and (
            not summary["first_timestamp"] or timestamp < summary["first_timestamp"]
        ):
            summary["first_timestamp"] = timestamp
        if timestamp and (
            not summary["last_timestamp"] or timestamp >= summary["last_timestamp"]
        ):
            summary["last_timestamp"] = timestamp
            summary["last_event"] = event_name
            summary["last_status"] = status
        if "error" in event_name.lower() or status in {"error", "failed", "not_found"}:
            summary["has_error"] = True
        if event_name == "thinking_timeout":
            summary["has_thinking_timeout"] = True
        if event_name in {
            "completion_finish_scheduled",
            "completion_finish_from_tool_result",
            "completion_voice_timeout_finalized",
        }:
            summary["has_completion"] = True
        if event_name in {"response_create_sent", "startup_response_create_sent"}:
            summary["response_create_count"] += 1
        if event_name == "tool_call_completed":
            summary["tool_call_count"] += 1
        progress = detail.get("progress_percent") if detail else None
        if isinstance(progress, (int, float)):
            summary["last_progress_percent"] = int(progress)

    return sorted(
        sessions.values(),
        key=lambda item: str(item.get("last_timestamp") or ""),
        reverse=True,
    )[:safe_limit]


def _summarize_realtime_tool_output(output: str) -> dict[str, Any]:
    try:
        parsed = json.loads(output)
    except json.JSONDecodeError:
        return {"text": _clip_debug_text(output, 500)}

    if not isinstance(parsed, dict):
        return {"value": _sanitize_debug_value(parsed)}

    summary: dict[str, Any] = {
        "keys": sorted(str(key) for key in parsed.keys())[:20],
    }
    for key in (
        "error",
        "deferred",
        "action",
        "missing_fields",
        "next_question",
        "wait",
        "no_response",
        "count",
        "match_count",
        "summary",
    ):
        if key in parsed:
            summary[key] = _sanitize_debug_value(parsed[key])
    if "results" in parsed and isinstance(parsed["results"], list):
        summary["result_count"] = len(parsed["results"])
    return summary


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

async def start_session(
    language: str = "en",
    life_event: str | None = None,
    focus: list[str] | None = None,
    mode: str = "text",
) -> IntakeSession:
    """Create a new intake session and seed the greeting.

    `focus` narrows the initial need list to a specific subset of category
    slugs — used by external entry points (e.g. the lifespan calculator)
    that already know which categories matter for this resident.
    """
    session = IntakeSession(language=language)
    if life_event:
        session.extracted_profile.immediate_needs = _needs_from_life_event(life_event)
        session.persona_note = _life_event_context(life_event)
        session.entry_source = f"life-event:{_normalize_life_event(life_event)}"
    if focus:
        cleaned = [c.strip() for c in focus if c and c.strip()]
        if cleaned:
            session.extracted_profile.immediate_needs = cleaned
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
        crisis_msg = _crisis_response(session)
        # Mirror the exchange into the Responses-API context so a subsequent
        # turn (e.g., "Continue finding services") has the prior crisis
        # context. Otherwise _responses_flow would resume with no record of
        # what was discussed.
        session.responses_input.append({"role": "user", "content": user_text})
        session.responses_input.append(
            {"role": "assistant", "content": crisis_msg.content}
        )
        return crisis_msg

    scenario_followup = _scenario_first_followup(session, user_text)
    if scenario_followup is not None:
        return scenario_followup

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


async def start_persona_session(persona_id: str) -> IntakeSession | None:
    """Create an intake session pre-seeded by a demo persona.

    Hybrid flow: the seeded profile is a hypothesis, not a fact. The
    persona's opening_message is injected as the first user turn, the
    live LLM responds in character, and the model can call
    extract_profile to overwrite seeds based on what the resident
    actually says next. Falls back to the scripted demo flow when
    live AI is disabled.
    """
    from copy import deepcopy

    from app.services.personas import get_persona

    persona = get_persona(persona_id)
    if persona is None:
        return None

    session = IntakeSession(language=persona.language)
    session.extracted_profile = deepcopy(persona.seed_profile)
    session.persona_note = persona.persona_note
    session.entry_source = f"persona:{persona.id}"
    _sessions[session.id] = session

    # Surface the opening message in the visible chat transcript.
    session.conversation.append(IntakeMessage(
        role=MessageRole.user,
        content=persona.opening_message,
    ))

    # Demo personas are deterministic: seed the profile, run matching,
    # mark completed, and return immediately. The frontend replays the
    # persona's scripted conversation client-side, then routes to the
    # populated /results page. We never await the live LLM here — that's
    # what the regular "Get Started" flow is for.
    profile = session.extracted_profile
    profile.languages_spoken = [session.language] if session.language != "en" else ["en"]
    session.matches = match_services(profile)
    session.risk_flags = assess_risks(profile)
    session.status = IntakeStatus.completed
    return session


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
                "is_outdoor_worker": {
                    "type": ["boolean", "null"],
                    "description": "True if the resident or someone in the household works primarily outdoors (construction, landscaping, agriculture, delivery on foot/bike, etc.).",
                },
                "has_ac": {
                    "type": ["boolean", "null"],
                    "description": "True if the home has working air conditioning.",
                },
                "has_chronic_conditions": {
                    "type": ["boolean", "null"],
                    "description": "True if the resident has chronic conditions that compound heat risk (cardiovascular, respiratory, diabetes, kidney, pregnancy, age 65+).",
                },
                "is_refugee_or_immigrant": {
                    "type": ["boolean", "null"],
                    "description": "True if the resident self-identifies as a refugee, asylee, or recent immigrant.",
                },
                "primary_language": {
                    "type": ["string", "null"],
                    "description": "ISO code of the resident's primary spoken language (e.g. 'es', 'ar', 'vi'). May differ from the conversation language.",
                },
                "school_age_children": {
                    "type": ["array", "null"],
                    "description": "K-12 children in the household. Populate when the resident mentions school, grade level, or concerns about a child.",
                    "items": {
                        "type": "object",
                        "properties": {
                            "grade": {"type": "string", "description": "Grade level e.g. 'K', '7', '10'."},
                            "district": {"type": "string", "description": "School district e.g. 'AISD', 'Del Valle ISD'."},
                            "concerns": {
                                "type": "array",
                                "items": {"type": "string"},
                                "description": "Lower-case concern tags e.g. ['anxiety', 'attendance', 'behavior', 'bullying'].",
                            },
                        },
                        "required": ["grade", "district", "concerns"],
                        "additionalProperties": False,
                    },
                },
            },
            "required": [
                "household_size", "zip_code", "housing_situation",
                "employment_status", "income_bracket", "insurance_status",
                "has_children", "veteran_status", "has_disability",
                "immediate_needs",
                "is_outdoor_worker", "has_ac", "has_chronic_conditions",
                "is_refugee_or_immigrant", "primary_language",
                "school_age_children",
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
    {
        "type": "function",
        "name": "wait_for_user",
        "description": (
            "Realtime voice only: call this when the latest audio should not "
            "receive a spoken response, such as silence, background noise, "
            "TV or hold audio, side conversation, or speech not addressed to "
            "the assistant. This ends the turn without speaking."
        ),
        "parameters": {"type": "object", "properties": {}, "additionalProperties": False, "required": []},
        "strict": True,
    },
]


def get_realtime_tool_schemas() -> list[dict[str, Any]]:
    """Return tool schemas in the shape accepted by Realtime sessions."""
    return [
        {k: v for k, v in schema.items() if k != "strict"}
        for schema in _TOOL_SCHEMAS
    ]


def _format_known_facts(session: IntakeSession) -> str:
    """Compact key=value snapshot of fields the model has already captured."""
    profile = session.extracted_profile
    parts: list[str] = []
    # Use canonical field names that match extract_profile's parameter
    # schema so the model can map the snapshot to the underlying tool
    # arguments without a translation step.
    if profile.immediate_needs:
        # Sort + pipe-join so equivalent sets always serialize the same way.
        # immediate_needs is merged through a set in _tool_extract_profile,
        # so without this the diff check against lastPushedInstructions
        # would trip on cosmetic reordering and emit spurious session.update.
        needs = sorted({str(n) for n in profile.immediate_needs})
        parts.append("immediate_needs=" + "|".join(needs))
    if profile.household_size:
        parts.append(f"household_size={profile.household_size}")
    if profile.zip_code:
        parts.append(f"zip_code={profile.zip_code}")
    if profile.housing_situation:
        parts.append(f"housing_situation={profile.housing_situation}")
    if profile.employment_status:
        parts.append(f"employment_status={profile.employment_status}")
    if profile.income_bracket:
        parts.append(f"income_bracket={profile.income_bracket}")
    if profile.insurance_status:
        parts.append(f"insurance_status={profile.insurance_status}")
    # For bool|None fields, emit both true and false so an explicit "no" is
    # captured in the snapshot — otherwise the model may re-ask a question
    # the resident has already answered negatively.
    if profile.has_children is not None:
        parts.append(f"has_children={str(profile.has_children).lower()}")
    if profile.veteran_status is not None:
        parts.append(f"veteran_status={str(profile.veteran_status).lower()}")
    if profile.has_disability is not None:
        parts.append(f"has_disability={str(profile.has_disability).lower()}")
    if profile.is_outdoor_worker is not None:
        parts.append(
            f"is_outdoor_worker={str(profile.is_outdoor_worker).lower()}"
        )
    if profile.has_ac is not None:
        parts.append(f"has_ac={str(profile.has_ac).lower()}")
    if profile.has_chronic_conditions is not None:
        parts.append(
            f"has_chronic_conditions={str(profile.has_chronic_conditions).lower()}"
        )
    if profile.is_refugee_or_immigrant is not None:
        parts.append(
            f"is_refugee_or_immigrant={str(profile.is_refugee_or_immigrant).lower()}"
        )
    if profile.primary_language:
        parts.append(f"primary_language={profile.primary_language}")
    if profile.school_age_children:
        parts.append(
            "school_age_children=" + ", ".join(
                f"grade {c.grade}/{c.district or '?'}/concerns={c.concerns or '[]'}"
                for c in profile.school_age_children
            )
        )
    return ", ".join(parts) if parts else "none yet"


def _build_instructions(session: IntakeSession) -> str:
    """System instructions sent every Responses API call."""
    lang_code = (session.language or "en").split("-")[0].lower()
    lang_name = _LANGUAGE_NAMES.get(lang_code, session.language or "English")
    lang_note = (
        f"The resident's selected language is {lang_name} "
        f"(ISO code '{session.language or 'en'}'). Always greet and respond "
        "in that language unless the resident clearly uses or asks for a "
        "different language. If they switch languages mid-conversation, call "
        "set_language and switch with them."
    )

    facts = _format_known_facts(session)
    profile_note = (
        f"Currently known about the resident: {facts}." if facts != "none yet"
        else "Nothing is known about the resident yet."
    )

    base = (
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
        "  - complete_intake: finalize and produce the summary\n"
        "  - wait_for_user: realtime voice only; stay quiet when audio is "
        "not addressed to you\n\n"
        "Tool rules:\n"
        "  - Use only tools that are explicitly listed here. Never invent, "
        "simulate, or claim results from an unavailable tool.\n"
        "  - Only say a lookup, save, or plan step is complete after the "
        "relevant tool succeeds. If a tool fails, explain briefly in plain "
        "language and choose a useful next step; do not expose raw errors.\n"
        "  - If a tool returns deferred=true or missing_fields, do not mention "
        "services or the tool. Ask the next_question from the tool result in "
        "plain language and continue the interview.\n"
        "  - search_services, extract_profile, find_matching_services, "
        "set_language, and complete_intake are low-risk intake tools. Do "
        "not ask for confirmation before calling them when intent and "
        "required fields are clear.\n"
        "  - get_crisis_resources is urgent and should be called immediately "
        "for suicidal thoughts, domestic violence, or immediate danger.\n\n"
        "Listening rules (read these every turn before you speak):\n"
        "  - Before asking any intake question, scan the resident's prior "
        "turns in this conversation AND the 'Currently known' snapshot "
        "below. If they have already named that fact in their own words, "
        "treat it as captured and move to the next missing field instead "
        "of asking again. Never ask a resident a question whose answer "
        "they just gave you.\n"
        "  - When a resident packs multiple facts into one turn (for "
        "example 'I'm worried about rent, I'm already behind, and I lost "
        "my job'), make a single extract_profile call that captures every "
        "implied field at once — immediate_needs, housing_situation, "
        "employment_status — before asking the next question. Do not "
        "extract one field per turn when several are stated together.\n"
        "  - Treat the 'Currently known' snapshot below and the "
        "current_known_facts field returned by extract_profile as "
        "authoritative. If a field appears there, do not re-ask for it.\n\n"
        "Rules:\n"
        "  - Call extract_profile every time you learn a new fact. "
        "When the resident describes someone else's situation (parent of a "
        "student, child of an outdoor worker, caller on behalf of a "
        "neighbor), still capture facts about the affected person — that's "
        "who matching is for.\n"
        "  - Listen for these specific signals and capture them when "
        "present: outdoor work + heat exposure (is_outdoor_worker, has_ac, "
        "has_chronic_conditions); K-12 children with mental-health, "
        "attendance, or behavior concerns (school_age_children); refugee "
        "or recent-immigrant status with coordination/language barriers "
        "(is_refugee_or_immigrant, primary_language).\n"
        "  - When you've gathered enough (household, zip, housing, "
        "employment, income, insurance, plus stated needs), call "
        "complete_intake and weave the returned summary into a warm "
        "closing message.\n"
        "  - If the resident names housing, rent, eviction, homelessness, "
        "shelter, or veteran housing AND housing_situation is not yet in "
        "the 'Currently known' snapshot AND they have not already named "
        "their current housing situation in their own words, your next "
        "resident-facing question must ask about their current housing "
        "situation before asking for zip code, income, insurance, or "
        "services. If they already said it (for example 'I'm behind on "
        "rent', 'I'm staying in my car', 'I'm in a shelter'), capture it "
        "with extract_profile and skip ahead.\n"
        "  - The catalog is English-canonical: search in English even if "
        "the conversation is in another language; translate results when "
        "you cite them.\n"
        "  - Never invent services not returned by your tools.\n\n"
        f"{lang_note}\n{profile_note}"
    )

    if session.persona_note:
        base += (
            "\n\n--- Active scenario contract: highest priority ---\n"
            "This contract overrides the generic intake order. Follow the "
            "selected scenario path before moving into generic eligibility "
            "questions, unless there is an immediate safety issue.\n"
            + session.persona_note
        )

    return base


def _build_realtime_instructions(session: IntakeSession) -> str:
    """Realtime system instructions = base intake prompt + voice add-on.

    Pulled out so both initial session setup and post-tool session.update
    refreshes share one source of truth.
    """
    return (
        _build_instructions(session)
        + "\n\n--- Voice mode ---\n"
        "You are speaking with the resident in a live voice conversation.\n\n"
        "Speech style:\n"
        "  - Sound calm, direct, and human. Keep most replies to one or two "
        "short spoken sentences, then ask one clear question.\n"
        "  - Do not end a turn with only an acknowledgement. Unless the "
        "intake is complete, always ask the next needed intake question.\n"
        "  - Avoid long lists while speaking. If there are multiple items, "
        "summarize the gist and let the on-screen plan carry the details.\n"
        "  - Read numbers naturally for speech: say zip codes as individual "
        "digits, phone numbers in chunks, and money in plain words.\n\n"
        "Pacing — no fake pauses:\n"
        "  - Never narrate a pause you are not actually taking. Phrases "
        "like 'let me think about what to do next', 'one moment', 'give me "
        "a second', 'okay let me see', 'hmm', or 'let me check on that' "
        "promise a pause; if you say one and then immediately speak the "
        "next sentence, you sound robotic. Either continue smoothly to "
        "the next sentence with no filler at all, or stay quiet — never "
        "both.\n"
        "  - Tool calls happen instantly behind the scenes. Do not "
        "announce 'let me look that up' or 'one second while I check.' "
        "Just call the tool and continue.\n"
        "  - When you do acknowledge what the resident said, keep it to "
        "one short clause and flow straight into the next question — not "
        "as a stall, but as part of the same breath.\n\n"
        "Language behavior:\n"
        "  - Start in the resident's selected language from the session. "
        "If they naturally speak another language, briefly acknowledge the "
        "switch, call set_language with the ISO code, and continue in that "
        "language.\n"
        "  - Search the service catalog in English, but translate any spoken "
        "summary back into the resident's current language.\n\n"
        "Realtime tool behavior:\n"
        "  - Tool-first rule: when a tool is needed, call the tool before "
        "speaking. Do not speak a partial answer and then call a tool in "
        "the same turn.\n"
        "  - After tool results return, give at most one short spoken "
        "response that advances the intake with the next missing question. "
        "Do not restate the same empathy, acknowledgement, or question twice.\n"
        "  - Use extract_profile silently as facts become available; do not "
        "announce that you are saving profile fields. When the resident "
        "states several facts at once, batch them into one extract_profile "
        "call. After extract_profile returns, read its current_known_facts "
        "field and ask the NEXT missing intake question — never re-ask for a "
        "field that already appears there.\n"
        "  - Use search_services or find_matching_services only when it helps "
        "the next answer and only after you have enough basics to make the "
        "search useful. For housing, rent, eviction, homelessness, or veteran "
        "housing needs, collect current housing situation before lookup. For "
        "all service lookup, collect the full core interview first: housing, "
        "zip code, household size, employment, income, and insurance. Do not "
        "say you are checking options until you are actually calling a "
        "service-search, matching, or completion tool. Before that, ask the "
        "next missing intake question instead. Do not mention services that "
        "were not returned by tools.\n"
        "  - Call complete_intake once you have the stated needs and enough "
        "profile information for useful matches: household, zip, housing, "
        "employment, income, insurance, plus any special risk signals that "
        "came up.\n"
        "  - After complete_intake returns, give a short closing message: "
        "say the plan is ready, mention one useful high-level result if "
        "available, and tell the resident they can review it on screen. Do "
        "not continue asking intake questions after complete_intake.\n"
        "  - If the latest audio is silence, background noise, hold music, "
        "TV audio, side conversation, or speech not addressed to you, call "
        "wait_for_user and do not speak.\n\n"
        "Interview control:\n"
        "  - Treat any selected life-event scenario as context, not as a "
        "completed intake. Use it to choose a sensible first follow-up.\n"
        "  - Collect these fields before completing: stated needs, current "
        "housing situation, zip code, household size, employment status, "
        "monthly income or income range, insurance status, and any urgent "
        "risk signals.\n"
        "  - Ask for one missing field at a time. Before each question, "
        "verify the field is genuinely missing — re-read the 'Currently "
        "known' snapshot above and the most recent current_known_facts from "
        "extract_profile. If the resident has already named it in their own "
        "words, capture it silently with extract_profile and skip to the "
        "next missing field instead of asking again. For housing or veteran "
        "housing scenarios, prefer housing stability first, then zip code, "
        "then household size — but only ask about a field that is still "
        "missing.\n\n"
        "Startup:\n"
        "  - If an assistant greeting is already in the conversation "
        "history, do not greet again. Continue with the next missing intake "
        "question."
    )


def build_realtime_session_config(session: IntakeSession) -> dict[str, Any]:
    """Build a Realtime session config that mirrors the text intake agent."""
    settings = get_settings()
    instructions = _build_realtime_instructions(session)
    lang = (session.language or "en").split("-")[0].lower()
    transcription: dict[str, Any] = {
        "model": settings.openai_realtime_transcription_model,
        "prompt": (
            "Austin Service Guide intake conversation. Residents may discuss "
            "housing, food, healthcare, employment, childcare, legal help, "
            "transportation, benefits, zip codes, income, and household size."
        ),
    }
    if lang and lang != "en":
        transcription["language"] = lang

    return {
        "type": "realtime",
        "model": settings.openai_realtime_model,
        "instructions": instructions,
        "reasoning": {
            "effort": settings.openai_realtime_reasoning_effort,
        },
        "audio": {
            "input": {
                "noise_reduction": {"type": "near_field"},
                "transcription": transcription,
                "turn_detection": {
                    "type": "server_vad",
                    "create_response": False,
                    "interrupt_response": True,
                    "threshold": 0.5,
                    "prefix_padding_ms": 300,
                    "silence_duration_ms": 500,
                },
            },
            "output": {
                "voice": settings.openai_realtime_voice,
            },
        },
        "output_modalities": ["audio"],
        "tools": get_realtime_tool_schemas(),
        "tool_choice": "auto",
        "max_output_tokens": 1200,
        "tracing": {
            "workflow_name": "Austin Service Guide voice intake",
            "group_id": session.id,
        },
    }


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
            "language. If the resident selected a life-event scenario before "
            "starting, briefly acknowledge that scenario with calm, practical "
            "empathy, then ask one focused follow-up question. Otherwise, "
            "briefly explain you'll ask a few questions to find services that "
            "fit, mention the conversation is confidential and takes 3-5 "
            "minutes, and end with an open question about what brings them "
            "here today."
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

    while iterations < settings.openai_max_tool_iterations:
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

def _dispatch_tool(
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
        log.exception("Tool %s failed", name)
        return json.dumps({"error": f"{type(exc).__name__}: {exc}"}), False


def execute_realtime_tool(
    session_id: str,
    name: str,
    args: dict[str, Any] | None = None,
    call_id: str = "",
) -> dict[str, Any]:
    """Execute a Realtime tool call against the same session state as text chat."""
    record_realtime_debug_event(
        session_id,
        {
            "event": "tool_call_started",
            "source": "server",
            "detail": {
                "name": name,
                "call_id": call_id,
                "argument_keys": sorted((args or {}).keys()),
                "arguments": args or {},
            },
        },
    )
    session = _sessions.get(session_id)
    if not session:
        record_realtime_debug_event(
            session_id,
            {
                "event": "tool_call_completed",
                "source": "server",
                "status": "not_found",
                "detail": {"name": name, "call_id": call_id},
            },
        )
        return {
            "output": json.dumps({"error": "session not found"}),
            "status": "not_found",
            "progress_percent": 0,
            "is_complete": True,
            "crisis_detected": False,
        }

    if session.status == IntakeStatus.completed:
        record_realtime_debug_event(
            session_id,
            {
                "event": "tool_call_completed",
                "source": "server",
                "status": session.status.value,
                "detail": {
                    "name": name,
                    "call_id": call_id,
                    "is_complete": True,
                    "match_count": len(session.matches),
                    "output": {"error": "session already completed"},
                },
            },
        )
        return {
            "output": json.dumps({"error": "session already completed"}),
            "status": session.status.value,
            "progress_percent": 100,
            "is_complete": True,
            "crisis_detected": False,
            "match_count": len(session.matches),
        }

    allowed = {schema["name"] for schema in _TOOL_SCHEMAS}
    if name not in allowed:
        record_realtime_debug_event(
            session_id,
            {
                "event": "tool_call_completed",
                "source": "server",
                "status": session.status.value,
                "detail": {
                    "name": name,
                    "call_id": call_id,
                    "is_complete": session.status == IntakeStatus.completed,
                    "output": {"error": f"unknown tool: {name}"},
                },
            },
        )
        return {
            "output": json.dumps({"error": f"unknown tool: {name}"}),
            "status": session.status.value,
            "progress_percent": _estimate_progress(session.extracted_profile),
            "is_complete": session.status == IntakeStatus.completed,
            "crisis_detected": False,
        }

    output, crisis_detected = _dispatch_tool(session, name, args or {})
    _append_responses_context(
        session,
        "assistant",
        f"[Realtime tool {name} returned] {output[:1200]}",
    )
    result = {
        "output": output,
        "status": session.status.value,
        "progress_percent": (
            100 if session.status == IntakeStatus.completed
            else _estimate_progress(session.extracted_profile)
        ),
        "is_complete": session.status == IntakeStatus.completed,
        "crisis_detected": crisis_detected,
        "match_count": len(session.matches),
    }
    # State-mutating tools change the "Currently known" snapshot and the
    # active language note in the system prompt; ship a freshly-rebuilt
    # instructions string so the client can push a session.update and keep
    # the model from re-asking for facts it already has.
    if name in {"extract_profile", "set_language", "complete_intake"}:
        result["refreshed_instructions"] = _build_realtime_instructions(session)
    record_realtime_debug_event(
        session_id,
        {
            "event": "tool_call_completed",
            "source": "server",
            "status": result["status"],
            "detail": {
                "name": name,
                "call_id": call_id,
                "progress_percent": result["progress_percent"],
                "is_complete": result["is_complete"],
                "crisis_detected": crisis_detected,
                "match_count": len(session.matches),
                "output": _summarize_realtime_tool_output(output),
            },
        },
    )
    return result


def _append_responses_context(
    session: IntakeSession,
    role: str,
    content: str,
) -> None:
    """Mirror voice-mode context into the text agent's rolling input."""
    text = content.strip()
    if not text:
        return
    session.responses_input.append({"role": role, "content": text})


def _apply_realtime_text_profile_hints(session: IntakeSession, text: str) -> None:
    """Capture high-confidence facts from voice transcripts before model tools run."""
    profile = session.extracted_profile
    if not profile.zip_code:
        for candidate in re.findall(r"(?<!\d)(\d[\d\s-]{3,8}\d)(?!\d)", text):
            digits = re.sub(r"\D", "", candidate)
            if len(digits) == 5:
                profile.zip_code = digits
                break


def record_realtime_transcript(
    session_id: str,
    role: str,
    content: str,
) -> dict[str, Any] | None:
    """Persist a committed Realtime transcript turn into visible chat history."""
    session = _sessions.get(session_id)
    if not session:
        return None

    normalized_role = MessageRole.user if role == "user" else MessageRole.assistant
    text = content.strip()
    completed = session.status == IntakeStatus.completed
    if completed and normalized_role == MessageRole.user:
        return {
            "messages": [],
            "status": session.status.value,
            "progress_percent": 100,
            "is_complete": True,
            "crisis_detected": False,
            "error": "session already completed",
        }

    if not text:
        return {
            "messages": [],
            "status": session.status.value,
            "progress_percent": (
                100 if completed else _estimate_progress(session.extracted_profile)
            ),
            "is_complete": session.status == IntakeStatus.completed,
            "crisis_detected": False,
        }

    last = session.conversation[-1] if session.conversation else None
    if last and last.role == normalized_role and last.content.strip() == text:
        return {
            "messages": [],
            "status": session.status.value,
            "progress_percent": (
                100 if completed else _estimate_progress(session.extracted_profile)
            ),
            "is_complete": session.status == IntakeStatus.completed,
            "crisis_detected": False,
        }

    if completed and normalized_role == MessageRole.assistant:
        if last and last.role == MessageRole.assistant and last.content.strip() == text:
            return {
                "messages": [],
                "status": session.status.value,
                "progress_percent": 100,
                "is_complete": True,
                "crisis_detected": False,
            }
        if last and last.role == MessageRole.assistant:
            return {
                "messages": [],
                "status": session.status.value,
                "progress_percent": 100,
                "is_complete": True,
                "crisis_detected": False,
                "error": "session already completed",
            }

    if normalized_role == MessageRole.user:
        _apply_realtime_text_profile_hints(session, text)

    progress = (
        100 if session.status == IntakeStatus.completed
        else _estimate_progress(session.extracted_profile)
    )
    msg = IntakeMessage(
        role=normalized_role,
        content=text,
        progress_percent=progress,
        is_complete=session.status == IntakeStatus.completed,
        crisis_detected=False,
    )
    session.conversation.append(msg)
    _append_responses_context(session, normalized_role.value, text)

    crisis_msg: IntakeMessage | None = None
    crisis_detected = False
    if normalized_role == MessageRole.user:
        crisis_kind = _check_crisis(text)
        if crisis_kind:
            crisis_detected = True
            session.extracted_profile.crisis_indicators.append(crisis_kind)
            crisis_msg = _crisis_response(session)
            _append_responses_context(session, crisis_msg.role.value, crisis_msg.content)

    messages = [msg.model_dump()]
    if crisis_msg is not None:
        messages.append(crisis_msg.model_dump())

    return {
        "messages": messages,
        "status": session.status.value,
        "progress_percent": progress,
        "is_complete": session.status == IntakeStatus.completed,
        "crisis_detected": crisis_detected,
    }


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
    from app.models import SchoolAgeChild

    profile = session.extracted_profile
    applied: dict[str, Any] = {}
    for key in (
        "household_size", "zip_code", "housing_situation",
        "employment_status", "income_bracket", "insurance_status",
        "has_children", "veteran_status", "has_disability",
        "is_outdoor_worker", "has_ac", "has_chronic_conditions",
        "is_refugee_or_immigrant", "primary_language",
    ):
        val = args.get(key)
        if val is None:
            continue
        if key in ("zip_code", "primary_language") and not str(val).strip():
            continue
        setattr(profile, key, val)
        applied[key] = val

    needs = args.get("immediate_needs")
    if needs:
        merged = list({*profile.immediate_needs, *[n.lower() for n in needs]})
        profile.immediate_needs = merged
        applied["immediate_needs"] = merged

    children = args.get("school_age_children")
    if children and isinstance(children, list):
        # Overwrite (not merge) — the model has the latest picture. Filter
        # out malformed items (non-dict) before dereferencing so a stray
        # entry doesn't crash the whole extract_profile tool call.
        valid_children = [c for c in children if isinstance(c, dict)]
        ignored_count = len(children) - len(valid_children)
        profile.school_age_children = [
            SchoolAgeChild(
                grade=str(c.get("grade") or "").strip(),
                district=str(c.get("district") or "").strip(),
                concerns=[
                    str(x).lower()
                    for x in (
                        c.get("concerns")
                        if isinstance(c.get("concerns"), list)
                        else []
                    )
                ],
            )
            for c in valid_children
        ]
        applied["school_age_children"] = [c.model_dump() for c in profile.school_age_children]
        if ignored_count:
            applied["school_age_children_ignored"] = (
                f"{ignored_count} non-object entries skipped"
            )
    elif children:
        applied["school_age_children_ignored"] = "expected array of child profiles"

    missing = _missing_interview_fields(session, require_all_core=True)
    payload: dict[str, Any] = {
        "applied": applied,
        "profile_complete": _profile_completeness(profile),
        "missing_fields": missing,
        "current_known_facts": _format_known_facts(session),
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

    # Kick off the LLM plan build in the background. By the time the user
    # finishes reading the closing message and clicks "View Results," the
    # plan should be ready (model takes ~15-30s). /results awaits this task.
    if matches:
        _plan_cache.pop(session.id, None)
        try:
            loop = asyncio.get_running_loop()
            _plan_tasks[session.id] = loop.create_task(
                build_application_order(session)
            )
        except RuntimeError:
            # No running loop (shouldn't happen inside FastAPI, but be safe).
            pass

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
# Scenario interview flow
# ─────────────────────────────────────────────────────────────────────

def _session_life_event_slug(session: IntakeSession) -> str:
    prefix = "life-event:"
    if session.entry_source.startswith(prefix):
        return _normalize_life_event(session.entry_source[len(prefix):])
    return ""


def _canonical_life_event_slug(slug: str) -> str:
    aliases = {
        "job-loss": "lost-job",
        "food-help": "need-food",
        "facing-eviction": "housing-crisis",
        "behind-on-rent": "housing-crisis",
        "having-baby": "new-baby",
        "medical-help": "need-healthcare",
        "healthcare": "need-healthcare",
        "senior-care": "senior-help",
        "veteran": "veteran-transition",
        "veteran-benefits": "veteran-transition",
        "legal-help": "legal-trouble",
        "childcare": "child-care",
    }
    return aliases.get(slug, slug)


def _text_mentions_housing_status(text: str) -> bool:
    t = text.lower()
    return any(
        token in t
        for token in (
            "behind on rent",
            "eviction",
            "evict",
            "renting",
            "rent ",
            "staying",
            "shelter",
            "car",
            "homeless",
            "unhoused",
            "couch",
            "temporary",
            "no place",
            "nowhere",
        )
    )


def _text_mentions_household_count(text: str) -> bool:
    t = text.lower()
    if re.search(r"\b\d+\b", t):
        return True
    return any(word in t for word in ("just me", "alone", "two", "three", "four", "five", "six", "seven", "eight"))


def _scenario_first_followup(session: IntakeSession, user_text: str) -> IntakeMessage | None:
    """Keep life-event sessions on their scenario path for the first answer."""
    slug = _canonical_life_event_slug(_session_life_event_slug(session))
    if not slug:
        return None

    # process_message already appended the current user turn to conversation.
    user_turns = [m for m in session.conversation if m.role == MessageRole.user]
    if len(user_turns) != 1:
        return None

    text = user_text.lower()
    question_by_slug = {
        "lost-job": (
            "What has been hit the hardest since the job change: rent, food, "
            "utilities, health insurance, finding work, or something else?"
        ),
        "need-food": (
            "How many people are in your household, including you?"
            if not _text_mentions_household_count(user_text)
            else "Do you need food today, help applying for SNAP, or both?"
        ),
        "housing-crisis": (
            "What is your housing situation right now — are you in a place but "
            "behind on rent, staying somewhere temporary, or without housing?"
            if not _text_mentions_housing_status(user_text)
            else "What zip code or area are you staying in right now?"
        ),
        "new-baby": (
            "Is the baby expected soon or already born, and what kind of support "
            "would help most first: WIC, healthcare, baby supplies, or childcare?"
        ),
        "need-healthcare": (
            "Is this care urgent today, or are you looking for ongoing clinic "
            "care, coverage, prescriptions, dental, or something else?"
        ),
        "mental-health": (
            "Is this support for you or someone else, and are you looking for "
            "counseling, crisis support, school support, or peer support?"
        ),
        "senior-help": (
            "What support is needed most: meals, transportation, personal care, "
            "healthcare, benefits, home safety, or caregiver respite?"
        ),
        "retiring": (
            "What are you trying to plan for first: healthcare, meals, "
            "transportation, benefits, social support, or caregiving?"
        ),
        "veteran-transition": (
            "What kind of veteran support is most urgent right now: housing, "
            "VA benefits, healthcare, job help, or documents/navigation?"
            if not any(word in text for word in ("housing", "place", "live", "shelter", "homeless", "car", "rent"))
            else (
                "What is your housing situation right now — are you in a place "
                "but behind on rent, staying somewhere temporary, or without housing?"
                if not _text_mentions_housing_status(user_text)
                else "What zip code or area are you staying in right now?"
            )
        ),
        "new-to-austin": (
            "What do you need help setting up first: healthcare, food, "
            "transportation, school, utilities, housing, or documents?"
        ),
        "legal-trouble": (
            "Do the papers mention a deadline, hearing date, eviction, "
            "protective order/family safety issue, immigration matter, or "
            "benefits issue?"
        ),
        "child-care": (
            "How old is the child, and what days or hours do you need care to cover?"
        ),
        "back-to-school": (
            "What kind of program are you looking for: GED, adult education, "
            "ESL, college help, job training, or school support for a child?"
        ),
        "young-adult": (
            "What are you trying to handle first: housing, job, school, "
            "healthcare, transportation, or basic needs?"
        ),
        "aging-parent": (
            "What kind of support does your parent need most right now: meals, "
            "rides, personal care, medical care, respite, home safety, or benefits?"
        ),
        "divorce": (
            "What kind of help do you need first: legal aid, counseling, "
            "housing, childcare, or financial support?"
        ),
        "family-death": (
            "What help is most needed right now: grief support, legal paperwork, "
            "benefits, food, housing, or immediate expenses?"
        ),
        "new-disability": (
            "What has become hardest to manage: healthcare, benefits, assistive "
            "devices, transportation, work, housing accessibility, or legal support?"
        ),
        "unsafe-situation": (
            "Are you in immediate danger right now, or do you need help finding "
            "safe shelter, legal support, counseling, or housing?"
        ),
        "healthspan": (
            "What is making that goal hardest right now: cost, time, stress, "
            "transportation, health issues, or not knowing where to start?"
        ),
    }
    if slug == "lost-job":
        if any(word in text for word in ("rent", "evict", "housing", "shelter", "homeless")):
            question = (
                "What is your housing situation right now — are you in a place "
                "but behind on rent, staying somewhere temporary, or without housing?"
            )
        elif any(word in text for word in ("food", "groceries", "kids", "children", "snap")):
            question = "How many people are in your household, including you?"
        elif any(word in text for word in ("insurance", "health coverage", "healthcare")):
            question = (
                "Do you have health insurance right now, or did you lose coverage "
                "with the job change?"
            )
        else:
            question = question_by_slug.get(slug)
    elif slug == "back-to-school" and any(word in text for word in ("ged", "hse", "high school")):
        question = (
            "Are you looking for GED classes, test prep, or help paying for the "
            "exam, and do you need evening or daytime options?"
        )
    elif slug == "new-disability" and any(word in text for word in ("work", "job", "injured", "injury")):
        question = (
            "Do you need help with healthcare, disability benefits, job or "
            "workplace support, transportation, or income while you recover?"
        )
    else:
        question = question_by_slug.get(slug)
    if not question:
        return None

    _append_responses_context(session, "user", user_text)
    msg = IntakeMessage(
        role=MessageRole.assistant,
        content=question,
        progress_percent=_estimate_progress(session.extracted_profile),
    )
    session.conversation.append(msg)
    _append_responses_context(session, msg.role.value, msg.content)
    return msg


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


def _normalize_life_event(life_event: str) -> str:
    return life_event.strip().lower().replace("_", "-")


def _life_event_context(life_event: str) -> str:
    """Return scenario-specific interview guidance for a landing-page entry."""
    slug = _normalize_life_event(life_event)
    plans = {
        "lost-job": {
            "label": "Lost a Job",
            "categories": "employment, utilities, food, housing, healthcare",
            "first": (
                "Ask what changed most urgently since the job loss: rent, food, "
                "utilities, health insurance, job search, or something else."
            ),
            "scenario_questions": (
                "Confirm whether they are unemployed or had hours cut; ask if "
                "rent, food, utilities, or health coverage were affected; then "
                "continue with the core eligibility questions."
            ),
        },
        "job-loss": {
            "alias": "lost-job",
        },
        "need-food": {
            "label": "Need Food Help",
            "categories": "food, nutrition, childcare/family supports",
            "first": "Ask whether they need food today, SNAP help, or both.",
            "scenario_questions": (
                "Ask household size, whether children/seniors are included, and "
                "whether they can travel to a pantry or need nearby options."
            ),
        },
        "food-help": {
            "alias": "need-food",
        },
        "housing-crisis": {
            "label": "Housing Crisis",
            "categories": "housing, emergency, legal, utilities",
            "first": (
                "Ask their current housing situation first: behind on rent, "
                "eviction notice/court date, temporary stay, shelter need, or "
                "without housing."
            ),
            "scenario_questions": (
                "If eviction is involved, ask whether there is a notice or court "
                "date. If without housing, ask where they are staying tonight."
            ),
        },
        "facing-eviction": {
            "alias": "housing-crisis",
        },
        "behind-on-rent": {
            "alias": "housing-crisis",
        },
        "new-baby": {
            "label": "New Baby",
            "categories": "healthcare, childcare, food, family support",
            "first": (
                "Ask whether they need prenatal care, WIC/food, baby supplies, "
                "childcare, or health coverage first."
            ),
            "scenario_questions": (
                "Ask whether the baby is expected or already born, the child's "
                "age if born, and whether the parent/baby has health coverage."
            ),
        },
        "having-baby": {
            "alias": "new-baby",
        },
        "need-healthcare": {
            "label": "Need Healthcare",
            "categories": "healthcare, mental_health, disability",
            "first": (
                "Ask what kind of care they need: clinic visit, dental, mental "
                "health, prescriptions, health coverage, or urgent care."
            ),
            "scenario_questions": (
                "Ask whether they have insurance, whether the care is urgent, "
                "and whether cost, language, transportation, or prescriptions "
                "are barriers."
            ),
        },
        "medical-help": {
            "alias": "need-healthcare",
        },
        "healthcare": {
            "alias": "need-healthcare",
        },
        "mental-health": {
            "label": "Mental Health Support",
            "categories": "mental_health, healthcare, emergency, schools",
            "first": (
                "Ask what kind of support they want: counseling, crisis support, "
                "peer support, school/youth support, or another kind of help."
            ),
            "scenario_questions": (
                "Screen gently for immediate danger or self-harm. If the support "
                "is for a child or student, capture school/grade concerns."
            ),
        },
        "senior-help": {
            "label": "Senior Assistance",
            "categories": "senior, healthcare, transportation, food",
            "first": "Ask whether the support is for the resident or someone they care for.",
            "scenario_questions": (
                "Ask what support is needed most: meals, caregiving, benefits, "
                "transportation, healthcare, respite, or home safety."
            ),
        },
        "senior-care": {
            "alias": "senior-help",
        },
        "retiring": {
            "label": "Retiring",
            "categories": "senior, healthcare, transportation, benefits",
            "first": (
                "Ask what they are trying to plan for first: healthcare, meals, "
                "transportation, benefits, social support, or caregiving."
            ),
            "scenario_questions": (
                "Ask whether they already have Medicare or other coverage and "
                "whether mobility, transportation, meals, or benefits are the "
                "main concern."
            ),
        },
        "veteran-transition": {
            "label": "Veteran Transition",
            "categories": "veterans, housing, employment, healthcare",
            "first": (
                "Ask which veteran support is most helpful now: housing, VA "
                "benefits, healthcare, job help, or documents/navigation."
            ),
            "scenario_questions": (
                "Confirm whether the resident is the veteran or calling for one. "
                "If housing is mentioned, ask current housing situation before "
                "zip code or services."
            ),
        },
        "veteran-benefits": {
            "alias": "veteran-transition",
        },
        "veteran": {
            "alias": "veteran-transition",
        },
        "new-to-austin": {
            "label": "New to Austin",
            "categories": "utilities, healthcare, transportation, education, food",
            "first": (
                "Ask what they need help setting up first: healthcare, food, "
                "transportation, school, utilities, housing, or documents."
            ),
            "scenario_questions": (
                "Ask how recently they arrived, whether they have stable housing, "
                "and whether language, transportation, school enrollment, or "
                "health coverage are barriers."
            ),
        },
        "legal-trouble": {
            "label": "Legal Trouble",
            "categories": "legal, emergency, housing, immigration",
            "first": (
                "Ask what type of legal issue they are dealing with, without "
                "asking for private details they do not want to share."
            ),
            "scenario_questions": (
                "Ask whether there is a deadline, hearing, notice, eviction, "
                "family safety concern, immigration issue, or benefits issue."
            ),
        },
        "legal-help": {
            "alias": "legal-trouble",
        },
        "child-care": {
            "label": "Child Care Needs",
            "categories": "childcare, education, employment",
            "first": "Ask the child's age and what schedule they need covered.",
            "scenario_questions": (
                "Ask whether care is needed for work, school, training, or an "
                "emergency; ask about preferred location and whether cost is the "
                "main barrier."
            ),
        },
        "childcare": {
            "alias": "child-care",
        },
        "back-to-school": {
            "label": "Back to School",
            "categories": "education, employment, schools",
            "first": (
                "Ask what kind of program they want: GED, adult education, ESL, "
                "college help, job training, or school support for a child."
            ),
            "scenario_questions": (
                "Ask the learner's age or grade if relevant, current education "
                "level, schedule constraints, and whether transportation or "
                "technology access is a barrier."
            ),
        },
        "young-adult": {
            "label": "Becoming Independent",
            "categories": "education, employment, housing, healthcare",
            "first": (
                "Ask what they are trying to handle first: housing, job, school, "
                "healthcare, transportation, or basic needs."
            ),
            "scenario_questions": (
                "Ask current housing stability, work/school situation, and the "
                "most immediate barrier to becoming stable."
            ),
        },
        "aging-parent": {
            "label": "Aging Parent",
            "categories": "senior, healthcare, transportation, food, respite",
            "first": "Ask what kind of support their parent needs most right now.",
            "scenario_questions": (
                "Ask whether the need is meals, transportation, personal care, "
                "medical care, caregiver respite, home safety, or benefits."
            ),
        },
        "divorce": {
            "label": "Going Through Divorce",
            "categories": "legal, healthcare, childcare, housing",
            "first": (
                "Ask whether they need legal aid, counseling, housing, childcare, "
                "or financial support first."
            ),
            "scenario_questions": (
                "Ask whether there is a court deadline, child custody/childcare "
                "issue, housing change, safety concern, or loss of income."
            ),
        },
        "family-death": {
            "label": "Loss of a Family Member",
            "categories": "healthcare, legal, benefits, food",
            "first": (
                "Ask what help is most needed right now: grief support, legal "
                "paperwork, benefits, food, housing, or immediate expenses."
            ),
            "scenario_questions": (
                "Ask gently whether there is a legal/probate issue, benefits or "
                "income change, children or seniors affected, or urgent basic "
                "needs."
            ),
        },
        "new-disability": {
            "label": "New Disability",
            "categories": "disability, healthcare, employment, legal, transportation",
            "first": "Ask what has become hardest to manage since the disability changed.",
            "scenario_questions": (
                "Ask whether they need healthcare, benefits, assistive devices, "
                "transportation, workplace help, housing accessibility, or legal "
                "support."
            ),
        },
        "unsafe-situation": {
            "label": "Unsafe Situation",
            "categories": "emergency, legal, housing, healthcare",
            "first": (
                "Ask whether they are in immediate danger right now. If yes, "
                "prioritize 911/crisis resources before regular intake."
            ),
            "scenario_questions": (
                "If not in immediate danger, ask whether they need safe shelter, "
                "domestic violence support, legal help, counseling, or housing."
            ),
        },
        "healthspan": {
            "label": "Adding Healthy Years",
            "categories": "smoking_cessation, nutrition, physical_activity, mental_health, healthcare",
            "first": (
                "Ask which health goal they want to work on first: food/nutrition, "
                "movement, tobacco/vaping, stress/mental health, or healthcare."
            ),
            "scenario_questions": (
                "Ask what makes that goal hard right now, whether chronic "
                "conditions or mobility issues matter, and whether they prefer "
                "classes, coaching, clinics, or self-guided support."
            ),
        },
    }

    while isinstance(plans.get(slug), dict) and plans[slug].get("alias"):
        slug = plans[slug]["alias"]

    plan = plans.get(slug)
    if not plan:
        return (
            f"Entry scenario: the resident selected {slug.replace('-', ' ')}. "
            "Keep that scenario active through the interview, ask one practical "
            "follow-up question at a time, and only recommend services related "
            "to that scenario or needs the resident adds."
        )

    return (
        f"Entry scenario: the resident selected {plan['label']}.\n"
        "Scenario rule: this is not just an opener. Keep this path active until "
        "the plan is made. Ask scenario-specific follow-up questions before "
        "switching to generic eligibility questions. Ask one question at a time.\n"
        "Do not move to zip code, household size, income, or insurance until "
        "the resident has answered at least one scenario-specific detail beyond "
        "the card they selected, unless that generic field is itself the next "
        "scenario-specific detail listed here.\n"
        f"Primary service categories to preserve in matching: {plan['categories']}.\n"
        f"First follow-up: {plan['first']}\n"
        f"Scenario-specific details to collect: {plan['scenario_questions']}\n"
        "After the scenario-specific details are clear, collect the core intake "
        "fields still needed: zip code, household size, housing situation, "
        "employment, income, insurance, and urgent risk signals. Search and "
        "recommend services only after enough detail is collected, and keep the "
        "recommendations tied to this scenario plus any additional needs the "
        "resident stated."
    )


def _needs_from_life_event(life_event: str) -> list[str]:
    """Map a landing-page life-event slug into initial need categories."""
    slug = _normalize_life_event(life_event)
    mapping = {
        "lost-job": ["employment"],
        "job-loss": ["employment"],
        "food-help": ["food"],
        "need-food": ["food"],
        "housing-crisis": ["housing", "emergency"],
        "facing-eviction": ["housing", "legal"],
        "behind-on-rent": ["housing", "utilities"],
        "medical-help": ["healthcare"],
        "need-healthcare": ["healthcare"],
        "healthcare": ["healthcare"],
        "childcare": ["childcare"],
        "child-care": ["childcare"],
        "having-baby": ["childcare", "healthcare", "food"],
        "new-baby": ["childcare", "healthcare", "food"],
        "senior-care": ["senior"],
        "senior-help": ["senior"],
        "veteran": ["veterans"],
        "veteran-benefits": ["veterans"],
        "veteran-transition": ["veterans", "employment", "housing", "healthcare"],
        "legal-help": ["legal"],
        "legal-trouble": ["legal"],
        "transportation": ["transportation"],
        "mental-health": ["mental_health", "healthcare"],
        "back-to-school": ["education", "schools"],
        "new-to-austin": ["utilities", "transportation", "education", "food", "housing", "healthcare"],
        "retiring": ["senior", "healthcare", "transportation"],
        "aging-parent": ["senior", "healthcare", "transportation"],
        "young-adult": ["education", "employment", "housing"],
        "divorce": ["legal", "healthcare", "childcare"],
        "family-death": ["healthcare", "legal"],
        "new-disability": ["disability", "healthcare", "employment", "legal"],
        "unsafe-situation": ["emergency", "legal", "housing"],
        "healthspan": ["smoking_cessation", "nutrition", "physical_activity", "mental_health", "healthcare"],
    }
    if slug in mapping:
        return mapping[slug]
    fallback = slug.replace("-", " ").strip()
    return [fallback] if fallback else []


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


async def get_application_order(
    session: IntakeSession, *, wait_seconds: float = 25.0
) -> dict:
    """Return the cached/in-flight plan for a session.

    If the model is still building the plan (task kicked off when intake
    completed), wait up to ``wait_seconds`` for it. On timeout or any
    failure, fall back to the rules-based sequencer so /results never
    hangs waiting on the LLM.
    """
    from app.services.matching import recommend_application_order

    cached = _plan_cache.get(session.id)
    if cached is not None:
        return cached

    task = _plan_tasks.get(session.id)
    if task is not None:
        try:
            result = await asyncio.wait_for(asyncio.shield(task), wait_seconds)
            _plan_cache[session.id] = result
            return result
        except asyncio.TimeoutError:
            log.warning("get_application_order: model exceeded %ss", wait_seconds)
        except Exception:
            log.exception("get_application_order: background task failed")

    # No task or it failed/timed out → deterministic rules sequencer.
    if not session.matches:
        return {"summary": "", "items": [], "ai_generated": False}
    return {
        "summary": "",
        "items": recommend_application_order(session.matches),
        "ai_generated": False,
    }


async def build_application_order(session: IntakeSession) -> dict:
    """Use the model to rank matches and write per-item reasons.

    Hands the model the recent conversation, the resident's extracted
    profile, and the candidate matches that the rules engine surfaced.
    The model picks 3–5, ranks them, and writes a per-item reason that
    cites the resident's actual words. Falls back to the deterministic
    rules sequencer if live AI is off, the call fails, or the output
    cannot be parsed.

    Returns:
        {"summary": str, "items": [...], "ai_generated": bool}
        — items have the same shape as recommend_application_order().
    """
    from app.services.matching import recommend_application_order

    matches = session.matches
    if not matches:
        return {"summary": "", "items": [], "ai_generated": False}

    settings = get_settings()

    def fallback() -> dict:
        return {
            "summary": "",
            "items": recommend_application_order(matches),
            "ai_generated": False,
        }

    if not settings.use_live_ai:
        return fallback()

    profile = session.extracted_profile
    profile_lines = []
    if profile.immediate_needs:
        profile_lines.append(f"Stated needs: {', '.join(profile.immediate_needs)}")
    if profile.zip_code:
        profile_lines.append(f"Zip: {profile.zip_code}")
    if profile.housing_situation:
        profile_lines.append(f"Housing: {profile.housing_situation}")
    if profile.employment_status:
        profile_lines.append(f"Employment: {profile.employment_status}")
    if profile.income_bracket:
        profile_lines.append(f"Income: {profile.income_bracket}")
    if profile.insurance_status:
        profile_lines.append(f"Insurance: {profile.insurance_status}")
    if profile.has_children:
        profile_lines.append("Has children")
    if profile.veteran_status:
        profile_lines.append("Veteran")
    if profile.has_disability:
        profile_lines.append("Has disability")
    if profile.crisis_indicators:
        profile_lines.append(f"Crisis flags: {', '.join(profile.crisis_indicators)}")

    transcript_lines = []
    for m in session.conversation[-12:]:
        role = "Resident" if m.role == MessageRole.user else "Assistant"
        text = (m.content or "").strip().replace("\n", " ")
        if text:
            transcript_lines.append(f"{role}: {text[:400]}")

    candidate_lines = []
    by_id = {m.service.id: m for m in matches}
    for m in matches[:12]:
        svc = m.service
        primary_cat = svc.categories[0] if svc.categories else "other"
        summary = (svc.description or "").strip().replace("\n", " ")[:180]
        candidate_lines.append(
            f"- id={svc.id} | slug={svc.slug} | {svc.name} "
            f"({primary_cat}; cats={','.join(svc.categories)}; "
            f"score={m.match_score}) — {summary}"
        )

    prompt = (
        "You are sequencing the resident's next steps. From the candidate "
        "services below, pick 3–5, ordered by what this resident should "
        "do FIRST given what they actually said. Write one short reason "
        "per pick that ties back to the resident's own words or situation "
        "— do not use generic templates. Prioritize the urgent presenting "
        "concern over downstream coverage/insurance unless the resident "
        "explicitly asked about coverage.\n\n"
        "Then write a 1–2 sentence 'why this order' summary the resident "
        "will read at the top of their plan.\n\n"
        "Respond with JSON ONLY in this exact shape:\n"
        '{"summary": "<1-2 sentences>", "items": [{"service_id": "<id>", '
        '"reason": "<one short sentence>"}, ...]}\n'
        "Use service_id values exactly as listed. Order items by what to "
        "do first. Do not include any service_id not in the candidate list.\n\n"
        f"=== Resident profile ===\n{chr(10).join(profile_lines) or '(no profile fields yet)'}\n\n"
        f"=== Recent conversation ===\n{chr(10).join(transcript_lines) or '(no transcript)'}\n\n"
        f"=== Candidate services ===\n{chr(10).join(candidate_lines)}\n"
    )

    try:
        from openai import AsyncOpenAI

        client = AsyncOpenAI(api_key=settings.openai_api_key)
        response = await client.responses.create(
            model=settings.openai_model,
            input=[{"role": "user", "content": prompt}],
            reasoning={"effort": settings.openai_reasoning_effort},
            text={"format": {"type": "json_object"}},
            max_output_tokens=2000,
        )
        raw = (response.output_text or "").strip()
        if not raw:
            return fallback()

        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            log.warning("build_application_order: model returned non-JSON")
            return fallback()

        items_in = data.get("items") or []
        summary = (data.get("summary") or "").strip()

        seen: set[str] = set()
        items_out: list[dict] = []
        rank = 1
        for entry in items_in:
            sid = (entry or {}).get("service_id")
            reason = ((entry or {}).get("reason") or "").strip()
            match = by_id.get(sid)
            if not match or sid in seen or not reason:
                continue
            seen.add(sid)
            svc = match.service
            primary_cat = svc.categories[0] if svc.categories else "other"
            items_out.append({
                "rank": rank,
                "service_id": svc.id,
                "service_slug": svc.slug,
                "service_name": svc.name,
                "category": primary_cat,
                "reason": reason,
            })
            rank += 1
            if rank > 5:
                break

        if not items_out:
            return fallback()

        return {"summary": summary, "items": items_out, "ai_generated": True}
    except Exception:
        log.exception("build_application_order failed; using rules fallback")
        return fallback()


async def generate_plan_summary(session: IntakeSession) -> str:
    """One-sentence resident-facing recap of a saved plan.

    Used by the /intake recovery prompt so a returning user can see what
    their saved session contains before deciding to resume vs start over.
    Falls back to a deterministic template when live AI is unavailable.
    """
    match_count = len(session.matches)
    started = session.created_at.strftime("%b %d")

    def fallback() -> str:
        if match_count == 0:
            return f"Conversation started {started} — no matches yet."
        plural = "service" if match_count == 1 else "services"
        return f"{match_count} {plural} matched on {started}."

    settings = get_settings()
    if not settings.use_live_ai or not session.matches:
        return fallback()

    try:
        from openai import AsyncOpenAI

        top_names = [m.service.name for m in session.matches[:3]]
        top_risk = session.risk_flags[0].risk_type if session.risk_flags else None

        bullets = "\n".join(f"- {n}" for n in top_names)
        prompt = (
            "Write ONE warm, plain-English sentence (max 20 words) "
            "summarizing this resident's saved plan. Mention how many "
            "services were matched and one or two specific names. "
            "Do not use the word 'plan' twice. No emoji.\n\n"
            f"Total matches: {match_count}\n"
            f"Top matched services:\n{bullets}\n"
        )
        if top_risk:
            prompt += f"Most pressing concern: {top_risk}\n"

        client = AsyncOpenAI(api_key=settings.openai_api_key)
        response = await client.responses.create(
            model=settings.openai_model,
            input=[{"role": "user", "content": prompt}],
            reasoning={"effort": settings.openai_reasoning_effort},
            max_output_tokens=120,
        )
        text = (response.output_text or "").strip()
        return text or fallback()
    except Exception:
        return fallback()

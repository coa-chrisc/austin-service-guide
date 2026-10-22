"""Realtime (voice) intake: session config, tool execution, transcripts.

Every function works on the per-request ``IntakeSession`` rebuilt from the
browser's state; the router serializes it back. Nothing is kept here.
"""

from __future__ import annotations

import json
import re
from typing import Any

from app.config import get_settings
from app.models import IntakeMessage, IntakeSession, IntakeStatus, MessageRole
from app.services import catalog
from app.services.city import get_city
from app.services.pii import ASSISTANT_KINDS, redact
from app.services.prompts import build_instructions
from app.services.realtime_debug import record_realtime_debug_event, summarize_tool_output
from app.services.scenarios import check_crisis, crisis_response
from app.services.tool_schemas import TOOL_SCHEMAS
from app.services.tools import dispatch_tool, estimate_progress

_TOOL_NAMES = {schema["name"] for schema in TOOL_SCHEMAS}
# Tools whose effect changes the "Currently known" snapshot or language note.
_INSTRUCTION_REFRESH_TOOLS = {"extract_profile", "set_language", "complete_intake"}


def get_realtime_tool_schemas() -> list[dict[str, Any]]:
    """Return tool schemas in the shape accepted by Realtime sessions."""
    return [
        {k: v for k, v in schema.items() if k != "strict"}
        for schema in TOOL_SCHEMAS
    ]


def build_realtime_instructions(session: IntakeSession) -> str:
    """Realtime system instructions = base intake prompt + voice add-on.

    Pulled out so both initial session setup and post-tool session.update
    refreshes share one source of truth.
    """
    return (
        build_instructions(session)
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
        "Voice privacy:\n"
        "  - Never ask the resident to say their name, Social Security "
        "number, full address, phone number, date of birth, or any account or "
        "member number, and never repeat one aloud if they say it. Tell them "
        "you don't need it and move to the next intake question. Ask for zip "
        "code only, never a street address.\n\n"
        "Startup:\n"
        "  - If an assistant greeting is already in the conversation "
        "history, do not greet again. Continue with the next missing intake "
        "question."
    )


def build_realtime_session_config(session: IntakeSession) -> dict[str, Any]:
    """Build a Realtime session config that mirrors the text intake agent."""
    settings = get_settings()
    instructions = build_realtime_instructions(session)
    lang = (session.language or "en").split("-")[0].lower()
    transcription: dict[str, Any] = {
        "model": settings.openai_realtime_transcription_model,
        "prompt": (
            f"{get_city().app_name} intake conversation. Residents may discuss "
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
        # Explicitly off: Realtime traces are stored in the OpenAI Traces
        # dashboard and would retain resident voice-session content.
        "tracing": None,
    }


def _progress(session: IntakeSession) -> int:
    if session.status == IntakeStatus.completed:
        return 100
    return estimate_progress(session.extracted_profile)


def execute_realtime_tool(
    session: IntakeSession,
    name: str,
    args: dict[str, Any] | None = None,
    call_id: str = "",
    trace_id: str = "",
) -> dict[str, Any]:
    """Execute one Realtime tool call against the request's session."""
    args = args or {}
    record_realtime_debug_event(trace_id, {
        "event": "tool_call_started",
        "source": "server",
        "detail": {"name": name, "call_id": call_id, "argument_keys": sorted(args.keys())},
    })
    completed = session.status == IntakeStatus.completed
    if completed:
        output = json.dumps({"error": "session already completed"})
        crisis_detected = False
    elif name not in _TOOL_NAMES:
        output = json.dumps({"error": "unknown tool"})
        crisis_detected = False
    else:
        output, crisis_detected = dispatch_tool(session, name, args)

    result: dict[str, Any] = {
        "output": output,
        "status": session.status.value,
        "progress_percent": _progress(session),
        "is_complete": session.status == IntakeStatus.completed,
        "crisis_detected": crisis_detected,
        "match_count": len(session.matches),
    }
    # Ship freshly rebuilt instructions after state-changing tools so the
    # client can push a session.update and the model stops re-asking.
    if not completed and name in _INSTRUCTION_REFRESH_TOOLS:
        result["refreshed_instructions"] = build_realtime_instructions(session)
    record_realtime_debug_event(trace_id, {
        "event": "tool_call_completed",
        "source": "server",
        "status": result["status"],
        "detail": {
            "name": name,
            "call_id": call_id,
            "progress_percent": result["progress_percent"],
            "is_complete": result["is_complete"],
            "crisis_detected": crisis_detected,
            "match_count": result["match_count"],
            "output": summarize_tool_output(output),
        },
    })
    return result


_ZIP_CANDIDATE_RE = re.compile(r"(?<!\d)(\d[\d\s-]{3,8}\d)(?!\d)")


def _apply_realtime_text_profile_hints(session: IntakeSession, text: str) -> None:
    """Capture a spoken zip code before the model's own tool call lands."""
    profile = session.extracted_profile
    if profile.zip_code:
        return
    for candidate in _ZIP_CANDIDATE_RE.findall(text):
        digits = re.sub(r"\D", "", candidate)
        if len(digits) == 5:
            profile.zip_code = digits
            return


def record_realtime_transcript(
    session: IntakeSession,
    role: str,
    content: str,
) -> dict[str, Any]:
    """Add a committed Realtime transcript turn to the visible conversation.

    Resident speech gets the full redaction set. Assistant speech gets the
    rules that can't hit catalog content (the voice model could read back a
    number it heard); phone numbers, addresses and service emails are kept
    because the assistant quotes them from the catalog on purpose.

    Every result carries ``redacted_content`` and ``redacted`` so the client
    can replace its raw local copy, including when nothing is appended.
    """
    normalized_role = MessageRole.user if role == "user" else MessageRole.assistant
    text = content.strip()
    if normalized_role == MessageRole.user:
        text, redacted_types = redact(text)
    else:
        text, redacted_types = redact(
            text, kinds=ASSISTANT_KINDS, keep=catalog.get_service_emails()
        )
    completed = session.status == IntakeStatus.completed

    def _unchanged(**extra: Any) -> dict[str, Any]:
        return {
            "messages": [],
            "status": session.status.value,
            "progress_percent": _progress(session),
            "is_complete": completed,
            "crisis_detected": False,
            "redacted": redacted_types,
            "redacted_content": text,
            **extra,
        }

    if completed and normalized_role == MessageRole.user:
        return _unchanged(error="session already completed")
    if not text:
        return _unchanged()

    last = session.conversation[-1] if session.conversation else None
    if last and last.role == normalized_role and last.content.strip() == text:
        return _unchanged()
    if completed and last and last.role == MessageRole.assistant:
        return _unchanged(error="session already completed")

    if normalized_role == MessageRole.user:
        _apply_realtime_text_profile_hints(session, text)

    progress = _progress(session)
    msg = IntakeMessage(
        role=normalized_role,
        content=text,
        progress_percent=progress,
        is_complete=session.status == IntakeStatus.completed,
        crisis_detected=False,
    )
    session.conversation.append(msg)

    messages = [msg.model_dump()]
    crisis_detected = False
    if normalized_role == MessageRole.user:
        crisis_kind = check_crisis(text)
        if crisis_kind:
            crisis_detected = True
            session.extracted_profile.crisis_indicators.append(crisis_kind)
            messages.append(crisis_response(session).model_dump())

    return {
        "messages": messages,
        "status": session.status.value,
        "progress_percent": progress,
        "is_complete": session.status == IntakeStatus.completed,
        "crisis_detected": crisis_detected,
        "redacted": redacted_types,
        "redacted_content": text,
    }

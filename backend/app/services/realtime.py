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
from app.services.prompts import LANGUAGE_NAMES, build_instructions
from app.services.realtime_debug import record_realtime_debug_event, summarize_tool_output
from app.services.crisis import crisis_speech, crisis_turn, detect_crisis
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
        "Your greeting told the resident they can simply speak in their own "
        "language.\n"
        "  - When the resident speaks to you in a different language than "
        "the current one, switch: call set_language with that language's "
        "ISO code first (tool-first, before you speak), so the screen and "
        "the plan follow, then reply in that language and keep using it. A "
        "few words of acknowledgement are enough; do not explain the "
        "switch.\n"
        "  - Switch only on the language of the words, or when the resident "
        "asks for a language. Accent alone is never a reason to switch: "
        "English spoken with a Spanish or Vietnamese accent is still "
        "English. A single borrowed word, name, or place (\"gracias\", a "
        "street name, a program name) is not a switch either.\n"
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
        "wait_for_user and do not speak.\n"
        "  - Only respond to clear speech. If the resident is speaking to "
        "you but the audio is unclear, noisy, or cut off, ask the resident "
        "to repeat it instead of guessing what they said.\n\n"
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
        "  - When voice starts on a new intake you have already greeted the "
        "resident aloud and invited them to speak in any language. Do not "
        "greet again or repeat that invitation. Answer what the resident "
        "says and continue with the next missing intake question."
    )


# Short enough to speak in under about eight seconds.
_GREETING_WITH_LANGUAGES = (
    "Hi! I can help in {first}, {second}, or any other language, so just "
    "start talking in yours. How can I help you today?"
)
_GREETING_ANY_LANGUAGE = (
    "Hi! You can talk with me in any language, so just start talking in "
    "yours. How can I help you today?"
)


def _language_name(code: str) -> str:
    base = (code or "en").split("-")[0].lower()
    return LANGUAGE_NAMES.get(base, code or "English")


def _startup_greeting_script() -> str:
    """English greeting text; names two of the city's configured languages."""
    named = [LANGUAGE_NAMES[c] for c in get_city().languages if c in LANGUAGE_NAMES]
    if len(named) >= 2:
        return _GREETING_WITH_LANGUAGES.format(first=named[0], second=named[1])
    return _GREETING_ANY_LANGUAGE


def build_realtime_startup_response(session: IntakeSession) -> dict[str, Any]:
    """The ``response.create`` body for the greeting the voice model speaks first.

    The browser sends it once, when voice starts on an intake the resident
    hasn't spoken in yet. Nothing is spoken on the device before it. The
    greeting is in the session's language (the browser's UI language at
    start), says the resident can speak in any language, and asks how the
    guide can help.

    ``input`` gives the turn its own context, so the long text greeting in
    the conversation history doesn't leak into it; the spoken reply is still
    added to the conversation. ``metadata.purpose`` is how the browser tells
    this response apart from resident turns.
    """
    lang_name = _language_name(session.language)
    script = _startup_greeting_script()
    if lang_name == "English":
        how = "in English, word for word"
    else:
        how = f"in {lang_name}, translated naturally"
    instructions = (
        f"You are the voice guide for the {get_city().app_name}. Voice mode "
        "just connected and the resident is waiting for you to speak first.\n"
        f"Say this greeting aloud exactly once, {how}:\n"
        f'"{script}"\n'
        "Speak warmly at a natural pace and keep it under eight seconds. Say "
        "nothing else: no privacy notice, no other questions, and no tool "
        "calls. Then stop and wait for the resident."
    )
    return {
        "output_modalities": ["audio"],
        "instructions": instructions,
        "tool_choice": "none",
        "metadata": {"purpose": "startup_greeting"},
        "input": [
            {
                "type": "message",
                "role": "user",
                "content": [
                    {
                        "type": "input_text",
                        "text": "Voice mode connected. Greet the resident now.",
                    }
                ],
            }
        ],
    }


# response.create metadata purposes for the crisis reply. "stored": the
# transcript endpoint already added the crisis message to the conversation,
# so the client skips syncing the spoken copy. "spoken": a tool flagged the
# crisis, nothing is stored yet, so the spoken copy is synced like any reply.
CRISIS_REPLY_STORED = "crisis_response"
CRISIS_REPLY_SPOKEN = "crisis_tool_response"


def build_crisis_voice_response(session: IntakeSession, purpose: str) -> dict[str, Any]:
    """response.create body that makes the voice model read the crisis lines.

    No tools, no conversation context: the model gets the scripted crisis
    text (``crisis.crisis_speech``) and instructions to read only that, so
    a crisis turn is never answered with a free reply.
    """
    lang_name = _language_name(session.language)
    how = (
        "in English, word for word" if lang_name == "English"
        else f"in {lang_name}, translated naturally, keeping every name and number exactly"
    )
    instructions = (
        "The resident may be in crisis. Read the message below aloud "
        f"{how}, calmly and warmly. Say each phone number digit by digit. "
        "Say nothing else: no questions about services, no other advice, "
        "no tool calls. Then stop and wait for the resident.\n\n"
        f'"{crisis_speech(session)}"'
    )
    return {
        "output_modalities": ["audio"],
        "instructions": instructions,
        "tool_choice": "none",
        "metadata": {"purpose": purpose},
        "input": [
            {
                "type": "message",
                "role": "user",
                "content": [{"type": "input_text", "text": "Read the crisis message now."}],
            }
        ],
    }


def build_realtime_session_config(session: IntakeSession) -> dict[str, Any]:
    """Build a Realtime session config that mirrors the text intake agent.

    Tuned for a laptop or PC with speakers and a built-in mic, the hardest
    case for echo; it also works with a headset:

    - No transcription ``prompt``. The transcription model can return its
      prompt as the transcript of silence or echo, which then reads as
      resident speech. The intake's words are ordinary English and need no
      vocabulary hint.
    - ``far_field`` noise reduction is meant for laptop and room mics.
    - ``server_vad`` needs louder audio than the 0.5 default to start a turn
      (less residual echo and room noise), and waits 700 ms of silence
      before ending one so a resident who pauses mid-answer isn't split into
      two turns.

    - No transcription ``language``. The resident may answer in any
      language (the greeting invites it), so the transcription model detects
      it; a pinned language would mis-transcribe a resident who switches.

    The browser also mutes the mic while the assistant's audio plays (see
    ``useRealtimeVoiceSession.ts``), and ``record_realtime_transcript`` drops
    transcripts that are echoes of the assistant.
    """
    settings = get_settings()
    instructions = build_realtime_instructions(session)
    transcription: dict[str, Any] = {
        "model": settings.openai_realtime_transcription_model,
    }

    return {
        "type": "realtime",
        "model": settings.openai_realtime_model,
        "instructions": instructions,
        "reasoning": {
            "effort": settings.openai_realtime_reasoning_effort,
        },
        "audio": {
            "input": {
                "noise_reduction": {"type": "far_field"},
                "transcription": transcription,
                "turn_detection": {
                    "type": "server_vad",
                    # The browser requests each response itself, after the
                    # resident's transcript has been synced and checked.
                    "create_response": False,
                    "interrupt_response": True,
                    "threshold": 0.6,
                    "prefix_padding_ms": 300,
                    "silence_duration_ms": 700,
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
    if crisis_detected:
        # The model flagged a crisis: its next spoken reply reads the crisis
        # lines instead of continuing the intake.
        result["crisis_response"] = build_crisis_voice_response(session, CRISIS_REPLY_SPOKEN)
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


# A resident transcript is treated as the assistant's own voice picked up by
# the mic when at least this share of its word pairs appear in what the
# assistant said since the resident last spoke. Short replies ("yes", "two
# kids", a zip code) are never treated as echo.
_ECHO_MIN_WORDS = 4
_ECHO_MIN_OVERLAP = 0.8
_WORD_RE = re.compile(r"[^\W_]+")


def _words(text: str) -> list[str]:
    return _WORD_RE.findall(text.casefold())


def _word_pairs(words: list[str]) -> list[tuple[str, str]]:
    return list(zip(words, words[1:]))


def _is_assistant_echo(session: IntakeSession, text: str) -> bool:
    """True when ``text`` mostly repeats the assistant's latest turn(s)."""
    words = _words(text)
    if len(words) < _ECHO_MIN_WORDS:
        return False
    recent: set[tuple[str, str]] = set()
    for msg in reversed(session.conversation):
        if msg.role == MessageRole.user:
            break
        if msg.role == MessageRole.assistant:
            recent.update(_word_pairs(_words(msg.content)))
    if not recent:
        return False
    pairs = _word_pairs(words)
    hits = sum(pair in recent for pair in pairs)
    return hits / len(pairs) >= _ECHO_MIN_OVERLAP


def _transcript_artifact(session: IntakeSession, text: str) -> str | None:
    """Why a resident transcript is not resident speech, or None if it is.

    Catches what the mic and transcription model produce when the resident
    didn't speak: an empty or punctuation-only transcript, and the
    assistant's own voice coming back through the speakers. A transcript
    that trips the crisis check is always kept, even if it looks like echo.
    """
    if not _WORD_RE.search(text):
        return "empty"
    if _is_assistant_echo(session, text) and not detect_crisis(text):
        return "assistant_echo"
    return None


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

    A resident transcript that isn't resident speech (see
    ``_transcript_artifact``) is not stored and comes back with ``ignored``
    set to the reason, so the client neither shows it nor answers it.
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
    if normalized_role == MessageRole.user:
        artifact = _transcript_artifact(session, text)
        if artifact:
            return _unchanged(ignored=artifact)

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
    crisis_reply = crisis_turn(session, text) if normalized_role == MessageRole.user else None
    if crisis_reply is not None:
        messages.append(crisis_reply.model_dump())

    result: dict[str, Any] = {
        "messages": messages,
        "status": session.status.value,
        "progress_percent": progress,
        "is_complete": session.status == IntakeStatus.completed,
        "crisis_detected": crisis_reply is not None,
        "redacted": redacted_types,
        "redacted_content": text,
    }
    if crisis_reply is not None:
        # The browser sends this as the next response.create instead of a
        # free model reply. The crisis message is already in the
        # conversation, so the client does not sync the spoken copy.
        result["crisis_response"] = build_crisis_voice_response(session, CRISIS_REPLY_STORED)
    return result

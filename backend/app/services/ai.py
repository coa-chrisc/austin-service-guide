"""AI service for the guided intake conversation.

Live mode (default when ``OPENAI_API_KEY`` is set and ``DEMO_MODE`` is false)
runs an agent loop against the OpenAI **Responses API** with ``gpt-5.5`` at
``reasoning_effort="medium"``. The model has tools to query the catalog,
persist profile fields, switch language, and finalize matches.

Fallback mode (no key, or ``DEMO_MODE=true``) uses a scripted nine-step
conversation so the demo still works without an API key.

Stateless: every function here works on an ``IntakeSession`` the router
rebuilt from the browser's state for this one request, and the router
serializes it back. Nothing resident-derived is kept in this process.
"""

from __future__ import annotations

import json
import logging
import re
from copy import deepcopy
from typing import Any

from app.config import get_settings
from app.models import IntakeMessage, IntakeSession, IntakeStatus, MessageRole
from app.services.i18n import AI_NOTICE_I18N, ai_notice, redaction_notice
from app.services.intake_state import normalize_language, persona_note_for
from app.services.life_events import needs_from_life_event, normalize_life_event
from app.services.matching import assess_risks, match_services
from app.services.pii import redact
from app.services.prompts import build_instructions
from app.services.scenarios import check_crisis, crisis_response, scenario_first_followup
from app.services.scripted import DEMO_STEPS, demo_flow
from app.services.tool_schemas import TOOL_SCHEMAS
from app.services.tools import dispatch_tool, estimate_progress

log = logging.getLogger(__name__)

_LIFE_EVENT_SLUG_RE = re.compile(r"^[a-z0-9-]{1,64}$")


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
    session = IntakeSession(language=normalize_language(language))
    slug = normalize_life_event(life_event) if life_event else ""
    if slug and _LIFE_EVENT_SLUG_RE.match(slug):
        session.extracted_profile.immediate_needs = needs_from_life_event(slug)
        session.entry_source = f"life-event:{slug}"
        session.persona_note = persona_note_for(session.entry_source)
    if focus:
        cleaned = [c.strip()[:64] for c in focus if c and c.strip()]
        if cleaned:
            session.extracted_profile.immediate_needs = cleaned[:20]

    if get_settings().use_live_ai:
        greeting = IntakeMessage(
            role=MessageRole.assistant,
            content=await _live_greeting(session),
            suggested_buttons=[],
            progress_percent=0,
        )
    else:
        step = DEMO_STEPS[0]
        greeting = IntakeMessage(
            role=MessageRole.assistant,
            content=step["message"],
            suggested_buttons=step["buttons"],
            progress_percent=step["progress"],
        )
    session.conversation.append(greeting)
    return session


async def process_message(
    session: IntakeSession,
    user_text: str,
    language: str = "en",
) -> tuple[IntakeMessage, IntakeMessage]:
    """Process one resident message. Returns (assistant reply, stored user turn)."""
    if language:
        session.language = normalize_language(language, session.language)

    # Strip SSNs, phone numbers, addresses, names, etc. before the text is
    # kept, logged, or sent to the model. Everything below only sees the
    # redacted text.
    redaction = redact(user_text)
    user_message = IntakeMessage(role=MessageRole.user, content=redaction.text)
    session.conversation.append(user_message)

    reply = await _route_user_turn(session, redaction.text)
    if redaction.types and not reply.crisis_detected:
        reply.content = f"{redaction_notice(session.language)}\n\n{reply.content}"
    return reply, user_message


async def _route_user_turn(session: IntakeSession, user_text: str) -> IntakeMessage:
    """Crisis check, scenario follow-up, then live or scripted flow."""
    # Backend-side crisis check (cheap safety net independent of the model)
    crisis_kind = check_crisis(user_text)
    if crisis_kind:
        session.extracted_profile.crisis_indicators.append(crisis_kind)
        session.scripted_turns_skipped += 1
        return crisis_response(session)

    scenario_followup = scenario_first_followup(session, user_text)
    if scenario_followup is not None:
        session.scripted_turns_skipped += 1
        return scenario_followup

    if get_settings().use_live_ai:
        try:
            return await _responses_flow(session)
        except Exception as exc:  # noqa: BLE001 — fall back on any SDK failure
            # Type only: SDK error text can quote the request input.
            log.warning(
                "Responses API call failed (%s); falling back to scripted demo",
                type(exc).__name__,
            )
            session.conversation.append(IntakeMessage(
                role=MessageRole.assistant,
                content=(
                    "I hit a problem reaching the AI service. "
                    "Switching to the offline guided flow so we can keep going."
                ),
                progress_percent=0,
            ))

    return await demo_flow(session, user_text, _scripted_step_num(session))


def _scripted_step_num(session: IntakeSession) -> int:
    """1-based scripted step for the current user turn.

    Turns diverted to the crisis response or the life-event scenario
    follow-up did not answer a scripted question, so they don't advance it.
    Questions skipped because the answer was already known decrement
    ``scripted_turns_skipped`` (see ``demo_flow``), which moves the step
    forward by the same amount.
    """
    user_msg_count = sum(1 for m in session.conversation if m.role == MessageRole.user)
    return max(1, user_msg_count - session.scripted_turns_skipped)


async def start_persona_session(persona_id: str) -> IntakeSession | None:
    """Build a completed intake pre-seeded by a demo persona.

    Demo personas are deterministic: seed the profile, run matching, mark
    completed. The frontend replays the persona's scripted conversation
    client-side, then shows the results. No model call.
    """
    from app.services.personas import get_persona

    persona = get_persona(persona_id)
    if persona is None:
        return None

    session = IntakeSession(language=normalize_language(persona.language))
    session.extracted_profile = deepcopy(persona.seed_profile)
    session.entry_source = f"persona:{persona.id}"
    session.persona_note = persona.persona_note
    session.conversation.append(IntakeMessage(
        role=MessageRole.user,
        content=persona.opening_message,
    ))

    profile = session.extracted_profile
    profile.languages_spoken = [session.language] if session.language != "en" else ["en"]
    session.matches = match_services(profile)
    session.risk_flags = assess_risks(profile)
    session.status = IntakeStatus.completed
    return session


# ── Live (Responses API) flow ────────────────────────────────────────

def _openai_client():
    """OpenAI client built from the server's key only.

    No inbound request headers (X-Forwarded-For, cookies, etc.) are passed
    through to OpenAI.
    """
    from openai import AsyncOpenAI

    return AsyncOpenAI(api_key=get_settings().openai_api_key)


async def _live_greeting(session: IntakeSession) -> str:
    """Generate the opening greeting via the Responses API."""
    settings = get_settings()
    client = _openai_client()

    notice = ai_notice(session.language)
    if notice:
        notice_rule = f'Include this privacy notice word for word: "{notice}" '
    else:
        notice_rule = (
            "Include this privacy notice, translated plainly and accurately "
            'into their language, keeping the name "OpenAI": '
            f'"{AI_NOTICE_I18N["en"]}" '
        )
    seed_input = [{
        "role": "user",
        "content": (
            "Begin the intake. Greet the resident warmly in their preferred "
            f"language. {notice_rule}Do not call the conversation "
            "confidential or private. If the resident selected a life-event "
            "scenario before starting, briefly acknowledge that scenario with "
            "calm, practical empathy, then ask one focused follow-up question. "
            "Otherwise, briefly explain you'll ask a few questions to find "
            "services that fit, mention it takes 3-5 minutes, and end with an "
            "open question about what brings them here today."
        ),
    }]

    response = await client.responses.create(
        model=settings.openai_model,
        instructions=build_instructions(session),
        input=seed_input,
        reasoning={"effort": settings.openai_reasoning_effort},
        max_output_tokens=600,
        store=False,
    )
    text = (response.output_text or "").strip()
    if text and "OpenAI" not in text:
        # The model dropped the AI disclosure; never send a greeting without it.
        text = f"{text}\n\n{notice or AI_NOTICE_I18N['en']}"
    return text or DEMO_STEPS[0]["message"]


def _conversation_input(session: IntakeSession) -> list[dict[str, Any]]:
    """Model input rebuilt from the visible (already redacted) conversation.

    Only resident and assistant text is replayed across turns. Tool calls,
    tool outputs, and reasoning items live only inside one turn's loop.
    """
    return [
        {"role": m.role.value, "content": m.content}
        for m in session.conversation
        if m.role in (MessageRole.user, MessageRole.assistant) and m.content.strip()
    ]


async def _responses_flow(session: IntakeSession) -> IntakeMessage:
    """Run the latest user turn through the Responses API agent loop."""
    settings = get_settings()
    client = _openai_client()

    turn_input = _conversation_input(session)
    crisis_seen = False
    iterations = 0
    final_text = ""

    while iterations < settings.openai_max_tool_iterations:
        response = await client.responses.create(
            model=settings.openai_model,
            instructions=build_instructions(session),
            input=turn_input,
            tools=TOOL_SCHEMAS,
            reasoning={"effort": settings.openai_reasoning_effort},
            max_output_tokens=2000,
            # Don't let OpenAI persist the conversation. Encrypted reasoning
            # is requested so this turn's reasoning items can be replayed
            # within the tool loop; it is never kept across turns.
            store=False,
            include=["reasoning.encrypted_content"],
        )

        for item in response.output:
            turn_input.append(_item_to_dict(item))

        function_calls = [
            it for it in response.output if getattr(it, "type", None) == "function_call"
        ]
        if function_calls:
            for fc in function_calls:
                args: dict[str, Any] = {}
                if fc.arguments:
                    try:
                        parsed = json.loads(fc.arguments)
                        args = parsed if isinstance(parsed, dict) else {}
                    except json.JSONDecodeError:
                        args = {}
                output_str, fired_crisis = dispatch_tool(session, fc.name, args)
                crisis_seen = crisis_seen or fired_crisis
                turn_input.append({
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
        progress_percent=estimate_progress(session.extracted_profile),
        is_complete=session.status == IntakeStatus.completed,
        crisis_detected=crisis_seen,
    )
    session.conversation.append(msg)
    return msg


def _item_to_dict(item: Any) -> dict[str, Any]:
    """Best-effort conversion of a Responses output item to a dict.

    The OpenAI SDK returns Pydantic models; ``model_dump`` keeps the shape
    the API expects when the same items are sent back within the turn.
    """
    if hasattr(item, "model_dump"):
        return item.model_dump(exclude_none=True, mode="json")
    if isinstance(item, dict):
        return item
    return json.loads(json.dumps(item, default=str))

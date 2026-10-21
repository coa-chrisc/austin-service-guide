"""Intake conversation router.

Stateless: the browser holds the intake state (``IntakeState``) in
sessionStorage and sends it with every request; each endpoint rebuilds a
working session from it, does its work, and returns the updated state. The
server keeps nothing between requests.
"""

from __future__ import annotations

import html
import json
import re
from typing import Any, Literal

import httpx
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field, field_validator, model_validator

from app.config import get_settings
from app.models import (
    MAX_MATCHED_IDS,
    IntakeMessageRequest,
    IntakeSession,
    IntakeStartRequest,
    IntakeState,
    IntakeStatus,
)
from app.services import catalog
from app.services.ai import process_message, start_persona_session, start_session
from app.services.grounding import ground_service_ids
from app.services.i18n import (
    PLAN_SUMMARY_I18N,
    translate_match_reasoning,
    translate_risk_flag,
    translate_sequence_reason,
    translate_service_description,
)
from app.services.intake_state import normalize_language, session_from_state, state_from_session
from app.services.matching import calculate_benefits
from app.services.notify import send_email, send_sms
from app.services.personas import get_persona, list_personas
from app.services.plan import build_application_order
from app.services.realtime import (
    build_realtime_session_config,
    execute_realtime_tool,
    record_realtime_transcript,
)
from app.services.realtime_debug import (
    get_realtime_debug_events,
    get_realtime_debug_sessions,
    record_realtime_debug_event,
)

router = APIRouter(prefix="/api/v1/intake", tags=["intake"])

# Upper bound on one client debug event's serialized ``detail``.
_MAX_DEBUG_DETAIL_CHARS = 32_000
# Random per-voice-session id the browser generates for the opt-in debug log.
_TRACE_ID_PATTERN = r"^[A-Za-z0-9_-]{0,80}$"
# Services listed in a share message.
_MAX_SHARED_SERVICES = 8

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_PHONE_RE = re.compile(r"^\+?\d{10,15}$")


# ── Request bodies ───────────────────────────────────────────────────

class StateRequest(BaseModel):
    state: IntakeState


class ShareRequest(BaseModel):
    channel: Literal["sms", "email"]
    recipient: str = Field(min_length=3, max_length=200)
    service_ids: list[str] = Field(min_length=1, max_length=MAX_MATCHED_IDS)
    language: str = Field(default="en", max_length=16)

    @field_validator("service_ids")
    @classmethod
    def _bound_ids(cls, value: list[str]) -> list[str]:
        if any(len(v) > 100 for v in value):
            raise ValueError("service id too long")
        return value

    @model_validator(mode="after")
    def _check_recipient(self) -> "ShareRequest":
        value = self.recipient.strip()
        if self.channel == "sms":
            value = re.sub(r"[\s().-]", "", value)
            if not _PHONE_RE.match(value):
                raise ValueError("recipient must be a phone number")
        elif not _EMAIL_RE.match(value):
            raise ValueError("recipient must be an email address")
        self.recipient = value
        return self


class LoadPersonaRequest(BaseModel):
    persona_id: str = Field(min_length=1, max_length=100)


class RealtimeSecretRequest(BaseModel):
    state: IntakeState
    language: str = Field(default="", max_length=16)
    trace_id: str = Field(default="", pattern=_TRACE_ID_PATTERN)


class RealtimeToolRequest(BaseModel):
    state: IntakeState
    name: str = Field(min_length=1, max_length=100)
    arguments: dict[str, Any] = Field(default_factory=dict)
    call_id: str = Field(default="", max_length=200)
    trace_id: str = Field(default="", pattern=_TRACE_ID_PATTERN)


class RealtimeTranscriptRequest(BaseModel):
    state: IntakeState
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=5000)
    trace_id: str = Field(default="", pattern=_TRACE_ID_PATTERN)


class RealtimeDebugEventRequest(BaseModel):
    trace_id: str = Field(min_length=1, pattern=_TRACE_ID_PATTERN)
    event: str = Field(min_length=1, max_length=120)
    source: str = Field(default="client", max_length=40)
    status: str | None = Field(default=None, max_length=80)
    detail: dict[str, Any] = Field(default_factory=dict)

    @field_validator("detail")
    @classmethod
    def _bound_detail(cls, value: dict[str, Any]) -> dict[str, Any]:
        # The sanitizer clips each string, but cap the whole payload so a
        # client can't make the server parse and redact megabytes per event.
        if len(json.dumps(value, default=str)) > _MAX_DEBUG_DETAIL_CHARS:
            raise ValueError(f"detail must serialize to at most {_MAX_DEBUG_DETAIL_CHARS} characters")
        return value


def _state(session: IntakeSession) -> dict[str, Any]:
    return state_from_session(session).model_dump()


def _require_in_progress(session: IntakeSession) -> None:
    if session.status == IntakeStatus.completed:
        raise HTTPException(status_code=400, detail="Intake already completed")


# ── Start / message / persona ────────────────────────────────────────

@router.get("/personas")
async def get_personas():
    """List available demo personas for the ?demo=1 launcher."""
    return {"personas": list_personas()}


@router.post("/load-persona")
async def load_persona(body: LoadPersonaRequest):
    """Return a completed intake state pre-seeded by a demo persona."""
    session = await start_persona_session(body.persona_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Unknown persona")
    persona = get_persona(body.persona_id)
    last = session.conversation[-1] if session.conversation else None
    return {
        "state": _state(session),
        "language": session.language,
        "entry_source": session.entry_source,
        "status": session.status.value,
        "conversation": [m.model_dump() for m in session.conversation],
        "last_message": last.model_dump() if last else None,
        "opening_message": persona.opening_message if persona else "",
        "script": [
            {"role": t.role, "content": t.content, "delay_ms": t.delay_ms}
            for t in (persona.script if persona else [])
        ],
    }


@router.post("/start")
async def start_intake(body: IntakeStartRequest | None = None):
    """Start an intake and return its initial state and greeting."""
    body = body or IntakeStartRequest()
    session = await start_session(
        language=body.language, life_event=body.life_event, focus=body.focus, mode=body.mode
    )
    return {
        "state": _state(session),
        "language": session.language,
        "greeting": session.conversation[0].model_dump() if session.conversation else None,
    }


@router.post("/message")
async def send_message(body: IntakeMessageRequest):
    """Send a resident message; returns the reply and the updated state."""
    session = session_from_state(body.state)
    _require_in_progress(session)
    reply, user_message = await process_message(session, body.message, body.language)
    return {
        "state": _state(session),
        "response": reply.model_dump(),
        # The stored (PII-redacted) copy of the resident's message, so the
        # client can replace its optimistic local copy.
        "user_message": user_message.model_dump(),
        "status": session.status.value,
    }


# ── Results / plan / share ───────────────────────────────────────────

@router.post("/results")
async def get_results(body: StateRequest):
    """Hydrate results for a client-held intake state. No model calls.

    Matches are re-read from the catalog for the grounded service ids; risk
    flags and benefit estimates are recomputed from the profile.
    """
    session = session_from_state(body.state)
    plan = session.plan
    benefits = calculate_benefits(session.extracted_profile, session.matches) if session.matches else {}
    sequencing = [item.model_dump() for item in plan.items] if plan else []
    plan_synthesis = plan.summary if plan else ""

    lang = session.language or "en"
    matches_payload = [m.model_dump() for m in session.matches]
    risk_flags_payload = [r.model_dump() for r in session.risk_flags]

    if lang != "en":
        # Localize service descriptions + match reasoning so the plan reads
        # in the resident's language. Untranslated services fall through
        # to English.
        for m in matches_payload:
            sid = m["service"].get("id")
            translated_desc = translate_service_description(sid, lang) if sid else None
            if translated_desc:
                m["service"]["description"] = translated_desc
            m["match_reasoning"] = translate_match_reasoning(m.get("match_reasoning", ""), lang)

        for item in sequencing:
            translated_reason = translate_sequence_reason(item.get("category", ""), lang)
            if translated_reason:
                item["reason"] = translated_reason

        for rf in risk_flags_payload:
            translated_rf = translate_risk_flag(rf.get("risk_type", ""), lang)
            if translated_rf:
                rf["description"] = translated_rf["description"]
                rf["label"] = translated_rf["label"]

        if plan is not None and not plan_synthesis:
            plan_synthesis = PLAN_SUMMARY_I18N.get(lang, "")

    return {
        "state": _state(session),
        "status": session.status.value,
        "language": lang,
        "profile": session.extracted_profile.model_dump(),
        "matches": matches_payload,
        "risk_flags": risk_flags_payload,
        "benefits_estimate": benefits,
        "application_order": sequencing,
        "plan_synthesis": plan_synthesis,
        "plan_ai_generated": bool(plan and plan.ai_generated),
        # True when there are matches but no plan yet: call POST /plan.
        "plan_pending": bool(session.matches) and plan is None,
        "conversation_length": len(session.conversation),
    }


@router.post("/plan")
async def build_plan(body: StateRequest):
    """Build the ordered plan for a completed intake and return it in the state.

    Uses the model when live AI is on (ids grounded to the matched services),
    otherwise the rules sequencer. Nothing is cached on the server.
    """
    session = session_from_state(body.state)
    if session.status != IntakeStatus.completed or not session.matches:
        raise HTTPException(status_code=400, detail="Complete the intake first.")
    if session.plan is None:
        session.plan = await build_application_order(session)
    return {"state": _state(session), "plan": session.plan.model_dump()}


def _share_text(services: list, origin: str, extra: int) -> str:
    lines = ["Your Austin Service Guide matches:", ""]
    for i, svc in enumerate(services, start=1):
        line = f"{i}. {svc.name}"
        if svc.phone:
            line += f" — {svc.phone}"
        lines.append(line)
        lines.append(f"   {origin}/services/{svc.slug}")
    if extra:
        lines.append("")
        lines.append(f"…and {extra} more. Browse all services at {origin}/services")
    return "\n".join(lines)


def _share_html(services: list, origin: str, extra: int) -> str:
    items = "".join(
        f"<li><strong>{html.escape(svc.name)}</strong>"
        f"{f' — {html.escape(svc.phone)}' if svc.phone else ''}<br>"
        f'<a href="{html.escape(origin)}/services/{html.escape(svc.slug)}">'
        f"{html.escape(origin)}/services/{html.escape(svc.slug)}</a></li>"
        for svc in services
    )
    more = (
        f'<p>…and {extra} more. <a href="{html.escape(origin)}/services">'
        "Browse all services</a></p>"
        if extra else ""
    )
    return f"<h2>Your Austin Service Guide matches</h2><ol>{items}</ol>{more}"


@router.post("/share")
async def share_results(body: ShareRequest):
    """Send a list of catalog services to the resident via SMS or email.

    The message is built only from catalog data for the grounded service
    ids: names, phone numbers, and /services/{slug} links. The recipient is
    used for this one send and is never stored or logged unmasked.
    """
    ids = ground_service_ids(body.service_ids)
    services = [svc for svc in (catalog.get_service_by_id(sid) for sid in ids) if svc]
    if not services:
        raise HTTPException(status_code=400, detail="No matching services to share.")

    origin = get_settings().public_origin.rstrip("/")
    shown = services[:_MAX_SHARED_SERVICES]
    extra = len(services) - len(shown)
    text_body = _share_text(shown, origin, extra)

    try:
        if body.channel == "sms":
            result = await send_sms(to=body.recipient, body=text_body)
        else:
            result = await send_email(
                to=body.recipient,
                subject="Your Austin Service Guide matches",
                text=text_body,
                html=_share_html(shown, origin, extra),
            )
    except (RuntimeError, httpx.HTTPError) as exc:
        # notify.py raises RuntimeError when Twilio/SendGrid reject the send.
        raise HTTPException(
            status_code=502, detail="Could not send right now. Please try again."
        ) from exc

    return {
        **{k: v for k, v in result.items() if k != "to"},
        "service_count": len(services),
    }


# ── Realtime voice ───────────────────────────────────────────────────

def _require_realtime_debug_enabled() -> None:
    """Reject debug-endpoint access unless the opt-in debug file log is on."""
    if not get_settings().realtime_debug_log_enabled:
        raise HTTPException(status_code=404, detail="Not found")


@router.post("/realtime/client-secret")
async def create_realtime_client_secret(body: RealtimeSecretRequest):
    """Create an ephemeral Realtime client secret for browser voice intake.

    The session instructions are built from the client-sent state. Only the
    server's API key is sent to OpenAI; no inbound request headers are
    forwarded.
    """
    session = session_from_state(body.state)
    _require_in_progress(session)
    if body.language:
        session.language = normalize_language(body.language, session.language)

    settings = get_settings()
    trace_id = body.trace_id
    record_realtime_debug_event(trace_id, {
        "event": "client_secret_requested",
        "source": "server",
        "status": session.status.value,
        "detail": {
            "language": session.language,
            "model": settings.openai_realtime_model,
            "reasoning_effort": settings.openai_realtime_reasoning_effort,
        },
    })
    if not settings.use_live_ai:
        record_realtime_debug_event(trace_id, {
            "event": "client_secret_failed",
            "source": "server",
            "status": "live_ai_disabled",
            "detail": {"demo_mode": settings.demo_mode},
        })
        raise HTTPException(
            status_code=400,
            detail="Realtime voice requires OPENAI_API_KEY and DEMO_MODE=false.",
        )

    payload = {
        "expires_after": {
            "anchor": "created_at",
            "seconds": settings.openai_realtime_secret_ttl_seconds,
        },
        "session": build_realtime_session_config(session),
    }
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            res = await client.post(
                "https://api.openai.com/v1/realtime/client_secrets",
                headers={
                    "Authorization": f"Bearer {settings.openai_api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            res.raise_for_status()
    except httpx.HTTPStatusError as exc:
        record_realtime_debug_event(trace_id, {
            "event": "client_secret_failed",
            "source": "server",
            "status": str(exc.response.status_code),
            # Upstream error bodies can include account/key hints; keep them
            # in the opt-in debug trace only.
            "detail": {"error": exc.response.text or "OpenAI Realtime client secret failed"},
        })
        raise HTTPException(
            status_code=502, detail="Realtime voice is temporarily unavailable."
        ) from exc
    except httpx.HTTPError as exc:
        record_realtime_debug_event(trace_id, {
            "event": "client_secret_failed",
            "source": "server",
            "status": type(exc).__name__,
            "detail": {"error": type(exc).__name__},
        })
        raise HTTPException(
            status_code=502,
            detail=f"OpenAI Realtime client secret failed: {type(exc).__name__}",
        ) from exc

    data = res.json()
    record_realtime_debug_event(trace_id, {
        "event": "client_secret_created",
        "source": "server",
        "status": session.status.value,
        "detail": {
            "client_session_id": data.get("session", {}).get("id"),
            "expires_at": data.get("expires_at"),
        },
    })
    return {
        "state": _state(session),
        "model": settings.openai_realtime_model,
        "session_config": payload["session"],
        "client_secret": data,
    }


@router.post("/realtime/tool")
async def run_realtime_tool(body: RealtimeToolRequest):
    """Execute a Realtime tool call against the client-sent state."""
    session = session_from_state(body.state)
    result = execute_realtime_tool(
        session, body.name, body.arguments, call_id=body.call_id, trace_id=body.trace_id
    )
    return {"state": _state(session), "call_id": body.call_id, **result}


@router.post("/realtime/transcript")
async def sync_realtime_transcript(body: RealtimeTranscriptRequest):
    """Add a committed Realtime transcript turn to the client-sent state."""
    session = session_from_state(body.state)
    result = record_realtime_transcript(session, body.role, body.content)
    record_realtime_debug_event(body.trace_id, {
        "event": "transcript_synced",
        "source": "server",
        "status": result["status"],
        "detail": {
            "role": body.role,
            "content_length": len(body.content),
            "redacted_types": result["redacted"],
            "message_count": len(result["messages"]),
            "progress_percent": result["progress_percent"],
            "is_complete": result["is_complete"],
            "crisis_detected": result["crisis_detected"],
            "error": result.get("error"),
            "conversation_length": len(session.conversation),
            # Field names only — never profile values.
            "profile_fields_filled": sorted(
                name for name, value in session.extracted_profile
                if value not in (None, "", [], ["en"])
            ),
        },
    })
    return {"state": _state(session), **result}


@router.get("/realtime/debug/sessions")
async def read_realtime_debug_sessions(limit: int = Query(default=20, ge=1, le=100)):
    """Return recent voice debug traces from the opt-in debug file."""
    _require_realtime_debug_enabled()
    return {"sessions": get_realtime_debug_sessions(limit=limit)}


@router.post("/realtime/debug")
async def write_realtime_debug_event(body: RealtimeDebugEventRequest):
    """Record a client-side voice debug event in the opt-in debug file."""
    _require_realtime_debug_enabled()
    entry = record_realtime_debug_event(body.trace_id, {
        "event": body.event,
        "source": body.source,
        "status": body.status,
        "detail": body.detail,
    })
    return {"ok": True, "event": entry}


@router.get("/realtime/debug/{trace_id}")
async def read_realtime_debug_events(
    trace_id: str,
    limit: int = Query(default=200, ge=1, le=500),
):
    """Return recent debug events for one voice trace."""
    _require_realtime_debug_enabled()
    return {"trace_id": trace_id, "events": get_realtime_debug_events(trace_id, limit=limit)}

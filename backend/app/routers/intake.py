"""Intake conversation router."""

from __future__ import annotations

from typing import Any, Literal

import httpx
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.config import get_settings
from app.models import IntakeMessageRequest, IntakeStartRequest, ResidentProfile
from app.services.ai import (
    build_realtime_session_config,
    execute_realtime_tool,
    generate_plan_summary,
    get_realtime_debug_events,
    get_realtime_debug_sessions,
    get_application_order,
    get_session,
    process_message,
    record_realtime_debug_event,
    record_realtime_transcript,
    start_persona_session,
    start_session,
)
from app.services.notify import send_email, send_sms
from app.services.personas import list_personas

router = APIRouter(prefix="/api/v1/intake", tags=["intake"])


def _profile_debug_snapshot(profile: ResidentProfile | None) -> dict[str, Any] | None:
    if profile is None:
        return None
    return {
        "zip_code": profile.zip_code,
        "housing_situation": profile.housing_situation,
        "household_size": profile.household_size,
        "employment_status": profile.employment_status,
        "income_bracket": profile.income_bracket,
        "insurance_status": profile.insurance_status,
        "has_children": profile.has_children,
        "veteran_status": profile.veteran_status,
        "has_disability": profile.has_disability,
        "immediate_needs": profile.immediate_needs,
        "languages_spoken": profile.languages_spoken,
        "crisis_indicators": profile.crisis_indicators,
    }


class ShareRequest(BaseModel):
    channel: Literal["sms", "email"]
    recipient: str = Field(min_length=3, max_length=200)
    language: str = "en"


class LoadPersonaRequest(BaseModel):
    persona_id: str = Field(min_length=1, max_length=100)


class RealtimeSecretRequest(BaseModel):
    language: str = "en"


class RealtimeToolRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    arguments: dict[str, Any] = Field(default_factory=dict)
    call_id: str = ""


class RealtimeTranscriptRequest(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=5000)


class RealtimeDebugEventRequest(BaseModel):
    event: str = Field(min_length=1, max_length=120)
    source: str = Field(default="client", max_length=40)
    status: str | None = Field(default=None, max_length=80)
    detail: dict[str, Any] = Field(default_factory=dict)


@router.get("/personas")
async def get_personas():
    """List available demo personas for the ?demo=1 launcher."""
    return {"personas": list_personas()}


@router.post("/load-persona")
async def load_persona(body: LoadPersonaRequest):
    """Create a session pre-seeded by a demo persona and return its id.

    The frontend should route to /intake/{session_id} after this call —
    the seeded profile is a hypothesis the LLM can refine through normal
    conversation.
    """
    session = await start_persona_session(body.persona_id)
    if session is None:
        raise HTTPException(status_code=404, detail=f"Unknown persona: {body.persona_id}")
    last = session.conversation[-1] if session.conversation else None
    from app.services.personas import get_persona
    persona = get_persona(body.persona_id)
    script = []
    opening_message = ""
    if persona is not None:
        opening_message = persona.opening_message
        script = [
            {"role": t.role, "content": t.content, "delay_ms": t.delay_ms}
            for t in persona.script
        ]
    return {
        "session_id": session.id,
        "language": session.language,
        "entry_source": session.entry_source,
        "status": session.status.value,
        "conversation": [m.model_dump() for m in session.conversation],
        "last_message": last.model_dump() if last else None,
        "opening_message": opening_message,
        "script": script,
    }


@router.post("/start")
async def start_intake(body: IntakeStartRequest | None = None):
    """Create a new intake session and return the greeting."""
    language = body.language if body else "en"
    life_event = body.life_event if body else None
    focus = body.focus if body else None
    mode = body.mode if body else "text"
    session = await start_session(
        language=language, life_event=life_event, focus=focus, mode=mode
    )
    return {
        "session_id": session.id,
        "language": session.language,
        "greeting": session.conversation[0].model_dump() if session.conversation else None,
    }


def _require_realtime_debug_enabled() -> None:
    """Reject debug-endpoint access when disk-backed traces are disabled.

    The realtime debug endpoints expose short transcript previews and are
    intended only for local troubleshooting. Gating them on the same env
    flag that enables the on-disk log avoids leaking traces in any
    deployment that did not opt into them.
    """
    if not get_settings().realtime_debug_log_enabled:
        raise HTTPException(status_code=404, detail="Not found")


@router.get("/realtime/debug/sessions")
async def read_realtime_debug_sessions(
    limit: int = Query(default=20, ge=1, le=100),
):
    """Return recent Realtime voice debug sessions."""
    _require_realtime_debug_enabled()
    return {"sessions": get_realtime_debug_sessions(limit=limit)}


@router.post("/{session_id}/message")
async def send_message(session_id: str, body: IntakeMessageRequest):
    """Send a user message and receive the assistant's response."""
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.status.value == "completed":
        raise HTTPException(status_code=400, detail="Session already completed")

    response = await process_message(session_id, body.message, body.language)
    return {
        "session_id": session_id,
        "response": response.model_dump(),
        "status": session.status.value,
    }


@router.post("/{session_id}/realtime/client-secret")
async def create_realtime_client_secret(
    session_id: str,
    body: RealtimeSecretRequest | None = None,
):
    """Create an ephemeral Realtime client secret for browser voice intake."""
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.status.value == "completed":
        raise HTTPException(status_code=400, detail="Session already completed")

    settings = get_settings()
    record_realtime_debug_event(
        session_id,
        {
            "event": "client_secret_requested",
            "source": "server",
            "status": session.status.value,
            "detail": {
                "language": body.language if body else session.language,
                "session_language": session.language,
                "model": settings.openai_realtime_model,
                "reasoning_effort": settings.openai_realtime_reasoning_effort,
            },
        },
    )
    if not settings.use_live_ai:
        record_realtime_debug_event(
            session_id,
            {
                "event": "client_secret_failed",
                "source": "server",
                "status": "live_ai_disabled",
                "detail": {"demo_mode": settings.demo_mode},
            },
        )
        raise HTTPException(
            status_code=400,
            detail="Realtime voice requires OPENAI_API_KEY and DEMO_MODE=false.",
        )

    if body and body.language and body.language != session.language:
        session.language = body.language

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
        detail = exc.response.text or "OpenAI Realtime client secret failed"
        record_realtime_debug_event(
            session_id,
            {
                "event": "client_secret_failed",
                "source": "server",
                "status": str(exc.response.status_code),
                "detail": {"error": detail},
            },
        )
        raise HTTPException(status_code=502, detail=detail) from exc
    except httpx.HTTPError as exc:
        record_realtime_debug_event(
            session_id,
            {
                "event": "client_secret_failed",
                "source": "server",
                "status": type(exc).__name__,
                "detail": {"error": str(exc)},
            },
        )
        raise HTTPException(
            status_code=502,
            detail=f"OpenAI Realtime client secret failed: {type(exc).__name__}",
        ) from exc

    data = res.json()
    record_realtime_debug_event(
        session_id,
        {
            "event": "client_secret_created",
            "source": "server",
            "status": session.status.value,
            "detail": {
                "client_session_id": data.get("session", {}).get("id"),
                "expires_at": data.get("expires_at"),
            },
        },
    )
    return {
        "session_id": session_id,
        "model": settings.openai_realtime_model,
        "session_config": payload["session"],
        "client_secret": data,
    }


@router.post("/{session_id}/realtime/tool")
async def run_realtime_tool(session_id: str, body: RealtimeToolRequest):
    """Execute a Realtime tool call against the current intake session."""
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    result = execute_realtime_tool(
        session_id,
        body.name,
        body.arguments,
        call_id=body.call_id,
    )
    return {
        "session_id": session_id,
        "call_id": body.call_id,
        **result,
    }


@router.post("/{session_id}/realtime/transcript")
async def sync_realtime_transcript(
    session_id: str,
    body: RealtimeTranscriptRequest,
):
    """Persist a committed Realtime transcript message into chat history."""
    record_realtime_debug_event(
        session_id,
        {
            "event": "transcript_sync_requested",
            "source": "server",
            "detail": {
                "role": body.role,
                "content_length": len(body.content),
                "content_preview": body.content[:240],
            },
        },
    )
    result = record_realtime_transcript(session_id, body.role, body.content)
    if result is None:
        record_realtime_debug_event(
            session_id,
            {
                "event": "transcript_sync_failed",
                "source": "server",
                "status": "not_found",
                "detail": {"role": body.role},
            },
        )
        raise HTTPException(status_code=404, detail="Session not found")
    session = get_session(session_id)
    record_realtime_debug_event(
        session_id,
        {
            "event": "transcript_synced",
            "source": "server",
            "status": result["status"],
            "detail": {
                "role": body.role,
                "message_count": len(result["messages"]),
                "progress_percent": result["progress_percent"],
                "is_complete": result["is_complete"],
                "crisis_detected": result["crisis_detected"],
                "error": result.get("error"),
                "session_status": session.status.value if session else None,
                "conversation_length": len(session.conversation) if session else None,
                "profile": _profile_debug_snapshot(
                    session.extracted_profile if session else None
                ),
            },
        },
    )
    return {
        "session_id": session_id,
        **result,
    }


@router.post("/{session_id}/realtime/debug")
async def write_realtime_debug_event(
    session_id: str,
    body: RealtimeDebugEventRequest,
):
    """Record a client-side Realtime voice debug event for this session."""
    _require_realtime_debug_enabled()
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    entry = record_realtime_debug_event(
        session_id,
        {
            "event": body.event,
            "source": body.source,
            "status": body.status,
            "detail": body.detail,
        },
    )
    return {"ok": True, "event": entry}


@router.get("/{session_id}/realtime/debug")
async def read_realtime_debug_events(
    session_id: str,
    limit: int = Query(default=200, ge=1, le=500),
):
    """Return recent Realtime voice debug events for this session."""
    _require_realtime_debug_enabled()
    session = get_session(session_id)
    events = get_realtime_debug_events(session_id, limit=limit)
    if not session and not events:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"session_id": session_id, "events": events}


@router.get("/{session_id}/results")
async def get_results(session_id: str):
    """Return matching results after intake completion."""
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    from app.services.matching import calculate_benefits
    from app.services.i18n import (
        translate_match_reasoning,
        translate_service_description,
        translate_sequence_reason,
        translate_risk_flag,
        PLAN_SUMMARY_I18N,
    )

    benefits = {}
    sequencing: list[dict] = []
    plan_synthesis = ""
    plan_ai_generated = False
    if session.matches:
        benefits = calculate_benefits(session.extracted_profile, session.matches)
        plan = await get_application_order(session)
        sequencing = plan["items"]
        plan_synthesis = plan["summary"]
        plan_ai_generated = plan["ai_generated"]

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
            m["match_reasoning"] = translate_match_reasoning(
                m.get("match_reasoning", ""), lang
            )

        for item in sequencing:
            translated_reason = translate_sequence_reason(item.get("category", ""), lang)
            if translated_reason:
                item["reason"] = translated_reason

        for rf in risk_flags_payload:
            translated_rf = translate_risk_flag(rf.get("risk_type", ""), lang)
            if translated_rf:
                rf["description"] = translated_rf["description"]
                rf["label"] = translated_rf["label"]

        if not plan_synthesis:
            plan_synthesis = PLAN_SUMMARY_I18N.get(lang, "")

    return {
        "session_id": session_id,
        "status": session.status.value,
        "language": lang,
        "profile": session.extracted_profile.model_dump(),
        "matches": matches_payload,
        "risk_flags": risk_flags_payload,
        "benefits_estimate": benefits,
        "application_order": sequencing,
        "plan_synthesis": plan_synthesis,
        "plan_ai_generated": plan_ai_generated,
        "conversation_length": len(session.conversation),
    }


@router.get("/{session_id}/summary")
async def get_plan_summary(session_id: str):
    """Return a one-sentence resident-facing summary of a saved plan."""
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    summary = await generate_plan_summary(session)
    return {
        "session_id": session_id,
        "summary": summary,
        "match_count": len(session.matches),
        "started_at": session.created_at.isoformat(),
        "status": session.status.value,
    }


@router.post("/{session_id}/share")
async def share_results(session_id: str, body: ShareRequest):
    """Send the matched-service summary to the resident via SMS or email."""
    session = get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if not session.matches:
        raise HTTPException(
            status_code=400, detail="No matches yet — complete the intake first."
        )

    settings = get_settings()
    origin = settings.public_origin.rstrip("/")

    # Build a plain-text summary (works for SMS, doubles as email body)
    lines = [
        "Your Austin Service Guide matches:",
        "",
    ]
    for i, m in enumerate(session.matches[:8], start=1):
        svc = m.service
        line = f"{i}. {svc.name}"
        if svc.phone:
            line += f" — {svc.phone}"
        lines.append(line)
        lines.append(f"   {origin}/services/{svc.slug}")
    if len(session.matches) > 8:
        lines.append("")
        lines.append(f"…and {len(session.matches) - 8} more at:")
        lines.append(f"{origin}/results/{session_id}")

    text_body = "\n".join(lines)

    if body.channel == "sms":
        result = await send_sms(to=body.recipient, body=text_body)
    else:
        html_body = (
            "<h2>Your Austin Service Guide matches</h2>"
            "<ol>"
            + "".join(
                f'<li><strong>{m.service.name}</strong>'
                f'{f" — {m.service.phone}" if m.service.phone else ""}<br>'
                f'<a href="{origin}/services/{m.service.slug}">'
                f"{origin}/services/{m.service.slug}</a></li>"
                for m in session.matches[:8]
            )
            + "</ol>"
            f'<p><a href="{origin}/results/{session_id}">'
            f"View all matches</a></p>"
        )
        result = await send_email(
            to=body.recipient,
            subject="Your Austin Service Guide matches",
            text=text_body,
            html=html_body,
        )

    return result

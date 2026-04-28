"""Intake conversation router."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.config import get_settings
from app.models import IntakeMessageRequest, IntakeStartRequest
from app.services.ai import (
    generate_plan_summary,
    get_application_order,
    get_session,
    process_message,
    start_persona_session,
    start_session,
)
from app.services.notify import send_email, send_sms
from app.services.personas import list_personas

router = APIRouter(prefix="/api/v1/intake", tags=["intake"])


class ShareRequest(BaseModel):
    channel: Literal["sms", "email"]
    recipient: str = Field(min_length=3, max_length=200)
    language: str = "en"


class LoadPersonaRequest(BaseModel):
    persona_id: str = Field(min_length=1, max_length=100)


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
    session = await start_session(
        language=language, life_event=life_event, focus=focus
    )
    return {
        "session_id": session.id,
        "language": session.language,
        "greeting": session.conversation[0].model_dump() if session.conversation else None,
    }


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

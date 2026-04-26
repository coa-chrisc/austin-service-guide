"""Intake conversation router."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.config import get_settings
from app.models import IntakeMessageRequest, IntakeStartRequest
from app.services.ai import (
    generate_plan_summary,
    get_session,
    process_message,
    start_session,
)
from app.services.notify import send_email, send_sms

router = APIRouter(prefix="/api/v1/intake", tags=["intake"])


class ShareRequest(BaseModel):
    channel: Literal["sms", "email"]
    recipient: str = Field(min_length=3, max_length=200)
    language: str = "en"


@router.post("/start")
async def start_intake(body: IntakeStartRequest | None = None):
    """Create a new intake session and return the greeting."""
    language = body.language if body else "en"
    life_event = body.life_event if body else None
    session = await start_session(language=language, life_event=life_event)
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

    from app.services.matching import (
        calculate_benefits,
        recommend_application_order,
    )

    benefits = {}
    sequencing: list[dict] = []
    if session.matches:
        benefits = calculate_benefits(session.extracted_profile, session.matches)
        sequencing = recommend_application_order(session.matches)

    return {
        "session_id": session_id,
        "status": session.status.value,
        "profile": session.extracted_profile.model_dump(),
        "matches": [m.model_dump() for m in session.matches],
        "risk_flags": [r.model_dump() for r in session.risk_flags],
        "benefits_estimate": benefits,
        "application_order": sequencing,
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

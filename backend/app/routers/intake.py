"""Intake conversation router."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.models import IntakeMessageRequest, IntakeStartRequest
from app.services.ai import get_session, process_message, start_session

router = APIRouter(prefix="/api/v1/intake", tags=["intake"])


@router.post("/start")
async def start_intake(body: IntakeStartRequest | None = None):
    """Create a new intake session and return the greeting."""
    language = body.language if body else "en"
    session = await start_session(language=language)
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

    benefits = {}
    if session.matches:
        benefits = calculate_benefits(session.extracted_profile, session.matches)

    return {
        "session_id": session_id,
        "status": session.status.value,
        "profile": session.extracted_profile.model_dump(),
        "matches": [m.model_dump() for m in session.matches],
        "risk_flags": [r.model_dump() for r in session.risk_flags],
        "benefits_estimate": benefits,
        "conversation_length": len(session.conversation),
    }

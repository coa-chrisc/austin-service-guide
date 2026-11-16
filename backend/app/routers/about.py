"""Public deployment facts for the "How it works" page.

Configuration only: no keys, secrets, hostnames or environment dump, and no
model call. Behind the access gate when the gate is on, like every route.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from app.access_gate import load_gate_config
from app.config import get_settings
from app.middleware import MAX_INTAKE_BODY_BYTES
from app.models import MAX_MESSAGE_CHARS, MAX_STATE_MESSAGES
from app.services import catalog, catalog_loader
from app.services.city import get_city
from app.services.pii import PLACEHOLDERS
from app.services.tool_schemas import TOOL_SCHEMAS

router = APIRouter(prefix="/api/v1", tags=["about"])

# Offered to the Realtime voice model only; the page lists the text agent's tools.
_VOICE_ONLY_TOOLS = {"wait_for_user"}


def _catalog_facts() -> dict[str, Any]:
    active = catalog.get_all_services(page=1, page_size=10_000)["items"]
    verified = catalog_loader.load_verified_slugs()
    local_lines = [
        r for r in catalog.get_crisis_resources()
        if r.crisis_topic and r.phone not in catalog_loader.NATIONAL_CRISIS_PHONES
    ]
    return {
        "services_total": len(active),
        "services_verified": sum(1 for s in active if s.slug in verified),
        "categories": len(catalog.get_categories()),
        "local_crisis_lines": len(local_lines),
    }


@router.get("/about")
async def about() -> dict[str, Any]:
    """The running deployment's model, voice mode, redaction kinds, limits and catalog counts."""
    settings = get_settings()
    return {
        "app_name": get_city().app_name,
        "live_ai": settings.use_live_ai,
        "text_model": settings.openai_model,
        "reasoning_effort": settings.openai_reasoning_effort,
        "plan_reasoning_effort": settings.openai_plan_reasoning_effort,
        "max_tool_iterations": settings.openai_max_tool_iterations,
        "tools": [s["name"] for s in TOOL_SCHEMAS if s["name"] not in _VOICE_ONLY_TOOLS],
        "voice": {
            "mode": "realtime_audio" if settings.realtime_audio_enabled else "intercepted_text",
            "raw_audio_allowed": settings.allow_raw_audio_stream,
            "realtime_model": settings.openai_realtime_model if settings.realtime_audio_enabled else None,
        },
        "pii_kinds": list(PLACEHOLDERS),
        "limits": {
            "intake_body_bytes": MAX_INTAKE_BODY_BYTES,
            "state_messages": MAX_STATE_MESSAGES,
            "message_chars": MAX_MESSAGE_CHARS,
        },
        "catalog": _catalog_facts(),
        "admin": {"auth": "shared_token", "catalog_writes_persist": False},
        "access_gate": load_gate_config() is not None,
    }

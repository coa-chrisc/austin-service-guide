"""Shared guards for admin write routes.

``require_admin_token`` gates every admin write on the shared
``ADMIN_API_TOKEN`` (a stopgap for the demo, not staff authentication).
``require_in_memory_edits`` refuses writes when ``ADMIN_EDIT_MODE`` is
``export_only``: the console then previews and exports changes but never
applies them, so no admin edit changes resident-facing results. Use it on
hosts where instances are short-lived and not shared (serverless).
"""

from __future__ import annotations

import hmac
import os

from fastapi import Header, HTTPException

from app.config import get_settings

EDIT_MODES = ("in_memory", "export_only")


def edit_mode() -> str:
    """``in_memory`` (default) or ``export_only`` (``ADMIN_EDIT_MODE``)."""
    mode = os.environ.get("ADMIN_EDIT_MODE", "").strip().lower()
    return mode if mode in EDIT_MODES else "in_memory"


def require_admin_token(x_admin_token: str | None = Header(None)) -> None:
    """Gate catalog writes on the shared ADMIN_API_TOKEN (constant-time compare)."""
    expected = get_settings().admin_api_token
    if not expected:
        raise HTTPException(
            status_code=403,
            detail=(
                "Admin writes are disabled on this server. Set ADMIN_API_TOKEN "
                "and send it in the X-Admin-Token header."
            ),
        )
    if not hmac.compare_digest((x_admin_token or "").encode(), expected.encode()):
        raise HTTPException(status_code=403, detail="Invalid or missing X-Admin-Token.")


def require_in_memory_edits() -> None:
    if edit_mode() == "export_only":
        raise HTTPException(
            status_code=409,
            detail=(
                "This server runs in export-only mode (ADMIN_EDIT_MODE=export_only): "
                "changes are previewed and exported, never applied."
            ),
        )

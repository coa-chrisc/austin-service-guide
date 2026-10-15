"""Outbound notification helpers — SMS via Twilio, email via SendGrid.

Both have demo-stub fallbacks: if credentials are not configured, we log
the payload and return a successful response so the rest of the demo
still works without external dependencies.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

import httpx

from app.config import get_settings

log = logging.getLogger(__name__)


def _mask(recipient: str) -> str:
    """Keep only the last two characters so logs carry no contact details."""
    return "*" * max(len(recipient) - 2, 0) + recipient[-2:]


_SAFE_FIELD = re.compile(r"^[A-Za-z0-9_.\[\]-]{1,80}$")


def _twilio_error_code(resp: httpx.Response) -> int | None:
    """Twilio's numeric error code. The message text can echo the recipient."""
    try:
        data = resp.json()
    except ValueError:
        return None
    code = data.get("code") if isinstance(data, dict) else None
    return code if isinstance(code, int) and not isinstance(code, bool) else None


def _sendgrid_error_fields(resp: httpx.Response) -> list[str]:
    """Request fields SendGrid flagged (e.g. personalizations.0.to.0.email).

    SendGrid has no numeric error code; the field path is the safe signal.
    Messages are skipped because they can echo the recipient address.
    """
    try:
        data = resp.json()
    except ValueError:
        return []
    errors = data.get("errors") if isinstance(data, dict) else None
    if not isinstance(errors, list):
        return []
    return [
        err["field"]
        for err in errors
        if isinstance(err, dict)
        and isinstance(err.get("field"), str)
        and _SAFE_FIELD.match(err["field"])
    ]


async def send_sms(*, to: str, body: str) -> dict[str, Any]:
    """Send an SMS via Twilio. Stubs out when creds are missing."""
    settings = get_settings()
    if not settings.has_twilio:
        log.info("[notify-stub] SMS to %s (%d chars)", _mask(to), len(body))
        return {"ok": True, "demo": True, "channel": "sms", "to": to}

    url = (
        f"https://api.twilio.com/2010-04-01/Accounts/"
        f"{settings.twilio_account_sid}/Messages.json"
    )
    data = {"From": settings.twilio_from_number, "To": to, "Body": body}
    auth = (settings.twilio_account_sid, settings.twilio_auth_token)

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(url, data=data, auth=auth)
        if resp.status_code >= 400:
            log.error(
                "Twilio error status=%s code=%s",
                resp.status_code,
                _twilio_error_code(resp),
            )
            raise RuntimeError(f"SMS send failed: {resp.status_code}")
    return {"ok": True, "demo": False, "channel": "sms", "to": to}


async def send_email(
    *, to: str, subject: str, text: str, html: str | None = None
) -> dict[str, Any]:
    """Send an email via SendGrid. Stubs out when creds are missing."""
    settings = get_settings()
    if not settings.has_email:
        log.info("[notify-stub] Email to %s (%d chars)", _mask(to), len(text))
        return {"ok": True, "demo": True, "channel": "email", "to": to}

    payload = {
        "personalizations": [{"to": [{"email": to}]}],
        "from": {
            "email": settings.sendgrid_from_email,
            "name": settings.sendgrid_from_name,
        },
        "subject": subject,
        "content": [
            {"type": "text/plain", "value": text},
            *([{"type": "text/html", "value": html}] if html else []),
        ],
    }
    headers = {
        "Authorization": f"Bearer {settings.sendgrid_api_key}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            "https://api.sendgrid.com/v3/mail/send",
            headers=headers,
            data=json.dumps(payload),
        )
        if resp.status_code >= 400:
            log.error(
                "SendGrid error status=%s fields=%s",
                resp.status_code,
                _sendgrid_error_fields(resp),
            )
            raise RuntimeError(f"Email send failed: {resp.status_code}")
    return {"ok": True, "demo": False, "channel": "email", "to": to}

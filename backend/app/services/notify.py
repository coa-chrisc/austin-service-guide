"""Outbound notification helpers — SMS via Twilio, email via SendGrid.

Both have demo-stub fallbacks: if credentials are not configured, we log
the payload and return a successful response so the rest of the demo
still works without external dependencies.
"""

from __future__ import annotations

import json
import logging
from typing import Any

import httpx

from app.config import get_settings

log = logging.getLogger(__name__)


async def send_sms(*, to: str, body: str) -> dict[str, Any]:
    """Send an SMS via Twilio. Stubs out when creds are missing."""
    settings = get_settings()
    if not settings.has_twilio:
        log.info("[notify-stub] SMS to %s: %s", to, body[:80])
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
            log.error("Twilio error %s: %s", resp.status_code, resp.text)
            raise RuntimeError(f"SMS send failed: {resp.status_code}")
    return {"ok": True, "demo": False, "channel": "sms", "to": to}


async def send_email(
    *, to: str, subject: str, text: str, html: str | None = None
) -> dict[str, Any]:
    """Send an email via SendGrid. Stubs out when creds are missing."""
    settings = get_settings()
    if not settings.has_email:
        log.info("[notify-stub] Email to %s subject=%r body=%s",
                 to, subject, text[:80])
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
            log.error("SendGrid error %s: %s", resp.status_code, resp.text)
            raise RuntimeError(f"Email send failed: {resp.status_code}")
    return {"ok": True, "demo": False, "channel": "email", "to": to}

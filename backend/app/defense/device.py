"""Anonymous device token for ungated deployments (decision D3).

Cookie ``csg_dev`` = ``v1.<random 128-bit id>.<issued_at>.<HMAC>``. Issued
only by ``POST /api/v1/defense/token`` after a passed challenge, lives
``DEFENSE_DEVICE_TOKEN_TTL_SECONDS`` (default 24 hours), HttpOnly, path
``/api``. It is not linked to intake content, never sent to OpenAI, and the
store keeps only its keyed hash next to counters. Rotating
``DEFENSE_TOKEN_SECRET`` invalidates every token.
"""

from __future__ import annotations

import base64
import secrets
from dataclasses import dataclass

from app.config import get_settings
from app.defense.keys import sign, verify

COOKIE_NAME = "csg_dev"
COOKIE_PATH = "/api"
_VERSION = "v1"
_MAX_COOKIE_CHARS = 200
# Clock skew tolerated on issued_at.
_SKEW_SECONDS = 60


@dataclass(frozen=True)
class DeviceToken:
    id: str
    issued_at: int


def issue(now: float) -> tuple[str, DeviceToken]:
    token_id = base64.urlsafe_b64encode(secrets.token_bytes(16)).decode("ascii").rstrip("=")
    issued = int(now)
    body = f"{_VERSION}.{token_id}.{issued}"
    return f"{body}.{sign(body)}", DeviceToken(token_id, issued)


def parse(value: str | None, now: float) -> DeviceToken | None:
    """The token if the cookie is well-formed, correctly signed and unexpired."""
    if not value or len(value) > _MAX_COOKIE_CHARS:
        return None
    parts = value.split(".")
    if len(parts) != 4 or parts[0] != _VERSION or not parts[2].isdigit():
        return None
    version, token_id, issued_raw, mac = parts
    if not verify(f"{version}.{token_id}.{issued_raw}", mac):
        return None
    issued = int(issued_raw)
    ttl = get_settings().defense_device_token_ttl_seconds
    if issued > now + _SKEW_SECONDS or now - issued >= ttl:
        return None
    return DeviceToken(token_id, issued)

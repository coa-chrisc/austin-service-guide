"""Signed, short-lived request tokens from the main app to the job worker.

Stdlib only (hmac, hashlib, secrets, base64, json). Format::

    Authorization: CSG1 <base64url(payload)>.<base64url(HMAC-SHA256(secret, base64url(payload)))>

The payload binds the token to one request: ``iss`` "app", ``aud``
"worker", ``iat``, ``exp`` (at most 60 s after ``iat``), a random ``jti``,
the HTTP ``method``, the ``path`` (with its query string), the SHA-256 of the
body and the ``actor``. The worker checks the signature first (constant-time,
against the current and the optional previous secret), then every claim, then
that the ``jti`` was not used before. Any failure is a bare 401.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time
from dataclasses import dataclass
from typing import Callable

SCHEME = "CSG1"
ISSUER = "app"
AUDIENCE = "worker"
MAX_LIFETIME = 60
SKEW = 30


class TokenError(Exception):
    """Verification failed. The message is for logs and tests, never for the response."""


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _unb64(text: str) -> bytes:
    pad = "=" * (-len(text) % 4)
    return base64.urlsafe_b64decode(text + pad)


def body_hash(body: bytes) -> str:
    return hashlib.sha256(body).hexdigest()


def request_path(path: str, query: str = "") -> str:
    return f"{path}?{query}" if query else path


def sign(
    secret: str,
    *,
    method: str,
    path: str,
    body: bytes = b"",
    actor: str = "token",
    now: float | None = None,
    lifetime: int = 30,
) -> str:
    """Return the full Authorization header value for one request."""
    iat = int(time.time() if now is None else now)
    payload = {
        "iss": ISSUER,
        "aud": AUDIENCE,
        "iat": iat,
        "exp": iat + min(lifetime, MAX_LIFETIME),
        "jti": secrets.token_hex(16),
        "method": method.upper(),
        "path": path,
        "body_sha256": body_hash(body),
        "actor": actor,
    }
    encoded = _b64(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode())
    mac = hmac.new(secret.encode(), encoded.encode("ascii"), hashlib.sha256).digest()
    return f"{SCHEME} {encoded}.{_b64(mac)}"


@dataclass(frozen=True)
class Claims:
    jti: str
    exp: int
    actor: str


def verify(
    header: str | None,
    *,
    secrets_: list[str],
    method: str,
    path: str,
    body: bytes,
    seen: Callable[[str, int], bool],
    now: float | None = None,
) -> Claims:
    """Verify a token. ``seen(jti, exp)`` records the jti and returns True if
    it was already used (a replay). Raises TokenError on any failure."""
    if not header or not header.startswith(SCHEME + " "):
        raise TokenError("missing token")
    token = header[len(SCHEME) + 1:].strip()
    try:
        encoded, mac_text = token.split(".")
        mac = _unb64(mac_text)
    except ValueError as exc:
        raise TokenError("malformed token") from exc
    keys = [s for s in secrets_ if s]
    if not keys:
        raise TokenError("no secret configured")
    ok = False
    for key in keys:
        expected = hmac.new(key.encode(), encoded.encode("ascii", "replace"), hashlib.sha256).digest()
        ok |= hmac.compare_digest(expected, mac)
    if not ok:
        raise TokenError("bad signature")
    try:
        payload = json.loads(_unb64(encoded))
    except ValueError as exc:
        raise TokenError("bad payload") from exc
    if not isinstance(payload, dict):
        raise TokenError("bad payload")

    t = time.time() if now is None else now
    try:
        iat, exp = int(payload["iat"]), int(payload["exp"])
        jti = str(payload["jti"])
    except (KeyError, TypeError, ValueError) as exc:
        raise TokenError("missing claim") from exc
    if payload.get("iss") != ISSUER or payload.get("aud") != AUDIENCE:
        raise TokenError("wrong issuer or audience")
    if exp - iat > MAX_LIFETIME or exp < iat:
        raise TokenError("lifetime too long")
    if iat > t + SKEW or exp < t - SKEW:
        raise TokenError("expired or not yet valid")
    if payload.get("method") != method.upper():
        raise TokenError("wrong method")
    if payload.get("path") != path:
        raise TokenError("wrong path")
    if not hmac.compare_digest(str(payload.get("body_sha256", "")), body_hash(body)):
        raise TokenError("wrong body")
    if len(jti) < 16 or seen(jti, exp + SKEW):
        raise TokenError("replayed token")
    return Claims(jti=jti, exp=exp, actor=str(payload.get("actor", "")))

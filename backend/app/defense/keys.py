"""Secrets, keyed hashes and deployment facts the defense modules share."""

from __future__ import annotations

import base64
import hashlib
import hmac
import logging
import os
import secrets
from functools import lru_cache

from app.config import get_settings
from app.defense.store import DefenseConfigError

log = logging.getLogger(__name__)

_PLATFORM_VARS = ("VERCEL", "RAILWAY_ENVIRONMENT")


def defense_enabled() -> bool:
    return get_settings().defense_enabled


def gate_on() -> bool:
    """The access-code gate is on (it reads ACCESS_CODES from the process env)."""
    return bool((os.environ.get("ACCESS_CODES") or "").strip())


def on_platform() -> bool:
    return any(os.environ.get(v) for v in _PLATFORM_VARS)


def challenge_provider() -> str:
    """Effective provider: "none" or "pow" ("auto" resolves on the gate)."""
    configured = get_settings().challenge_provider
    if configured == "auto":
        return "none" if gate_on() else "pow"
    return configured


@lru_cache
def hash_key() -> bytes:
    configured = get_settings().defense_hash_key.strip()
    if configured:
        if len(configured) < 32:
            raise DefenseConfigError("DEFENSE_HASH_KEY must be at least 32 characters.")
        return configured.encode()
    # Per process: matches the per-process memory store. A shared store
    # (PR b) needs a configured key so instances agree on hashes.
    return secrets.token_bytes(32)


@lru_cache
def token_secret() -> bytes:
    configured = get_settings().defense_token_secret.strip()
    if configured:
        if len(configured) < 32:
            raise DefenseConfigError("DEFENSE_TOKEN_SECRET must be at least 32 characters.")
        return configured.encode()
    if on_platform() and defense_enabled() and challenge_provider() != "none":
        # Instances would each sign with their own random secret and reject
        # each other's device tokens.
        raise DefenseConfigError(
            "DEFENSE_TOKEN_SECRET (32+ characters) is required on a public deployment "
            "that uses the proof-of-work challenge."
        )
    return secrets.token_bytes(32)


def keyed_hash(value: str, *, key: bytes | None = None, length: int = 26) -> str:
    """First ``length`` base32 characters of HMAC-SHA256(key, value), lowercase."""
    mac = hmac.new(key or hash_key(), value.encode("utf-8", "surrogateescape"), hashlib.sha256).digest()
    return base64.b32encode(mac).decode("ascii").rstrip("=").lower()[:length]


def sign(message: str) -> str:
    """URL-safe HMAC of ``message`` with the token secret."""
    mac = hmac.new(token_secret(), message.encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(mac).decode("ascii").rstrip("=")


def verify(message: str, signature: str) -> bool:
    return hmac.compare_digest(sign(message).encode(), signature.encode("utf-8", "surrogateescape"))


def reset_keys() -> None:
    """Forget cached keys (tests that change DEFENSE_* settings)."""
    hash_key.cache_clear()
    token_secret.cache_clear()


def check_defense_config() -> None:
    """Fail startup on unusable DEFENSE_* settings; log the store caveat."""
    from app.defense.limits import policies
    from app.defense.store import get_store
    from app.defense.usage import check_price_table

    # A bad RL_* override fails here, not as a 500 on every limited route
    # (the routes read the table even with defense off, for the kill switches).
    policies()
    if not defense_enabled():
        log.warning("DEFENSE_ENABLED=false: no rate limits, metering or budgets are applied.")
        return
    hash_key()
    token_secret()
    get_store()
    check_price_table()
    if on_platform() and get_settings().defense_trusted_proxy_hops == 0:
        log.warning("DEFENSE_TRUSTED_PROXY_HOPS=0 behind a platform proxy: every anonymous "
                    "caller may share one network key. Set it to 1 on Vercel or Railway.")

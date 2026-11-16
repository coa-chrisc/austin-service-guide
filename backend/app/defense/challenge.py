"""Challenge for ungated deployments (decision D4: proof of work).

``CHALLENGE_PROVIDER``: ``auto`` (default: ``none`` when the access gate is
on, so gated users never see a challenge; ``pow`` when it is off),
``none`` or ``pow``. A third-party provider (Turnstile) would be another
``issue``/``verify`` pair here plus its CSP origins; it is not built.

Proof of work: ``issue_pow`` returns ``{nonce, difficulty, expires_at, sig}``
where ``sig`` signs the other three, so issuing needs no store. The browser
finds a decimal ``counter`` such that ``SHA-256(nonce + counter)`` starts
with ``difficulty`` zero bits (WebCrypto in a Web Worker). ``verify_pow``
checks the signature, the 60-second expiry and the hash, then spends the
nonce in the store until it expires. It is a cost per identity, not a wall:
it slows scripts and does not stop a funded attacker.
"""

from __future__ import annotations

import base64
import hashlib
import re
import secrets
from typing import Any

from app.config import get_settings
from app.defense.keys import challenge_provider, sign, verify
from app.defense.store import DefenseStore

POW_TTL_SECONDS = 60
MAX_BITS = 32
_COUNTER_RE = re.compile(r"[0-9]{1,16}")


def _message(nonce: str, difficulty: int, expires_at: int) -> str:
    return f"pow.v1.{nonce}.{difficulty}.{expires_at}"


def leading_zero_bits(digest: bytes) -> int:
    bits = 0
    for byte in digest:
        if byte == 0:
            bits += 8
            continue
        return bits + 8 - byte.bit_length()
    return bits


def pow_difficulty(surge: bool) -> int:
    s = get_settings()
    bits = s.defense_pow_bits + (s.defense_pow_surge_bits if surge else 0)
    return max(1, min(MAX_BITS, bits))


def issue_pow(now: float, surge: bool = False) -> dict[str, Any]:
    nonce = base64.urlsafe_b64encode(secrets.token_bytes(16)).decode("ascii").rstrip("=")
    difficulty = pow_difficulty(surge)
    expires_at = int(now) + POW_TTL_SECONDS
    return {
        "provider": "pow",
        "nonce": nonce,
        "difficulty": difficulty,
        "expires_at": expires_at,
        "sig": sign(_message(nonce, difficulty, expires_at)),
        "token_ttl_seconds": get_settings().defense_device_token_ttl_seconds,
    }


def solve_pow(nonce: str, difficulty: int, limit: int = 1 << 24) -> int:
    """Reference solver (tests and the abuse simulator)."""
    for counter in range(limit):
        if leading_zero_bits(hashlib.sha256(f"{nonce}{counter}".encode()).digest()) >= difficulty:
            return counter
    raise ValueError("no solution in range")


async def verify_pow(store: DefenseStore, nonce: str, difficulty: int, expires_at: int,
                     sig: str, counter: str) -> bool:
    """True once per valid, unexpired, correctly solved challenge."""
    now = store.now()
    if challenge_provider() != "pow":
        return False
    if not (1 <= difficulty <= MAX_BITS) or not _COUNTER_RE.fullmatch(counter):
        return False
    if not verify(_message(nonce, difficulty, expires_at), sig):
        return False
    if expires_at <= now or expires_at > now + POW_TTL_SECONDS + 5:
        return False
    digest = hashlib.sha256(f"{nonce}{counter}".encode()).digest()
    if leading_zero_bits(digest) < difficulty:
        return False
    return await store.put_once(f"pow:{nonce}", int(expires_at - now) + 1)

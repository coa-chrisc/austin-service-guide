"""Per-route rate limits: a policy table and one FastAPI dependency.

Each limited route declares ``dependencies=[Depends(limit("policy"))]`` so
its cost class is visible where it is defined. Fixed windows, counted per
principal, per network hash and globally in one store round trip. The 2x
burst at a window edge is accepted: the budgets in ``budget.py`` sit
behind it.

Tiers:

- gated (access label, admin): per-principal and per-recipient rows x
  DEFENSE_ACCESS_MULTIPLIER (a label is often shared by a group, and a
  presenter may send to their own address many times), network rows
  skipped (one office NAT is not a signal for known users); global rows
  apply as written.
- device: the table as written. A device token younger than
  DEFENSE_NEW_TOKEN_WARMUP_SECONDS cannot mint voice yet.
- anon, when a challenge is available: a quarter of the intake_start and
  intake_message rows; voice_mint and share are refused (403
  ``challenge_required``, which tells the browser to run the challenge).
- anon, when the challenge provider is ``none``: treated like a device,
  keyed on the network hash, because there is no way to become a device.

Every override is ``RL_<POLICY>_<RULE>`` (e.g. ``RL_INTAKE_MESSAGE_PRINCIPAL``,
``RL_SHARE_GLOBAL_DAY``); ``0`` disables the row. Read from the process
environment and ``backend/.env``.

Store failure (decision D5): ``intake_*`` and ``voice_tool`` fall back to a
per-instance in-memory limiter at half the limits; ``voice_mint``,
``share`` and ``defense_token`` refuse with 503.

Never limited here (decision D6): the service directory, search, map,
results hydration beyond its generous row, crisis resources. A crisis turn
inside ``/message`` is answered by the scripted crisis check before any
model call; ``intake_message`` only refuses floods (20 a minute).

Crisis lines are never refused (``crisis_bypass``): a ``/message`` or
``/realtime/transcript`` turn that trips the crisis check, and a realtime
``get_crisis_resources`` tool call, go through even when the policy's
limit (429), breaker or kill switch (503) would refuse them. None of those
calls a model.
"""

from __future__ import annotations

import logging
import math
import os
import time
from dataclasses import dataclass, replace
from functools import lru_cache
from typing import Literal

from dotenv import dotenv_values
from fastapi import Request, Response
from starlette.responses import JSONResponse

from app.config import get_settings
from app.defense import context
from app.defense.keys import challenge_provider, defense_enabled, keyed_hash
from app.defense.principal import Principal, resolve_principal
from app.defense.store import DAY, HOUR, DefenseConfigError, get_store, window_bounds
from app.defense.store_memory import MemoryStore

log = logging.getLogger(__name__)

Scope = Literal["principal", "net", "global", "recipient"]


@dataclass(frozen=True)
class Rule:
    name: str
    scope: Scope
    limit: int
    window: int


@dataclass(frozen=True)
class Policy:
    name: str
    rules: tuple[Rule, ...]
    #: "local": per-instance fallback at half the limits; "closed": 503.
    on_store_error: Literal["local", "closed"]
    #: Anonymous callers when a challenge exists.
    anon: Literal["same", "quarter", "refuse"] = "same"
    #: Breaker that must not be open for this route (see breakers.py).
    breaker: str | None = None
    #: Any refusal (429 limit, 503 breaker or kill switch) is waived for a
    #: crisis request (see ``_is_crisis``). Decision D6: crisis responses
    #: always go out; they never call a model.
    crisis_bypass: bool = False


def _r(name: str, scope: Scope, limit: int, window: int) -> Rule:
    return Rule(name, scope, limit, window)


DEFAULT_POLICIES: tuple[Policy, ...] = (
    Policy("intake_start", (
        _r("principal", "principal", 10, 600), _r("principal_day", "principal", 40, DAY),
        _r("net", "net", 300, 600), _r("global", "global", 2_000, HOUR),
    ), "local", anon="quarter"),
    Policy("intake_message", (
        _r("principal", "principal", 20, 60), _r("principal_day", "principal", 300, DAY),
        _r("net", "net", 600, 60), _r("global", "global", 6_000, HOUR),
    ), "local", anon="quarter", crisis_bypass=True),
    Policy("intake_plan", (
        _r("principal", "principal", 6, HOUR), _r("global", "global", 600, HOUR),
    ), "local"),
    Policy("intake_read", (_r("principal", "principal", 60, 60),), "local"),
    Policy("voice_mint", (
        _r("principal", "principal", 3, HOUR), _r("principal_day", "principal", 6, DAY),
        _r("net", "net", 30, HOUR), _r("global", "global", 60, HOUR),
        _r("global_day", "global", 200, DAY),
    ), "closed", anon="refuse", breaker="voice"),
    Policy("voice_tool", (_r("principal", "principal", 120, 60),), "local", breaker="voice",
           crisis_bypass=True),
    Policy("share", (
        _r("principal", "principal", 3, HOUR), _r("principal_day", "principal", 6, DAY),
        _r("net", "net", 20, HOUR), _r("global_day", "global", 100, DAY),
    ), "closed", anon="refuse", breaker="share"),
    Policy("share_recipient", (_r("day", "recipient", 3, DAY),), "closed"),
    Policy("defense_token", (
        _r("net", "net", 60, HOUR), _r("global", "global", 3_000, HOUR),
    ), "closed"),
)

_DETAILS = {
    "intake_message": "You're sending messages quickly. Try again in {n} seconds.",
    "intake_start": "Too many new conversations in a short time. Try again in {n} seconds. "
                    "The service directory still works.",
    "intake_plan": "Too many plan requests. Try again in {n} seconds.",
    "voice_mint": "Voice is busy right now. You can keep going by typing.",
    "voice_tool": "Voice is busy right now. You can keep going by typing.",
    "share": "Too many messages sent from this device. Try again later, or use your device's share button.",
    "share_recipient": "That address has already received several messages today. "
                       "Try again tomorrow, or use your device's share button.",
    "defense_token": "Too many checks from this network. Try again in {n} seconds.",
}
_UNAVAILABLE = {
    "voice_mint": ("voice_unavailable", "Voice is unavailable right now. You can keep going by typing."),
    "voice_tool": ("voice_unavailable", "Voice is unavailable right now. You can keep going by typing."),
    "share": ("share_unavailable", "Sending is unavailable right now. Use your device's share button or print."),
    "share_recipient": ("share_unavailable", "Sending is unavailable right now. Use your device's share button or print."),
    "defense_token": ("defense_unavailable", "The assistant can't be turned on right now. The service directory still works."),
}
_CHALLENGE_REQUIRED = "Turn on the assistant on this device to use voice or sending."


class DefenseRefusal(Exception):
    """A defense check refused the request; rendered by ``refusal_handler``."""

    def __init__(self, status: int, code: str, detail: str, *, policy: str | None = None,
                 retry_after: int | None = None, headers: dict[str, str] | None = None) -> None:
        super().__init__(detail)
        self.status = status
        self.code = code
        self.detail = detail
        self.policy = policy
        self.retry_after = retry_after
        self.headers = headers or {}


async def refusal_handler(_request: Request, exc: DefenseRefusal) -> JSONResponse:
    body: dict = {"detail": exc.detail, "code": exc.code}
    headers = dict(exc.headers)
    if exc.policy:
        body["policy"] = exc.policy
    if exc.retry_after is not None:
        body["retry_after"] = exc.retry_after
        headers["Retry-After"] = str(exc.retry_after)
    headers["Cache-Control"] = "no-store"
    return JSONResponse(body, status_code=exc.status, headers=headers)


# ── Policy table with env overrides ─────────────────────────────────────

def _env() -> dict[str, str]:
    values = {k: v for k, v in dotenv_values(".env").items() if v is not None}
    values.update(os.environ)
    return values


@lru_cache
def policies() -> dict[str, Policy]:
    env = _env()
    out: dict[str, Policy] = {}
    for policy in DEFAULT_POLICIES:
        rules = []
        for rule in policy.rules:
            raw = env.get(f"RL_{policy.name}_{rule.name}".upper())
            if raw is not None and raw.strip():
                try:
                    rule = replace(rule, limit=max(0, int(raw)))
                except ValueError as exc:
                    raise DefenseConfigError(
                        f"RL_{policy.name}_{rule.name}".upper() + " must be an integer"
                    ) from exc
            rules.append(rule)
        out[policy.name] = replace(policy, rules=tuple(rules))
    return out


def reset_policies() -> None:
    policies.cache_clear()


# ── Evaluation ──────────────────────────────────────────────────────────

@dataclass(frozen=True)
class Decision:
    allowed: bool
    limit: int = 0
    remaining: int = 0
    reset: int = 0
    retry_after: int = 0


_fallback_store = MemoryStore()
_last_fallback_warning = 0.0


def _subject(rule: Rule, principal: Principal, recipient_hash: str | None) -> str | None:
    if rule.scope == "principal":
        return f"p:{principal.hash}"
    if rule.scope == "net":
        return None if principal.gated else f"n:{principal.net_hash}"
    if rule.scope == "recipient":
        return f"r:{recipient_hash}" if recipient_hash else None
    return "g"


def _effective_limit(rule: Rule, policy: Policy, principal: Principal, challenge: bool) -> int:
    limit = rule.limit
    if rule.scope not in ("principal", "recipient") or limit <= 0:
        return limit
    if principal.gated:
        return max(1, math.floor(limit * get_settings().defense_access_multiplier))
    if rule.scope == "principal" and principal.kind == "anon" and challenge and policy.anon == "quarter":
        return max(1, limit // 4)
    return limit


async def _count(store, policy: Policy, principal: Principal, recipient_hash: str | None,
                 challenge: bool, scale: float = 1.0) -> Decision:
    rows: list[tuple[Rule, int, str]] = []
    for rule in policy.rules:
        limit = _effective_limit(rule, policy, principal, challenge)
        subject = _subject(rule, principal, recipient_hash)
        if limit <= 0 or subject is None:
            continue
        limit = max(1, math.floor(limit * scale))
        rows.append((rule, limit, f"rl:{policy.name}:{subject}:{rule.window}"))
    if not rows:
        return Decision(True)
    counts = await store.incr_many([(key, rule.window, 1) for rule, _, key in rows])
    now = store.now()
    over = [(rule, limit) for (rule, limit, _), n in zip(rows, counts) if n > limit]
    if over:
        retry = max(window_bounds(now, rule.window)[1] - now for rule, _ in over)
        return Decision(False, retry_after=max(1, math.ceil(retry)))
    # Headers describe the tightest principal row (any row if none).
    scoped = [(r, lim, n) for (r, lim, _), n in zip(rows, counts) if r.scope == "principal"]
    scoped = scoped or [(r, lim, n) for (r, lim, _), n in zip(rows, counts)]
    rule, limit, n = min(scoped, key=lambda item: item[1] - item[2])
    reset = math.ceil(window_bounds(now, rule.window)[1] - now)
    return Decision(True, limit=limit, remaining=max(0, limit - n), reset=max(1, reset))


async def check(policy_name: str, principal: Principal, *, recipient_hash: str | None = None) -> Decision:
    """Count this request against ``policy_name``; raise ``DefenseRefusal`` if over."""
    global _last_fallback_warning
    policy = policies()[policy_name]
    challenge = challenge_provider() != "none"

    if policy.breaker:
        from app.defense.breakers import breaker_refusal

        await breaker_refusal(policy.breaker, policy_name)

    if principal.kind == "anon" and challenge and policy.anon == "refuse":
        raise DefenseRefusal(403, "challenge_required", _CHALLENGE_REQUIRED, policy=policy_name)

    store = get_store()
    try:
        if policy_name == "voice_mint" and principal.is_new_device(store.now()):
            warmup = get_settings().defense_new_token_warmup_seconds
            wait = max(1, math.ceil(principal.issued_at + warmup - store.now()))
            raise DefenseRefusal(429, "rate_limited", f"Voice will be available in {wait} seconds. "
                                 "You can keep going by typing.", policy=policy_name, retry_after=wait)
        decision = await _count(store, policy, principal, recipient_hash, challenge)
    except DefenseRefusal:
        raise
    except Exception as exc:  # noqa: BLE001 — any store failure takes the D5 path
        if policy.on_store_error == "closed":
            code, detail = _UNAVAILABLE.get(policy_name, ("defense_unavailable", "Try again later."))
            raise DefenseRefusal(503, code, detail, policy=policy_name) from exc
        if time.monotonic() - _last_fallback_warning > 60:
            _last_fallback_warning = time.monotonic()
            log.warning("Defense store failed (%s); using the per-instance limiter", type(exc).__name__)
        decision = await _count(_fallback_store, policy, principal, recipient_hash, challenge, scale=0.5)

    if not decision.allowed:
        detail = _DETAILS.get(policy_name, "Too many requests. Try again in {n} seconds.")
        raise DefenseRefusal(429, "rate_limited", detail.format(n=decision.retry_after),
                             policy=policy_name, retry_after=decision.retry_after)
    return decision


def rate_headers(decision: Decision) -> dict[str, str]:
    if not decision.limit:
        return {}
    return {
        "RateLimit-Limit": str(decision.limit),
        "RateLimit-Remaining": str(decision.remaining),
        "RateLimit-Reset": str(decision.reset),
    }


def limit(policy_name: str):
    """Route dependency: resolve the principal, bind it, count the request."""
    if policy_name not in {p.name for p in DEFAULT_POLICIES}:
        raise ValueError(f"unknown rate-limit policy {policy_name!r}")

    async def dependency(request: Request, response: Response) -> None:
        try:
            if not defense_enabled():
                # Kill switches still apply with defense off: they are explicit "off" flags.
                policy = policies()[policy_name]
                if policy.breaker:
                    from app.defense.breakers import breaker_refusal

                    await breaker_refusal(policy.breaker, policy_name)
                return
            principal = resolve_principal(request, get_store().now())
            context.bind(principal)
            decision = await check(policy_name, principal)
        except DefenseRefusal as refusal:
            if refusal.status in (429, 503) and policies()[policy_name].crisis_bypass \
                    and await _is_crisis(request):
                return
            raise
        response.headers.update(rate_headers(decision))

    dependency.__name__ = f"limit_{policy_name}"
    return dependency


_CRISIS_TOOL = "get_crisis_resources"


async def _is_crisis(request: Request) -> bool:
    """Is this a crisis request that must never be refused?

    ``/message``: the resident's ``message`` trips the scripted crisis check.
    ``/realtime/transcript``: a resident (``role: user``) turn trips it.
    ``/realtime/tool``: the voice model asked for the crisis resources.
    """
    from app.services.pii import redact
    from app.services.scenarios import check_crisis

    try:
        body = await request.json()
    except Exception:  # noqa: BLE001 — unreadable body: no bypass
        return False
    if not isinstance(body, dict):
        return False
    # Read only the field the route's handler reads, so a body cannot smuggle
    # a crisis marker from one route's shape into another route.
    path = request.url.path
    if path.endswith("/realtime/tool"):
        return body.get("name") == _CRISIS_TOOL
    if path.endswith("/realtime/transcript"):
        text = body.get("content") if body.get("role") == "user" else None
    elif path.endswith("/message"):
        text = body.get("message")
    else:
        return False
    if not isinstance(text, str) or len(text) > 5_000:
        return False
    return bool(check_crisis(redact(text).text))


_GMAIL_DOMAINS = frozenset({"gmail.com", "googlemail.com"})


def canonical_recipient(channel: str, recipient: str) -> str:
    """One spelling per mailbox or phone, so aliases share one counter.

    Email: lowercase, ``+tag`` dropped from the local part; for Gmail,
    dots dropped too and ``googlemail.com`` folded into ``gmail.com``
    (Gmail delivers all of those to one inbox). Phone: ``+`` and digits
    only. ``ShareRequest`` has already turned it into E.164 (US numbers
    get their ``+1``); a bare ten-digit US number gets ``+1`` here too.
    """
    value = recipient.strip().lower()
    if channel == "sms":
        digits = "".join(ch for ch in value if ch.isdigit())
        if not value.startswith("+") and len(digits) == 10:
            digits = "1" + digits
        return f"sms:+{digits}"
    local, sep, domain = value.rpartition("@")
    if not sep:
        return f"{channel}:{value}"
    domain = domain.rstrip(".")
    local = local.split("+", 1)[0]
    if domain in _GMAIL_DOMAINS:
        domain, local = "gmail.com", local.replace(".", "")
    return f"{channel}:{local}@{domain}"


async def limit_recipient(channel: str, recipient: str) -> None:
    """``share_recipient``: at most N sends a day to one phone number or email.

    Only a keyed hash of the canonical recipient (``canonical_recipient``)
    is kept, for one day.
    """
    if not defense_enabled():
        return
    ctx = context.current()
    if ctx.principal is None:
        return
    digest = keyed_hash(canonical_recipient(channel, recipient))
    await check("share_recipient", ctx.principal, recipient_hash=digest)

"""Budgets in tokens, estimated dollars and voice seconds.

Per principal (hour, day) and global (hour, day, and calendar month for
dollars). ``0`` disables a budget. Access-label principals get
DEFENSE_ACCESS_MULTIPLIER times the per-principal budgets.

``ai_allowed()`` replaces the direct ``settings.use_live_ai`` checks in
``ai.py`` and ``plan.py``: live AI must be configured, the ``live_ai``
breaker must not be open (kill switch, upstream spend limit, error rate, a
global budget at 100%), and the principal must be under its budgets. When
it says no, the caller takes the scripted or rules path it already has.

A budget can be exceeded by the calls already in flight when it is reached:
at most (concurrent requests) x OPENAI_MAX_TOKENS_PER_TURN tokens.

With the memory store every figure is per process (on Vercel, per
instance), including the monthly dollar budget, which restarts on a cold
start. The OpenAI project's hard spend limit is the backstop.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

from app.config import get_settings
from app.defense import context
from app.defense.keys import defense_enabled
from app.defense.principal import Principal
from app.defense.store import CALENDAR_MONTH, DAY, HOUR, get_store

_USD_MICROS = 1_000_000


@dataclass(frozen=True)
class Budget:
    metric: str  # "tok" (tin + tout), "usd" (micro-dollars), "voice" (seconds)
    scope: str  # "p" | "g"
    window: int
    limit: int


def budgets() -> list[Budget]:
    s = get_settings()
    usd = lambda v: int(round(v * _USD_MICROS))  # noqa: E731
    return [
        Budget("tok", "p", HOUR, s.budget_tokens_principal_hour),
        Budget("tok", "p", DAY, s.budget_tokens_principal_day),
        Budget("tok", "g", HOUR, s.budget_tokens_global_hour),
        Budget("tok", "g", DAY, s.budget_tokens_global_day),
        Budget("usd", "p", HOUR, usd(s.budget_usd_principal_hour)),
        Budget("usd", "p", DAY, usd(s.budget_usd_principal_day)),
        Budget("usd", "g", HOUR, usd(s.budget_usd_global_hour)),
        Budget("usd", "g", DAY, usd(s.budget_usd_global_day)),
        Budget("usd", "g", CALENDAR_MONTH, usd(s.budget_usd_global_month)),
        Budget("voice", "p", HOUR, s.budget_voice_seconds_principal_hour),
        Budget("voice", "p", DAY, s.budget_voice_seconds_principal_day),
        Budget("voice", "g", HOUR, s.budget_voice_seconds_global_hour),
        Budget("voice", "g", DAY, s.budget_voice_seconds_global_day),
    ]


def _limit_for(budget: Budget, principal: Principal | None) -> int:
    if budget.scope == "p" and principal is not None and principal.gated and budget.limit > 0:
        return math.floor(budget.limit * get_settings().defense_access_multiplier)
    return budget.limit


def _metric_keys(budget: Budget, principal: Principal | None) -> list[str]:
    subject = "g" if budget.scope == "g" else f"p:{principal.hash}" if principal else None
    if subject is None:
        return []
    if budget.metric == "tok":
        return [f"use:tin:{subject}", f"use:tout:{subject}"]
    return [f"use:{budget.metric}:{subject}"]


async def usage_against(
    principal: Principal | None, metrics: tuple[str, ...], scope: str
) -> list[tuple[Budget, int, int]]:
    """(budget, used, limit) for each active budget, in one store read."""
    active = [b for b in budgets() if b.metric in metrics and b.scope == scope and _limit_for(b, principal) > 0]
    reads: list[tuple[str, int]] = []
    spans: list[tuple[Budget, int, int]] = []
    for b in active:
        keys = _metric_keys(b, principal)
        spans.append((b, len(reads), len(keys)))
        reads.extend((k, b.window) for k in keys)
    if not reads:
        return []
    values = await get_store().get_many(reads)
    return [(b, sum(values[start:start + n]), _limit_for(b, principal)) for b, start, n in spans]


def exhausted_by(totals: dict[str, int], principal: Principal | None) -> bool:
    """After ``record_usage``: did these new totals reach any text budget?"""
    for b in budgets():
        if b.metric not in ("tok", "usd") or (b.scope == "p" and principal is None):
            continue
        limit = _limit_for(b, principal)
        if limit <= 0:
            continue
        if b.metric == "tok":
            used = totals.get(f"tin:{b.scope}:{b.window}", 0) + totals.get(f"tout:{b.scope}:{b.window}", 0)
        else:
            used = totals.get(f"usd:{b.scope}:{b.window}", 0)
        if used >= limit:
            return True
    return False


def _paused(reason: str | None) -> tuple[str, str]:
    """(degraded value, notice key) while the ``live_ai`` breaker is open or probing."""
    from app.defense.breakers import credits_exhausted

    if reason in ("manual", "kill_switch"):
        return "disabled", "ai_paused"
    if credits_exhausted(reason):
        return "ai_credits", "ai_credits"
    return "ai_budget", "ai_paused"


async def ai_allowed() -> bool:
    """May this request call the text model? Sets ``context.degraded`` when not."""
    from app.defense import breakers

    settings = get_settings()
    if not settings.use_live_ai:
        return False
    ctx = context.current()
    if settings.kill_switch_live_ai:
        ctx.degrade("disabled", "ai_paused")
        return False
    if not defense_enabled():
        return True
    try:
        state = await breakers.state("live_ai")
        if state.state == "open":
            ctx.degrade(*_paused(state.reason))
            return False
        if state.state == "half_open" and not await breakers.take_probe("live_ai", state):
            ctx.degrade(*_paused(state.reason))
            return False
        if ctx.principal is not None:
            usage = await usage_against(ctx.principal, ("tok", "usd"), "p")
            if any(used >= limit for _, used, limit in usage):
                ctx.degrade("ai_budget", "ai_budget")
                return False
    except Exception:  # noqa: BLE001 — a store outage must not take text chat down (D5)
        return True
    return True


def _voice_items(principal: Principal, sign: int) -> list[tuple[str, int, int]]:
    seconds = sign * get_settings().realtime_max_session_seconds
    items = [(f"use:voice:p:{principal.hash}", w, seconds) for w in (HOUR, DAY)]
    items += [("use:voice:g", w, seconds) for w in (HOUR, DAY, CALENDAR_MONTH)]
    items += [(f"use:mints:p:{principal.hash}", DAY, sign), ("use:mints:g", DAY, sign)]
    return items


async def reserve_voice(principal: Principal) -> None:
    """Reserve REALTIME_MAX_SESSION_SECONDS for one mint, or refuse with 429.

    The server cannot see Realtime usage before issue 04, so each mint is
    charged its maximum length up front. ``release_voice_reservation``
    gives it back when the mint fails.

    Advisory until server-brokered sessions (#29): the session is a WebRTC
    connection between the browser and OpenAI, and OpenAI's client-secret
    request has no session-length control (``expires_after`` /
    OPENAI_REALTIME_SECRET_TTL_SECONDS only ends the window for *starting*
    a session). Nothing ends a session at REALTIME_MAX_SESSION_SECONDS yet:
    ``voice-config`` reports it, but the browser does not enforce it, and a
    modified client could ignore it anyway. A session can run longer than
    it was charged. The OpenAI project's hard limit is the backstop.
    """
    from app.defense.limits import DefenseRefusal

    seconds = get_settings().realtime_max_session_seconds
    for scope in ("p", "g"):
        for _, used, limit in await usage_against(principal, ("voice",), scope):
            if used + seconds > limit:
                raise DefenseRefusal(
                    429, "voice_budget", "Voice is busy right now. You can keep going by typing.",
                    policy="voice_budget",
                )
    await get_store().incr_many(_voice_items(principal, 1))


async def voice_reservation() -> None:
    """Called by the realtime mint route, after ``limit("voice_mint")`` and body validation."""
    from app.defense.limits import _UNAVAILABLE, DefenseRefusal

    if not defense_enabled():
        return
    principal = context.current().principal
    if principal is None:
        return
    try:
        await reserve_voice(principal)
    except DefenseRefusal:
        raise
    except Exception as exc:  # noqa: BLE001 — store down: voice fails closed (D5)
        code, detail = _UNAVAILABLE["voice_mint"]
        raise DefenseRefusal(503, code, detail, policy="voice_budget") from exc


async def release_voice_reservation() -> None:
    """Give back this request's voice reservation (the OpenAI mint failed).

    Same conditions as ``voice_reservation``, so it only undoes a
    reservation that was made. Never raises: the caller is already failing.
    """
    if not defense_enabled():
        return
    principal = context.current().principal
    if principal is None:
        return
    try:
        await get_store().incr_many(_voice_items(principal, -1))
    except Exception:  # noqa: BLE001 — the reservation simply stays charged
        pass

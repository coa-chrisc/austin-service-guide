"""Circuit breakers: ``voice``, ``live_ai`` and ``share``.

States: ``closed``; ``warn`` (a global budget for the surface is at 80%);
``open``; ``half_open`` (a timed trip has run out: one probe call goes
through, success closes the breaker, failure re-opens it for 5 minutes).

A breaker opens when:

- ``KILL_SWITCH_VOICE`` / ``KILL_SWITCH_LIVE_AI`` / ``KILL_SWITCH_SHARE`` is
  set (no store read, so it works when the store is the problem);
- staff trip it (``trip(name, "manual")``; issue 05 adds the admin route);
- a global budget for the surface reaches 100% (closes by itself at the
  next window, because the state is derived from the counters);
- OpenAI answers with ``insufficient_quota`` or
  ``project_spend_limit_exceeded`` (opens on the first one, for 5 minutes);
- more than half of at least 20 calls in a 5-minute window failed.

``voice`` is also open whenever ``live_ai`` is.

Effects: ``live_ai`` open makes ``budget.ai_allowed`` say no (scripted and
rules paths); ``voice`` open makes the realtime routes return 503 and
``voice-config`` report ``intercepted_text`` with a ``degraded`` reason;
``share`` open makes ``/share`` return 503.

Every transition is logged (no resident data) and appended to the store's
event log for the admin page and alerts (issue 05).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Literal

from app.config import get_settings
from app.defense.keys import defense_enabled
from app.defense.store import DAY, get_store, window_bounds

log = logging.getLogger(__name__)

BREAKERS = ("voice", "live_ai", "share")
TRIP_SECONDS = 300
ERROR_WINDOW_SECONDS = 300
ERROR_MIN_CALLS = 20
ERROR_RATE = 0.5
WARN_RATIO = 0.8
SPEND_LIMIT_CODES = frozenset({"insufficient_quota", "project_spend_limit_exceeded"})
_BUDGET_METRICS = {"live_ai": ("tok", "usd"), "voice": ("voice",), "share": ()}

State = Literal["closed", "warn", "open", "half_open"]


@dataclass(frozen=True)
class BreakerState:
    name: str
    state: State
    reason: str | None = None
    resets_at: int | None = None


def _key(name: str) -> str:
    return f"breaker:{name}"


def _killed(name: str) -> bool:
    s = get_settings()
    return {
        "voice": s.kill_switch_voice or s.kill_switch_live_ai,
        "live_ai": s.kill_switch_live_ai,
        "share": s.kill_switch_share,
    }[name]


async def _note(name: str, state: str, reason: str | None) -> None:
    log.warning("Defense breaker %s is %s (%s)", name, state, reason or "-")
    await get_store().append_event("breaker", {"name": name, "state": state, "reason": reason})


async def _note_once(name: str, state: str, reason: str, window: int) -> None:
    """Budget-derived states: one log line and event per window, not per request."""
    store = get_store()
    start, end = window_bounds(store.now(), window)
    if await store.put_once(f"brklog:{name}:{state}:{reason}:{start}", int(end - store.now()) + 1):
        await _note(name, state, reason)


async def state(name: str) -> BreakerState:
    if _killed(name):
        return BreakerState(name, "open", "kill_switch")
    if not defense_enabled():
        return BreakerState(name, "closed")
    store = get_store()
    now = store.now()
    record = await store.get_record(_key(name))
    if record and record.get("reason") == "manual":
        return BreakerState(name, "open", "manual")
    if record and now < record.get("resets_at", 0):
        return BreakerState(name, "open", record.get("reason"), record.get("resets_at"))

    if name == "voice":
        live = await state("live_ai")
        if live.state == "open":
            return BreakerState(name, "open", f"live_ai:{live.reason}")

    warn: str | None = None
    metrics = _BUDGET_METRICS[name]
    if metrics:
        from app.defense.budget import usage_against

        for budget, used, limit in await usage_against(None, metrics, "g"):
            reason = f"budget:{budget.metric}:{budget.window}"
            if used >= limit:
                await _note_once(name, "open", reason, budget.window)
                return BreakerState(name, "open", reason)
            if used >= WARN_RATIO * limit and warn is None:
                await _note_once(name, "warn", reason, budget.window)
                warn = reason

    if record:
        return BreakerState(name, "half_open", record.get("reason"), record.get("resets_at"))
    if warn:
        return BreakerState(name, "warn", warn)
    return BreakerState(name, "closed")


async def take_probe(name: str, current: BreakerState) -> bool:
    """True for exactly one caller per half-open period."""
    return await get_store().put_once(f"probe:{name}:{current.resets_at}", TRIP_SECONDS)


async def trip(name: str, reason: str, *, seconds: int | None = TRIP_SECONDS, actor: str = "system") -> None:
    """Open ``name``. ``reason="manual"`` stays open until ``clear``."""
    store = get_store()
    now = int(store.now())
    await store.set_record(_key(name), {
        "state": "open",
        "reason": reason,
        "tripped_at": now,
        "resets_at": None if reason == "manual" else now + int(seconds or TRIP_SECONDS),
        "set_by": actor,
    }, ttl_seconds=None if reason == "manual" else DAY)
    await _note(name, "open", reason)


async def clear(name: str, *, actor: str = "system") -> None:
    await get_store().delete_record(_key(name))
    await _note(name, "closed", f"cleared:{actor}")


def _error_code(exc: BaseException) -> str | None:
    code = getattr(exc, "code", None)
    if isinstance(code, str):
        return code
    body: Any = getattr(exc, "body", None)
    if isinstance(body, dict):
        inner = body.get("error") if isinstance(body.get("error"), dict) else body
        code = inner.get("code")
        if isinstance(code, str):
            return code
    return None


async def record_result(name: str, exc: BaseException | None) -> None:
    """Feed one upstream call's outcome to ``name``'s breaker. Never raises."""
    if not defense_enabled():
        return
    try:
        store = get_store()
        now = store.now()
        calls_key, errors_key = f"brk:calls:{name}", f"brk:errors:{name}"
        record = await store.get_record(_key(name))
        expired = bool(record) and record.get("reason") != "manual" and now >= record.get("resets_at", 0)
        if exc is None:
            await store.incr_many([(calls_key, ERROR_WINDOW_SECONDS, 1)])
            if expired:
                await store.delete_record(_key(name))
                await _note(name, "closed", "probe_ok")
            return
        code = _error_code(exc)
        if code in SPEND_LIMIT_CODES:
            await trip(name, f"upstream:{code}")
        elif expired:
            await trip(name, record.get("reason") or "error_rate")
        else:
            calls, errors = await store.incr_many(
                [(calls_key, ERROR_WINDOW_SECONDS, 1), (errors_key, ERROR_WINDOW_SECONDS, 1)]
            )
            if calls >= ERROR_MIN_CALLS and errors / calls > ERROR_RATE:
                await trip(name, "error_rate")
    except Exception as err:  # noqa: BLE001 — bookkeeping must not break the caller
        log.warning("Breaker bookkeeping failed (%s)", type(err).__name__)


async def breaker_refusal(name: str, policy_name: str) -> None:
    """Raise a 503 ``DefenseRefusal`` when ``name`` is open."""
    from app.defense.limits import _UNAVAILABLE, DefenseRefusal

    try:
        current = await state(name)
    except Exception:  # noqa: BLE001 — store trouble is handled by the limiter (D5)
        return
    if current.state == "open":
        code, detail = _UNAVAILABLE.get(policy_name, ("defense_unavailable", "Try again later."))
        raise DefenseRefusal(503, code, detail, policy=policy_name)


def _degraded_reason(current: BreakerState) -> str | None:
    if current.state != "open":
        return None
    reason = current.reason or ""
    if reason in ("kill_switch", "manual", "live_ai:kill_switch", "live_ai:manual"):
        return "disabled"
    return "ai_budget" if reason.startswith("live_ai:") else "voice_budget"


async def voice_config_overrides() -> dict[str, Any]:
    """Extra ``GET /intake/voice-config`` fields; empty when defense is off and no kill switch is set."""
    s = get_settings()
    if not defense_enabled() and not _killed("voice"):
        return {}
    try:
        current = await state("voice")
    except Exception:  # noqa: BLE001
        current = BreakerState("voice", "closed")
    degraded = _degraded_reason(current)
    out: dict[str, Any] = {
        "degraded": degraded,
        "max_session_seconds": s.realtime_max_session_seconds,
        "idle_seconds": s.realtime_idle_seconds,
    }
    if degraded:
        out["mode"] = "intercepted_text"
    return out

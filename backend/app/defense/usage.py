"""Metering: read ``response.usage`` after every text-model call.

``metered(client, surface)`` wraps an ``AsyncOpenAI`` client so that each
``client.responses.create(...)`` records tokens and estimated dollars
against the request's principal and globally, and reports success or
failure to the ``live_ai`` breaker. A response without a usage object
counts as its worst case (input characters / 3, output =
``max_output_tokens``).

Dollars are estimates from ``config/model_prices.json`` (USD per million
tokens), replaceable with ``OPENAI_PRICE_TABLE_JSON``. A model missing from
the table has no dollar estimate (one warning); token budgets still apply.
No price is written in Python.

Counters (numbers only, keyed by principal hash and window):
``use:{tin,tout,usd}:p:<hash>`` per hour and day, and
``use:{tin,tout,usd}:g`` per hour, day and calendar month. ``usd`` is in
micro-dollars.
"""

from __future__ import annotations

import functools
import json
import logging
import os
import re
from functools import lru_cache
from typing import Any, Awaitable, Callable

from app.config import get_settings
from app.defense import context
from app.defense.keys import defense_enabled
from app.defense.principal import Principal
from app.defense.store import CALENDAR_MONTH, DAY, HOUR, get_store

log = logging.getLogger(__name__)

_DATED_SUFFIX = re.compile(r"-\d{4}-\d{2}-\d{2}$")
_warned_models: set[str] = set()

P_WINDOWS = (HOUR, DAY)
G_WINDOWS = (HOUR, DAY, CALENDAR_MONTH)
METRICS = ("tin", "tout", "usd")


# ── Price table ─────────────────────────────────────────────────────────

@lru_cache
def price_table() -> dict[str, dict[str, float]]:
    raw = get_settings().openai_price_table_json.strip()
    if raw:
        data = json.loads(raw)
    else:
        from app.services.city import config_dir

        data = json.loads((config_dir(os.environ) / "model_prices.json").read_text(encoding="utf-8"))
    models = data.get("models", data) if isinstance(data, dict) else {}
    return {
        name: {k: float(v) for k, v in prices.items() if isinstance(v, (int, float))}
        for name, prices in models.items()
        if not name.startswith("_") and isinstance(prices, dict)
    }


def prices_for(model: str) -> dict[str, float] | None:
    table = price_table()
    found = table.get(model) or table.get(_DATED_SUFFIX.sub("", model))
    if found is None and model not in _warned_models:
        _warned_models.add(model)
        log.warning("No price for model %r in the price table; dollar budgets skip it", model)
    return found


def check_price_table() -> None:
    """Startup: the table parses and the configured text model has a price."""
    try:
        price_table()
    except (OSError, ValueError) as exc:
        log.warning("Model price table unavailable (%s); dollar budgets are off", type(exc).__name__)
        return
    prices_for(get_settings().openai_model)


def reset_prices() -> None:
    price_table.cache_clear()
    _warned_models.clear()


# ── Usage numbers ───────────────────────────────────────────────────────

def _field(obj: Any, name: str) -> Any:
    if obj is None:
        return None
    if isinstance(obj, dict):
        return obj.get(name)
    return getattr(obj, name, None)


def _int(value: Any) -> int:
    return value if isinstance(value, int) and not isinstance(value, bool) and value > 0 else 0


def usage_numbers(usage: Any, request: dict[str, Any]) -> tuple[int, int, int]:
    """(input, cached input, output) tokens; the worst case if usage is missing."""
    if usage is not None and _field(usage, "input_tokens") is not None:
        tin = _int(_field(usage, "input_tokens"))
        cached = min(tin, _int(_field(_field(usage, "input_tokens_details"), "cached_tokens")))
        return tin, cached, _int(_field(usage, "output_tokens"))
    sent = json.dumps(
        [request.get("instructions"), request.get("input"), request.get("tools")], default=str
    )
    return len(sent) // 3, 0, _int(request.get("max_output_tokens")) or 2_000


def usd_micros(model: str, tin: int, cached: int, tout: int) -> int:
    """Estimated cost in micro-dollars. Prices are USD per million tokens, so
    tokens x price is already micro-dollars."""
    prices = prices_for(model)
    if not prices:
        return 0
    cached_price = prices.get("cached_input", prices.get("input", 0.0))
    return round(
        (tin - cached) * prices.get("input", 0.0) + cached * cached_price + tout * prices.get("output", 0.0)
    )


async def record_usage(principal: Principal | None, model: str, tin: int, cached: int, tout: int) -> dict[str, int]:
    """Add one call's usage; return the new totals keyed ``<metric>:<scope>:<window>``."""
    usd = usd_micros(model, tin, cached, tout)
    amounts = {"tin": tin, "tout": tout, "usd": usd}
    items: list[tuple[str, int, int]] = []
    labels: list[str] = []
    for metric in METRICS:
        if not amounts[metric]:
            continue
        if principal is not None:
            for w in P_WINDOWS:
                items.append((f"use:{metric}:p:{principal.hash}", w, amounts[metric]))
                labels.append(f"{metric}:p:{w}")
        for w in G_WINDOWS:
            items.append((f"use:{metric}:g", w, amounts[metric]))
            labels.append(f"{metric}:g:{w}")
    if not items:
        return {}
    totals = await get_store().incr_many(items)
    return dict(zip(labels, totals))


# ── Metered client ──────────────────────────────────────────────────────

class _MeteredResponses:
    def __init__(self, owner: "MeteredClient", inner: Any) -> None:
        self._owner = owner
        self._inner = inner

    async def create(self, **kwargs: Any) -> Any:
        from app.defense import breakers
        from app.defense.budget import exhausted_by

        try:
            response = await self._inner.create(**kwargs)
        except Exception as exc:
            await breakers.record_result("live_ai", exc)
            raise
        await breakers.record_result("live_ai", None)
        tin, cached, tout = usage_numbers(getattr(response, "usage", None), kwargs)
        self._owner.turn_tokens += tin + tout
        try:
            totals = await record_usage(context.current().principal, str(kwargs.get("model", "")), tin, cached, tout)
            if exhausted_by(totals, context.current().principal):
                self._owner.budget_exhausted = True
        except Exception as exc:  # noqa: BLE001 — metering must not break the reply
            log.warning("Usage metering failed (%s)", type(exc).__name__)
        return response


class MeteredClient:
    """``AsyncOpenAI`` look-alike: ``.responses.create`` is metered."""

    def __init__(self, client: Any, surface: str) -> None:
        self._client = client
        self.surface = surface
        self.turn_tokens = 0
        self.budget_exhausted = False
        self.responses = _MeteredResponses(self, client.responses)

    def __getattr__(self, name: str) -> Any:
        return getattr(self._client, name)


def metered(client: Any, surface: str) -> Any:
    """Wrap ``client`` when defense is on; return it unchanged when off."""
    return MeteredClient(client, surface) if defense_enabled() else client


def turn_may_continue(client: Any) -> bool:
    """False once this turn passed OPENAI_MAX_TOKENS_PER_TURN or a budget ran out.

    The call that crossed the line has already finished; the agent loop
    just stops iterating and returns its "ran out of time" message.
    """
    if not isinstance(client, MeteredClient):
        return True
    ceiling = get_settings().openai_max_tokens_per_turn
    if ceiling and client.turn_tokens >= ceiling:
        return False
    return not client.budget_exhausted


# ── Outbound sends (share) ──────────────────────────────────────────────

def metered_send(channel: str) -> Callable[[Callable[..., Awaitable[dict]]], Callable[..., Awaitable[dict]]]:
    """Decorator for ``notify.send_sms`` / ``send_email``: count sends per
    principal and globally, and feed failures to the ``share`` breaker."""

    def decorate(fn: Callable[..., Awaitable[dict]]) -> Callable[..., Awaitable[dict]]:
        @functools.wraps(fn)
        async def wrapper(*args: Any, **kwargs: Any) -> dict:
            from app.defense import breakers

            try:
                result = await fn(*args, **kwargs)
            except Exception as exc:
                await breakers.record_result("share", exc)
                raise
            if defense_enabled():
                await breakers.record_result("share", None)
                try:
                    principal = context.current().principal
                    items = [(f"use:{channel}:g", w, 1) for w in G_WINDOWS]
                    if principal is not None:
                        items += [(f"use:{channel}:p:{principal.hash}", w, 1) for w in P_WINDOWS]
                    await get_store().incr_many(items)
                except Exception as exc:  # noqa: BLE001 — counting must not fail a sent message
                    log.warning("Send metering failed (%s)", type(exc).__name__)
            return result

        return wrapper

    return decorate

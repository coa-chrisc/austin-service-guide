"""Defense store: counters, one-time keys and small records.

``DefenseStore`` is the one interface the limiter, budgets and breakers
use, so the backend is a swap (decision D1). This build ships the
``memory`` backend only. ``postgres`` (defense-01 PR b) implements the same
protocol; its table is in the spec (``defense_counters``, unlogged).

What may be stored: hashes, policy and metric names, window starts and
numbers. Never a raw IP address, a user agent, or resident text
(``test_defense_state_holds_no_resident_text`` checks this).

Windows are fixed. ``window_seconds`` > 0 aligns to the Unix epoch
(``floor(now / window) * window``); ``CALENDAR_MONTH`` is the UTC calendar
month. A counter expires when its window ends.
"""

from __future__ import annotations

import calendar
import logging
import os
from datetime import datetime, timezone
from typing import Any, Protocol, Sequence

log = logging.getLogger(__name__)

CALENDAR_MONTH = -1

HOUR = 3_600
DAY = 86_400


class DefenseConfigError(RuntimeError):
    """A DEFENSE_* setting is unusable; startup fails loudly."""


def window_bounds(now: float, window: int) -> tuple[int, int]:
    """(start, end) in Unix seconds of the window containing ``now``."""
    if window == CALENDAR_MONTH:
        dt = datetime.fromtimestamp(now, tz=timezone.utc)
        start = datetime(dt.year, dt.month, 1, tzinfo=timezone.utc)
        days = calendar.monthrange(dt.year, dt.month)[1]
        return int(start.timestamp()), int(start.timestamp()) + days * DAY
    if window <= 0:
        raise ValueError("window must be positive or CALENDAR_MONTH")
    start = int(now // window) * window
    return start, start + window


class DefenseStore(Protocol):
    """Backend for defense state. Every method is one round trip."""

    name: str
    #: True when every app instance sees the same counters.
    shared: bool

    def now(self) -> float: ...

    async def incr_many(self, items: Sequence[tuple[str, int, int]]) -> list[int]:
        """Add ``amount`` to each ``(key, window_seconds, amount)`` counter in
        its current window; return the new totals in order."""
        ...

    async def get_many(self, items: Sequence[tuple[str, int]]) -> list[int]:
        """Current-window totals for ``(key, window_seconds)``; 0 when absent."""
        ...

    async def put_once(self, key: str, ttl_seconds: int) -> bool:
        """Record ``key`` for ``ttl_seconds``. False if it was already there
        (spent proof-of-work nonces, half-open probes, once-per-window logs)."""
        ...

    # Records: small JSON-safe dicts (breaker state now; blocks and
    # incidents in issues 03 and 05). No resident text.
    async def get_record(self, key: str) -> dict[str, Any] | None: ...

    async def set_record(self, key: str, value: dict[str, Any], ttl_seconds: int | None = None) -> None: ...

    async def delete_record(self, key: str) -> None: ...

    async def append_event(self, kind: str, data: dict[str, Any]) -> None:
        """Append to a bounded event log (breaker transitions; issue 05 reads it)."""
        ...

    async def list_events(self, limit: int = 100) -> list[dict[str, Any]]: ...


_store: DefenseStore | None = None


def get_store() -> DefenseStore:
    """The process-wide store selected by DEFENSE_STORE."""
    global _store
    if _store is None:
        from app.config import get_settings

        backend = get_settings().defense_store
        if backend != "memory":
            raise DefenseConfigError(
                f"DEFENSE_STORE={backend!r} is not available in this build; use 'memory'."
            )
        from app.defense.store_memory import MemoryStore

        _store = MemoryStore()
        if os.environ.get("VERCEL"):
            log.warning(
                "Defense store is in memory: on Vercel every function instance keeps its own "
                "counters and loses them on cold start, so limits and budgets are per instance."
            )
    return _store


def set_store(store: DefenseStore | None) -> None:
    """Replace the store (tests); None rebuilds it from settings on next use."""
    global _store
    _store = store

"""In-memory ``DefenseStore`` (the default backend).

Per process. On Vercel that means per function instance: each instance
keeps its own counters and loses them on a cold start, so every limit and
budget is enforced per instance, not per deployment. A deployment with N
warm instances can see up to N times any limit. Use it as a seatbelt; the
OpenAI project's hard spend limit stays the backstop (SECURITY.md).

Memory is bounded: expired entries are pruned as the store is used, and if
live keys still exceed ``max_keys`` the ones closest to expiry are dropped
(their counters restart, which only ever loosens a limit).
"""

from __future__ import annotations

import threading
import time
from collections import deque
from typing import Any, Callable, Sequence

from app.defense.store import window_bounds

_PRUNE_EVERY = 512


class MemoryStore:
    name = "memory"
    shared = False

    def __init__(self, clock: Callable[[], float] = time.time, max_keys: int = 100_000) -> None:
        self._clock = clock
        self._max_keys = max_keys
        self._lock = threading.Lock()
        self._counters: dict[str, tuple[int, float]] = {}  # key:window_start -> (n, expires_at)
        self._once: dict[str, float] = {}  # key -> expires_at
        self._records: dict[str, tuple[dict[str, Any], float | None]] = {}
        self._events: deque[dict[str, Any]] = deque(maxlen=500)
        self._ops = 0

    def now(self) -> float:
        return self._clock()

    # ── counters ─────────────────────────────────────────────────────

    async def incr_many(self, items: Sequence[tuple[str, int, int]]) -> list[int]:
        now = self.now()
        out: list[int] = []
        with self._lock:
            self._maybe_prune(now)
            for key, window, amount in items:
                start, end = window_bounds(now, window)
                full = f"{key}:{start}"
                n, _ = self._counters.get(full, (0, end))
                n += int(amount)
                self._counters[full] = (n, float(end))
                out.append(n)
        return out

    async def get_many(self, items: Sequence[tuple[str, int]]) -> list[int]:
        now = self.now()
        with self._lock:
            out = []
            for key, window in items:
                start, _ = window_bounds(now, window)
                entry = self._counters.get(f"{key}:{start}")
                out.append(entry[0] if entry and entry[1] > now else 0)
            return out

    async def put_once(self, key: str, ttl_seconds: int) -> bool:
        now = self.now()
        with self._lock:
            self._maybe_prune(now)
            expires = self._once.get(key)
            if expires is not None and expires > now:
                return False
            self._once[key] = now + max(1, int(ttl_seconds))
            return True

    # ── records and events ───────────────────────────────────────────

    async def get_record(self, key: str) -> dict[str, Any] | None:
        now = self.now()
        with self._lock:
            entry = self._records.get(key)
            if entry is None:
                return None
            value, expires = entry
            if expires is not None and expires <= now:
                del self._records[key]
                return None
            return dict(value)

    async def set_record(self, key: str, value: dict[str, Any], ttl_seconds: int | None = None) -> None:
        expires = self.now() + ttl_seconds if ttl_seconds else None
        with self._lock:
            self._records[key] = (dict(value), expires)

    async def delete_record(self, key: str) -> None:
        with self._lock:
            self._records.pop(key, None)

    async def append_event(self, kind: str, data: dict[str, Any]) -> None:
        with self._lock:
            self._events.append({"kind": kind, "at": int(self.now()), **data})

    async def list_events(self, limit: int = 100) -> list[dict[str, Any]]:
        with self._lock:
            return [dict(e) for e in list(self._events)[-limit:]][::-1]

    # ── housekeeping ─────────────────────────────────────────────────

    def snapshot(self) -> dict[str, Any]:
        """Everything held, for tests and the privacy check."""
        with self._lock:
            return {
                "counters": dict(self._counters),
                "once": dict(self._once),
                "records": {k: v[0] for k, v in self._records.items()},
                "events": list(self._events),
            }

    def _maybe_prune(self, now: float) -> None:
        self._ops += 1
        size = len(self._counters) + len(self._once)
        if self._ops % _PRUNE_EVERY and size <= self._max_keys:
            return
        self._counters = {k: v for k, v in self._counters.items() if v[1] > now}
        self._once = {k: v for k, v in self._once.items() if v > now}
        overflow = len(self._counters) + len(self._once) - self._max_keys
        if overflow > 0:
            # Drop the counters closest to expiry first; they would reset soonest anyway.
            for key, _ in sorted(self._counters.items(), key=lambda kv: kv[1][1])[:overflow]:
                del self._counters[key]

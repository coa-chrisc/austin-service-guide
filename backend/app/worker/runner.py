"""The worker's job loop: claim a job, run it, repeat.

One job at a time per worker (and ``Store.claim_job`` refuses a second
running job across workers), a lease with heartbeat, and resume from the
last committed step when a job's lease expired (a restarted worker).
"""

from __future__ import annotations

import asyncio
import logging
import os
import secrets
import time
from typing import Any, Callable

from app.jobs.store import Store, utcnow
from app.research.pipeline import LEASE_SECONDS, Deps, Run, load_pack_context

logger = logging.getLogger(__name__)
POLL_SECONDS = 3.0
PURGE_EVERY_SECONDS = 3600


def default_deps_factory(store: Store, settings: Any, owner: str) -> Deps:
    from openai import AsyncOpenAI

    from app.research.fetch import SafeFetcher
    from app.research.postprocess import census_geocoder
    from app.research.search import make_provider

    return Deps(
        store=store,
        settings=settings,
        client=AsyncOpenAI(api_key=settings.research_api_key),
        provider=make_provider(settings),
        fetcher=SafeFetcher(settings.research_user_agent),
        geocode=census_geocoder if settings.research_geocoder == "census" else None,
        pack=load_pack_context(),
        owner=owner,
    )


class Runner:
    def __init__(self, store: Store, settings: Any,
                 deps_factory: Callable[[Store, Any, str], Deps] = default_deps_factory) -> None:
        self.store = store
        self.settings = settings
        self.deps_factory = deps_factory
        self.owner = f"{os.uname().nodename[:30]}-{secrets.token_hex(4)}"
        self._last_purge = 0.0
        self._stop = asyncio.Event()

    async def run_once(self) -> bool:
        """Claim and run one job. Returns True if a job was run."""
        job = self.store.claim_job(self.owner, LEASE_SECONDS)
        if job is None:
            return False
        if job["kind"] != "research":
            self.store.release(job["id"], self.owner, state="needs_review", finished_at=utcnow())
            return True
        deps = self.deps_factory(self.store, self.settings, self.owner)
        try:
            await Run(job, deps).run()
        except Exception as exc:  # noqa: BLE001 — record the failure on the job, keep the worker alive
            logger.exception("job %s failed", job["id"])
            message = f"{type(exc).__name__}: {str(exc)[:300]}"
            self.store.release(job["id"], self.owner, state="failed", error=message, finished_at=utcnow())
            self.store.add_event(job["id"], "state", f"Failed: {message}")
        finally:
            fetcher = getattr(deps, "fetcher", None)
            if fetcher is not None and hasattr(fetcher, "aclose"):
                await fetcher.aclose()
        return True

    def maybe_purge(self) -> None:
        if time.monotonic() - self._last_purge > PURGE_EVERY_SECONDS:
            self._last_purge = time.monotonic()
            removed = self.store.purge(self.settings.job_retention_days)
            if removed:
                logger.info("retention: removed %d finished job(s)", removed)

    async def loop(self) -> None:
        logger.info("job runner %s started", self.owner)
        while not self._stop.is_set():
            try:
                self.maybe_purge()
                ran = await self.run_once()
            except Exception:  # noqa: BLE001 — e.g. the database is briefly unreachable
                logger.exception("job runner iteration failed")
                ran = False
            if not ran:
                try:
                    await asyncio.wait_for(self._stop.wait(), timeout=POLL_SECONDS)
                except asyncio.TimeoutError:
                    pass

    def stop(self) -> None:
        self._stop.set()

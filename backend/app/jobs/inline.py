"""``JOB_BACKEND=inline``: the worker runs inside the main app's process.

For local development and single-container deployments only (refused on
Vercel by ``check_app_config``). Jobs live in SQLite at
``JOB_INLINE_DATABASE_URL`` and run on an asyncio task in this process, one at
a time. Needs the worker dependencies (``requirements-worker.txt``).

The main app reaches the in-process worker through the same signed client as
``remote`` mode, over an ASGI transport, so both modes share one code path.
"""

from __future__ import annotations

import asyncio
import logging
import secrets

import httpx

from app.jobs.proxy import WorkerClient
from app.jobs.settings import JobSettings

logger = logging.getLogger(__name__)


class InlineWorker:
    def __init__(self, settings: JobSettings) -> None:
        from app.jobs.store import Store
        from app.worker.main import create_app
        from app.worker.runner import Runner

        # The secret never leaves this process; reuse the configured one if set.
        secret = settings.job_worker_secret or secrets.token_urlsafe(48)
        worker_settings = settings.model_copy(update={"job_worker_secret": secret})
        self.store = Store(settings.job_inline_database_url)
        self.app = create_app(settings=worker_settings, store=self.store, start_runner=False)
        self.runner = Runner(self.store, worker_settings)
        self.client = WorkerClient("http://inline-worker", secret, transport=httpx.ASGITransport(app=self.app))
        self._task: asyncio.Task | None = None

    def ensure_running(self) -> None:
        """Start the job loop on the current event loop (first request)."""
        if self._task is None or self._task.done():
            self._task = asyncio.get_running_loop().create_task(self.runner.loop())
            logger.info("inline job runner started")

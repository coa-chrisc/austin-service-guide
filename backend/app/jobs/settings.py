"""Settings for the job feature, shared by the main app and the worker.

Kept apart from ``app/config.py`` so the job flags read in one place. Every
value comes from the environment (or ``backend/.env``); nothing here is a
secret default.
"""

from __future__ import annotations

import os
from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings

MIN_SECRET_LENGTH = 32

SearchProviderName = Literal["searxng", "openai"]


class JobSettings(BaseSettings):
    # ── Main app ───────────────────────────────────────────────────
    # off (default): no job route responds. remote: proxy to JOB_WORKER_URL.
    # inline: run the worker in this process with SQLite (local and
    # single-container only; refused on Vercel).
    job_backend: Literal["off", "inline", "remote"] = "off"
    job_worker_url: str = ""
    job_worker_secret: str = ""
    # Accepted for verification only, during a secret rotation.
    job_worker_secret_previous: str = ""
    # inline mode's database file.
    job_inline_database_url: str = "sqlite:////tmp/csg-jobs.sqlite3"

    # ── Worker ─────────────────────────────────────────────────────
    database_url: str = ""
    job_retention_days: int = 30

    openai_api_key: str = ""
    # Optional separate key (its own OpenAI project and spend cap).
    openai_research_api_key: str = ""
    openai_research_model: str = "gpt-6.1-sol"
    openai_research_reasoning_effort: str = "medium"
    # List prices per million tokens for the cost cap (re-check on the
    # OpenAI pricing page; the cap is computed from response.usage).
    research_price_input_per_m: float = 2.0
    research_price_cached_input_per_m: float = 0.10
    research_price_output_per_m: float = 10.0
    # Per web_search tool call (openai provider). Check the pricing page.
    research_price_web_search_call: float = 0.01

    # searxng | openai (alias: openai_web_search). Empty: searxng when
    # SEARXNG_URL is set, else openai.
    research_search_provider: str = ""
    searxng_url: str = ""

    research_user_agent: str = "CivicServiceGuide-Research/0.1"
    research_require_plan_approval: bool = True
    research_geocoder: Literal["census", "off"] = "census"

    # Caps (per-job overrides can only lower them).
    research_max_steps: int = 200
    research_max_searches: int = 150
    research_max_pages: int = 400
    research_max_pages_per_host: int = 25
    research_max_cost_usd: float = 20.0
    research_max_runtime_minutes: int = 120
    research_max_drafts: int = 200

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}

    @property
    def research_api_key(self) -> str:
        return self.openai_research_api_key or self.openai_api_key

    @property
    def search_provider(self) -> SearchProviderName:
        name = self.research_search_provider.strip().lower()
        if name in ("openai", "openai_web_search"):
            return "openai"
        if name == "searxng":
            return "searxng"
        if name:
            raise ValueError(
                f"RESEARCH_SEARCH_PROVIDER={name!r} is not supported; use searxng or openai (alias openai_web_search)"
            )
        return "searxng" if self.searxng_url else "openai"

    def caps(self) -> dict[str, float | int]:
        return {
            "max_steps": self.research_max_steps,
            "max_searches": self.research_max_searches,
            "max_pages": self.research_max_pages,
            "max_pages_per_host": self.research_max_pages_per_host,
            "max_cost_usd": self.research_max_cost_usd,
            "max_runtime_minutes": self.research_max_runtime_minutes,
            "max_drafts": self.research_max_drafts,
        }


@lru_cache
def get_job_settings() -> JobSettings:
    return JobSettings()


class JobConfigError(RuntimeError):
    """The job configuration is unsafe or incomplete; the process must not start."""


def check_secret(settings: JobSettings) -> None:
    if len(settings.job_worker_secret) < MIN_SECRET_LENGTH:
        raise JobConfigError(f"JOB_WORKER_SECRET must be at least {MIN_SECRET_LENGTH} characters")
    previous = settings.job_worker_secret_previous
    if previous and len(previous) < MIN_SECRET_LENGTH:
        raise JobConfigError(f"JOB_WORKER_SECRET_PREVIOUS must be empty or at least {MIN_SECRET_LENGTH} characters")


def check_app_config(settings: JobSettings | None = None, env: dict[str, str] | None = None) -> str:
    """Validate the main app's job settings; returns the backend name.

    Raises JobConfigError for: inline on Vercel, remote without a worker URL
    or with a short secret.
    """
    settings = settings or get_job_settings()
    env = os.environ if env is None else env
    backend = settings.job_backend
    if backend == "inline" and env.get("VERCEL"):
        raise JobConfigError("JOB_BACKEND=inline cannot run on Vercel (no background work); use remote")
    if backend == "remote":
        if not settings.job_worker_url.startswith(("https://", "http://")):
            raise JobConfigError("JOB_BACKEND=remote needs JOB_WORKER_URL (https://...)")
        check_secret(settings)
    return backend


def jobs_enabled() -> bool:
    """True when the job routes should be mounted. Fails closed on bad config."""
    return check_app_config() != "off"

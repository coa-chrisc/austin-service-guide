"""Application configuration via pydantic-settings."""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Global application settings loaded from environment variables."""

    # ── OpenAI (primary AI provider) ───────────────────────────────
    openai_api_key: str = ""
    openai_model: str = "gpt-5.5-2026-04-23"
    openai_reasoning_effort: str = "medium"  # minimal | low | medium | high
    # Plan ordering (POST /intake/plan) only ranks 3-5 matches, and the
    # resident waits on it, so it runs at its own, lower effort.
    openai_plan_reasoning_effort: str = "low"  # minimal | low | medium | high
    openai_max_tool_iterations: int = 6
    openai_realtime_model: str = "gpt-realtime-2.1"
    openai_realtime_reasoning_effort: str = "low"  # minimal | low | medium | high | xhigh
    openai_realtime_voice: str = "marin"
    openai_realtime_transcription_model: str = "gpt-4o-transcribe"
    openai_realtime_secret_ttl_seconds: int = 600
    realtime_debug_log_enabled: bool = False
    realtime_debug_log_path: str = "logs/realtime_debug.jsonl"

    # ── Voice privacy ──────────────────────────────────────────────
    # "intercepted_text" (default): on-device speech-to-text in the browser,
    # PII-scrubbed text through the normal /message path; no audio leaves
    # the device. "realtime_audio": raw microphone audio is streamed to the
    # OpenAI Realtime API, only for deployments with an OpenAI zero-data-
    # retention agreement, and only when ALLOW_RAW_AUDIO_STREAM is also true.
    # Any other value fails at startup.
    voice_pipeline_mode: Literal["intercepted_text", "realtime_audio"] = "intercepted_text"
    allow_raw_audio_stream: bool = False

    # ── Azure OpenAI (legacy / optional) ───────────────────────────
    azure_openai_endpoint: str = ""
    azure_openai_key: str = ""
    azure_openai_deployment: str = "gpt-5.4-mini"

    # ── Notifications (Twilio SMS + SendGrid email) ────────────────
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_from_number: str = ""  # e.g. "+15555550100"
    sendgrid_api_key: str = ""
    sendgrid_from_email: str = "noreply@example.invalid"
    sendgrid_from_name: str = ""  # empty: the city config's appName

    # ── App behavior ───────────────────────────────────────────────
    # When True (or no OpenAI key set) the intake runs the scripted
    # fallback flow instead of calling the API.
    demo_mode: bool = False
    # Public origin used to build shareable URLs (QR codes, SMS links)
    public_origin: str = "http://localhost:5173"
    # Shared secret for admin catalog writes (POST/PATCH/DELETE under
    # /api/v1/admin), sent as the X-Admin-Token header. Empty = writes off.
    admin_api_token: str = ""

    # Country calling codes the SMS share may text, comma-separated
    # ("1" = US/NANP, the default; e.g. "1,44" adds the UK). Each added code
    # widens SMS-pumping exposure: also enable Twilio Geo Permissions for it.
    sms_allowed_country_codes: str = "1"

    # CORS origins allowed by the API. Keep in sync with backend/.env.example.
    cors_origins: str = (
        "http://localhost:5173,http://localhost:5174,http://localhost:3000,"
        "http://127.0.0.1:5173,http://127.0.0.1:5174"
    )

    # App metadata
    app_name: str = ""  # default: "<city config appName> API"
    app_version: str = "1.0.0"

    # ── Partner-list import (admin, issue #19) ─────────────────────
    # Off unless IMPORT_ENABLED=true AND JOB_BACKEND is not "off" AND
    # ADMIN_API_TOKEN is set; otherwise the routes return 404. The import
    # always runs inside the request; it does not use the job worker.
    import_enabled: bool = False
    # One setting with app/jobs/settings.py (research jobs, #18), which reads
    # the same variable and validates it: "remote" proxies jobs to
    # JOB_WORKER_URL, "inline" runs them in process (refused on Vercel).
    job_backend: Literal["off", "inline", "remote"] = "off"
    # Send the filtered rows to the model for hours, address, category and
    # eligibility suggestions. Needs live AI too.
    import_use_model: bool = False
    import_max_rows: int = 2000  # capped at 5000 (the parser limit)
    import_max_cost_usd: float = 5.0
    # ── Abuse defense and cost guardrails (app/defense/) ──────────
    # false restores the pre-defense behaviour: no principal, no limits,
    # no metering, no budgets. KILL_SWITCH_* still apply (explicit "off").
    defense_enabled: bool = True
    # "memory" only in this build (per process; on Vercel per instance).
    # "postgres" is planned (defense-01 PR b) and fails startup for now.
    defense_store: Literal["memory", "postgres"] = "memory"
    # HMAC key for principal, network and recipient hashes. Empty: a random
    # per-process key (fine for the memory store, which is per process too).
    defense_hash_key: str = ""
    # Signs device tokens and proof-of-work challenges. Required (32+ chars)
    # on Vercel/Railway when the proof-of-work challenge is active.
    defense_token_secret: str = ""
    defense_device_token_ttl_seconds: int = 86_400
    defense_new_token_warmup_seconds: int = 120
    # How many trusted proxies append to X-Forwarded-For (Vercel: 1).
    # 0 = use the socket peer and ignore the header.
    defense_trusted_proxy_hops: int = 0
    # Per-principal limits and budgets for access-code labels are multiplied
    # by this: one label is often shared by a group behind one office NAT.
    defense_access_multiplier: float = 10.0
    # "auto": none when ACCESS_CODES is set (gated users never see it),
    # proof of work when it is not.
    challenge_provider: Literal["auto", "none", "pow"] = "auto"
    defense_pow_bits: int = 13
    defense_pow_surge_bits: int = 4

    # Force a breaker open, regardless of the store or DEFENSE_ENABLED.
    kill_switch_voice: bool = False
    kill_switch_live_ai: bool = False
    kill_switch_share: bool = False

    # Budgets; 0 = no limit. Dollars are estimates from config/model_prices.json.
    budget_tokens_principal_hour: int = 400_000
    budget_tokens_principal_day: int = 1_500_000
    budget_tokens_global_hour: int = 20_000_000
    budget_tokens_global_day: int = 100_000_000
    budget_voice_seconds_principal_hour: int = 900
    budget_voice_seconds_principal_day: int = 1_800
    # 60 mints of REALTIME_MAX_SESSION_SECONDS (600), the voice_mint global row.
    budget_voice_seconds_global_hour: int = 36_000
    budget_voice_seconds_global_day: int = 72_000
    budget_usd_principal_hour: float = 2.0
    budget_usd_principal_day: float = 4.0
    # Global dollar budgets are off until the operator sets them; the
    # OpenAI project's hard limit (or a prepaid balance) is the backstop.
    budget_usd_global_hour: float = 0.0
    budget_usd_global_day: float = 0.0
    budget_usd_global_month: float = 0.0
    # Stop the agent loop once one resident turn has used this many tokens.
    openai_max_tokens_per_turn: int = 120_000
    # JSON that replaces config/model_prices.json (same shape).
    openai_price_table_json: str = ""
    # Voice time reserved against the budgets for each realtime mint.
    realtime_max_session_seconds: int = 600
    realtime_idle_seconds: int = 90

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def sms_country_codes(self) -> list[str]:
        return [c.strip().lstrip("+") for c in self.sms_allowed_country_codes.split(",") if c.strip()]

    @property
    def has_openai(self) -> bool:
        return bool(self.openai_api_key)

    @property
    def has_twilio(self) -> bool:
        return bool(
            self.twilio_account_sid
            and self.twilio_auth_token
            and self.twilio_from_number
        )

    @property
    def has_email(self) -> bool:
        return bool(self.sendgrid_api_key)

    @property
    def has_azure_openai(self) -> bool:
        return bool(self.azure_openai_endpoint and self.azure_openai_key)

    @property
    def use_live_ai(self) -> bool:
        """True when we should call a real model rather than the scripted demo."""
        return not self.demo_mode and self.has_openai

    @property
    def realtime_audio_enabled(self) -> bool:
        """True only when raw-audio voice is opted into twice and live AI is on."""
        return (
            self.voice_pipeline_mode == "realtime_audio"
            and self.allow_raw_audio_stream
            and self.use_live_ai
        )

    # "ignore" so a leftover key from an older .env (e.g. SESSION_TTL_HOURS)
    # doesn't stop the app from starting.
    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}


@lru_cache
def get_settings() -> Settings:
    return Settings()

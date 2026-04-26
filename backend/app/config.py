"""Application configuration via pydantic-settings."""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Global application settings loaded from environment variables."""

    # ── OpenAI (primary AI provider) ───────────────────────────────
    openai_api_key: str = ""
    openai_model: str = "gpt-5.5-2026-04-23"
    openai_reasoning_effort: str = "medium"  # minimal | low | medium | high
    openai_max_tool_iterations: int = 6

    # ── Azure OpenAI (legacy / optional) ───────────────────────────
    azure_openai_endpoint: str = ""
    azure_openai_key: str = ""
    azure_openai_deployment: str = "gpt-5.4-mini"

    # ── Notifications (Twilio SMS + SendGrid email) ────────────────
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_from_number: str = ""  # e.g. "+15125551234"
    sendgrid_api_key: str = ""
    sendgrid_from_email: str = "noreply@austin-service-guide.local"
    sendgrid_from_name: str = "Austin Service Guide"

    # ── App behavior ───────────────────────────────────────────────
    # When True (or no OpenAI key set) the intake runs the scripted
    # fallback flow instead of calling the API.
    demo_mode: bool = False
    # Public origin used to build shareable URLs (QR codes, SMS links)
    public_origin: str = "http://localhost:5173"

    # CORS origins allowed by the API
    cors_origins: str = "http://localhost:5173,http://localhost:3000"

    # App metadata
    app_name: str = "Austin Service Guide API"
    app_version: str = "1.0.0"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

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

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


@lru_cache
def get_settings() -> Settings:
    return Settings()

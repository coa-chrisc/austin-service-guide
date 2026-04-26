"""Application configuration via pydantic-settings."""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Global application settings loaded from environment variables."""

    # Azure OpenAI (optional – app works in demo mode without these)
    azure_openai_endpoint: str = ""
    azure_openai_key: str = ""
    azure_openai_deployment: str = "gpt-5.4-mini"

    # Demo mode – when True (default) uses scripted AI responses
    demo_mode: bool = True

    # CORS origins allowed by the API
    cors_origins: str = "http://localhost:5173,http://localhost:3000"

    # App metadata
    app_name: str = "Austin Service Guide API"
    app_version: str = "1.0.0"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def has_azure_openai(self) -> bool:
        return bool(self.azure_openai_endpoint and self.azure_openai_key)

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


@lru_cache
def get_settings() -> Settings:
    return Settings()

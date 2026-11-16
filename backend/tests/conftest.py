"""Shared fixtures. Tests always run the scripted (no-AI) flow."""

from __future__ import annotations

import os

# Must be set before app.config is imported; env vars override backend/.env.
os.environ["OPENAI_API_KEY"] = ""
os.environ["DEMO_MODE"] = "true"
os.environ["REALTIME_DEBUG_LOG_ENABLED"] = "false"
# The suite runs with defense on (DEFENSE_ENABLED=false pytest runs it off).
# No challenge: the test client cannot solve one, so it is an anonymous
# principal keyed on its network with the standard limits.
os.environ.setdefault("CHALLENGE_PROVIDER", "none")

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture(scope="session")
def client() -> TestClient:
    with TestClient(app) as c:
        yield c


@pytest.fixture
def defense_off(monkeypatch):
    """DEFENSE_ENABLED=false for one test (today's behaviour, no limits)."""
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "defense_enabled", False)


@pytest.fixture(autouse=True)
def fresh_defense_store():
    """Each test starts with empty rate-limit, budget and breaker state."""
    from app.defense.store import set_store

    set_store(None)
    yield
    set_store(None)

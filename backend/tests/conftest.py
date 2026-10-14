"""Shared fixtures. Tests always run the scripted (no-AI) flow."""

from __future__ import annotations

import os

# Must be set before app.config is imported; env vars override backend/.env.
os.environ["OPENAI_API_KEY"] = ""
os.environ["DEMO_MODE"] = "true"
os.environ["REALTIME_DEBUG_LOG_ENABLED"] = "false"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture(scope="session")
def client() -> TestClient:
    with TestClient(app) as c:
        yield c

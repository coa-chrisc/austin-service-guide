"""GET /api/v1/about: deployment facts for the "How it works" page."""

from __future__ import annotations

import json
import os
from pathlib import Path

import pytest
import yaml

from app.config import Settings, get_settings
from app.middleware import MAX_INTAKE_BODY_BYTES
from app.models import MAX_MESSAGE_CHARS, MAX_STATE_MESSAGES
from app.routers import about as about_router
from app.services import catalog, catalog_loader
from app.services.pii import PLACEHOLDERS

DOCUMENTED_KEYS = {
    "app_name", "live_ai", "text_model", "reasoning_effort", "plan_reasoning_effort",
    "max_tool_iterations", "tools", "voice", "pii_kinds", "limits", "catalog", "admin",
    "access_gate",
}
TEXT_TOOLS = [
    "search_services", "get_service_details", "get_crisis_resources", "extract_profile",
    "find_matching_services", "set_language", "complete_intake",
]


def test_values_match_settings(client):
    body = client.get("/api/v1/about").json()
    settings = get_settings()
    assert set(body) == DOCUMENTED_KEYS
    assert body["live_ai"] is settings.use_live_ai is False
    assert body["text_model"] == settings.openai_model
    assert body["reasoning_effort"] == settings.openai_reasoning_effort
    assert body["plan_reasoning_effort"] == settings.openai_plan_reasoning_effort
    assert body["max_tool_iterations"] == settings.openai_max_tool_iterations
    assert body["tools"] == TEXT_TOOLS
    assert body["pii_kinds"] == list(PLACEHOLDERS)
    assert body["voice"] == {"mode": "intercepted_text", "raw_audio_allowed": settings.allow_raw_audio_stream,
                             "realtime_model": None}
    assert body["limits"] == {"intake_body_bytes": MAX_INTAKE_BODY_BYTES,
                              "state_messages": MAX_STATE_MESSAGES, "message_chars": MAX_MESSAGE_CHARS}
    assert set(body["catalog"]) == {"services_total", "services_verified", "categories", "local_crisis_lines"}
    assert body["admin"] == {"auth": "shared_token", "catalog_writes_persist": False}
    assert body["access_gate"] is False


def test_reference_pack_counts(client):
    body = client.get("/api/v1/about").json()["catalog"]
    listed = client.get("/api/v1/services", params={"page_size": 1}).json()["total"]
    assert body["services_total"] == listed
    assert body["categories"] == len(client.get("/api/v1/categories").json())
    # The reference pack records no verification yet (SECURITY.md, known gap 5).
    assert body["services_verified"] == 0
    # Integral Care and SAFE Alliance; 988, 9-1-1 and the national DV line are built in.
    assert body["local_crisis_lines"] == 2


def test_live_settings_show_through_without_secrets_or_model_calls(client, monkeypatch):
    live = Settings(
        openai_api_key="sk-test-secret-value",
        demo_mode=False,
        openai_model="model-under-test",
        openai_reasoning_effort="high",
        openai_plan_reasoning_effort="minimal",
        openai_max_tool_iterations=3,
        voice_pipeline_mode="realtime_audio",
        allow_raw_audio_stream=True,
        admin_api_token="admin-secret-value",
        twilio_auth_token="twilio-secret-value",
    )
    monkeypatch.setattr(about_router, "get_settings", lambda: live)

    def no_model(*_a, **_k):  # pragma: no cover - fails the test if reached
        raise AssertionError("/about must not call a model")

    monkeypatch.setattr("openai.AsyncOpenAI", no_model)
    res = client.get("/api/v1/about")
    body = res.json()
    assert body["live_ai"] is True
    assert body["text_model"] == "model-under-test"
    assert body["reasoning_effort"] == "high"
    assert body["plan_reasoning_effort"] == "minimal"
    assert body["max_tool_iterations"] == 3
    assert body["voice"] == {"mode": "realtime_audio", "raw_audio_allowed": True,
                             "realtime_model": live.openai_realtime_model}
    assert "secret-value" not in res.text
    assert "sk-" not in res.text


def test_raw_audio_needs_both_flags(client, monkeypatch):
    half = Settings(openai_api_key="sk-x", demo_mode=False, voice_pipeline_mode="realtime_audio",
                    allow_raw_audio_stream=False)
    monkeypatch.setattr(about_router, "get_settings", lambda: half)
    voice = client.get("/api/v1/about").json()["voice"]
    assert voice == {"mode": "intercepted_text", "raw_audio_allowed": False, "realtime_model": None}


def test_access_gate_flag(client, monkeypatch):
    monkeypatch.setenv("ACCESS_CODES", "tester:abcd-efgh-ijkl")
    monkeypatch.setenv("ACCESS_GATE_SECRET", "x" * 40)
    body = client.get("/api/v1/about").json()
    assert body["access_gate"] is True
    assert "abcd-efgh-ijkl" not in json.dumps(body)


def _write(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(yaml.safe_dump(data, sort_keys=False), encoding="utf-8")


def _service(slug: str, **extra) -> dict:
    return {"id": f"svc-{slug}", "name": slug.title(), "slug": slug, "description": "Food help.",
            "cost_type": "free", "categories": ["food"], **extra}


@pytest.fixture
def tiny_pack(tmp_path):
    root = tmp_path / "pack"
    _write(root / "categories.yaml", [{"id": "cat-food", "name": "Food", "slug": "food"}])
    _write(root / "life_events.yaml", [])
    _write(root / "crisis_resources.yaml", [
        {"name": "988 Suicide & Crisis Lifeline", "description": "National", "phone": "988",
         "crisis_topic": "mental_health"},
        {"name": "Riverbend Crisis Line", "description": "Local", "phone": "555-010-0100",
         "crisis_topic": "mental_health"},
        {"name": "Riverbend Info", "description": "Not a crisis line", "phone": "555-010-0199"},
    ])
    _write(root / "services" / "pantry.yaml",
           _service("pantry", last_verified_date="2026-01-05", verified_by="Test Staff"))
    _write(root / "services" / "kitchen.yaml", _service("kitchen", last_verified_date="2026-01-05"))
    _write(root / "services" / "closed.yaml",
           _service("closed", status="inactive", last_verified_date="2026-01-05", verified_by="Test Staff"))

    previous = os.environ.get("CITY_DATA_DIR")
    os.environ["CITY_DATA_DIR"] = str(root)
    catalog_loader.reload_all()
    catalog.load_seed_data()
    try:
        yield
    finally:
        if previous is None:
            os.environ.pop("CITY_DATA_DIR", None)
        else:
            os.environ["CITY_DATA_DIR"] = previous
        catalog_loader.reload_all()
        catalog.load_seed_data()


def test_counts_follow_the_data_pack(client, tiny_pack):
    body = client.get("/api/v1/about").json()["catalog"]
    # Inactive services are not listed; "kitchen" lacks verified_by.
    assert body == {"services_total": 2, "services_verified": 1, "categories": 1, "local_crisis_lines": 1}

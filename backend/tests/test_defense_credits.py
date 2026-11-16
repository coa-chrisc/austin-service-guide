"""Out-of-credits notice: an OpenAI quota or spend-limit error gets its own
degraded reason (``ai_credits``) and the operator's configured sentence."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

from app.defense import breakers
from app.services.city import DEFAULT_CREDITS_MESSAGE, load_city
from tests.defense_support import fake_openai, use_store
from tests.test_defense_breakers import _QuotaError, _ai_allowed
from tests.test_intake import Intake

CONFIG_DIR = Path(__file__).resolve().parents[2] / "config"
CONFIGURED = json.loads((CONFIG_DIR / "city.config.json").read_text(encoding="utf-8"))[
    "serviceGuide"
]["creditsExhaustedMessage"]


def test_city_config_message_and_generic_fallback():
    assert "Big Cities Health Coalition" in CONFIGURED
    assert load_city({"CITY_CONFIG_DIR": str(CONFIG_DIR)}).credits_exhausted_message == CONFIGURED
    other = load_city({"CITY_CONFIG_DIR": str(CONFIG_DIR), "CITY_PRESET": "bchc-demo-city"})
    assert other.credits_exhausted_message == DEFAULT_CREDITS_MESSAGE
    assert "operator" in DEFAULT_CREDITS_MESSAGE


def test_quota_error_opens_the_breaker_and_message_reports_ai_credits(client, monkeypatch):
    use_store()
    fake_openai(monkeypatch)
    intake = Intake(client)  # live greeting succeeds
    calls = fake_openai(monkeypatch, fail=_QuotaError("insufficient_quota"))

    first = intake.say_raw("I need food")
    assert first.status_code == 200, first.text
    body = first.json()
    assert len(calls) == 1
    current = asyncio.run(breakers.state("live_ai"))
    assert (current.state, current.reason) == ("open", "upstream:insufficient_quota")
    # The very turn that hit the error already says why, with the configured text as-is.
    assert body["degraded"] == "ai_credits"
    assert body["degraded_notice"] == CONFIGURED
    assert body["response"]["content"].startswith(CONFIGURED)

    # Breaker open: no model call, same reason, the notice is not repeated.
    again = intake.say_raw("2").json()
    assert len(calls) == 1
    assert again["degraded"] == "ai_credits"
    assert again["degraded_notice"] == CONFIGURED
    assert CONFIGURED not in again["response"]["content"]


def test_configured_text_is_not_translated(client, monkeypatch):
    use_store()
    fake_openai(monkeypatch)
    asyncio.run(breakers.trip("live_ai", "upstream:project_spend_limit_exceeded"))
    intake = Intake(client, language="es")
    assert CONFIGURED in intake.state["conversation"][0]["content"]  # said once, on the greeting
    body = intake.say_raw("Necesito comida", language="es").json()
    assert body["degraded"] == "ai_credits"
    assert CONFIGURED not in body["response"]["content"]


def test_start_falls_back_when_the_greeting_hits_the_quota(client, monkeypatch):
    use_store()
    fake_openai(monkeypatch, fail=_QuotaError("insufficient_quota"))
    res = client.post("/api/v1/intake/start", json={})
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["degraded"] == "ai_credits" and body["degraded_notice"] == CONFIGURED
    assert body["greeting"]["content"].startswith(CONFIGURED)


def test_ai_allowed_reports_ai_credits_open_and_half_open(monkeypatch):
    _, clock = use_store()
    fake_openai(monkeypatch)
    asyncio.run(breakers.record_result("live_ai", _QuotaError("insufficient_quota")))
    assert _ai_allowed() == (False, "ai_credits")
    clock.advance(breakers.TRIP_SECONDS)
    assert _ai_allowed() == (True, None)  # the one probe
    assert _ai_allowed() == (False, "ai_credits")  # everyone else while it runs


def test_voice_config_reports_ai_credits(client):
    use_store()
    asyncio.run(breakers.trip("live_ai", "upstream:insufficient_quota"))
    cfg = client.get("/api/v1/intake/voice-config").json()
    assert cfg["mode"] == "intercepted_text"
    assert cfg["degraded"] == "ai_credits"
    assert cfg["degraded_notice"] == CONFIGURED


def test_other_reasons_are_unchanged(client, monkeypatch):
    use_store()
    fake_openai(monkeypatch)
    asyncio.run(breakers.trip("live_ai", "error_rate"))
    assert _ai_allowed() == (False, "ai_budget")
    cfg = client.get("/api/v1/intake/voice-config").json()
    assert cfg["degraded"] == "ai_budget" and "degraded_notice" not in cfg


def test_crisis_turn_still_comes_first(client, monkeypatch):
    use_store()
    calls = fake_openai(monkeypatch)
    intake = Intake(client)
    asyncio.run(breakers.trip("live_ai", "upstream:insufficient_quota"))
    body = intake.say_raw("I want to kill myself").json()
    assert body["response"]["crisis_detected"] is True
    assert "988" in body["response"]["content"]
    assert CONFIGURED not in body["response"]["content"]
    assert "degraded" not in body
    assert len(calls) == 1  # the greeting only

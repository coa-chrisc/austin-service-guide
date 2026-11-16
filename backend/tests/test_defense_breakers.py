"""Circuit breakers and kill switches (defense-02)."""

from __future__ import annotations

import asyncio

import pytest

from app.config import get_settings
from app.defense import breakers, context
from app.defense.budget import ai_allowed
from app.defense.store import HOUR, set_store
from tests.defense_support import fake_openai, principal, use_store
from tests.test_defense_limits import _BrokenStore
from tests.test_intake import Intake


class _QuotaError(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.body = {"error": {"code": code}}


def _state(name: str) -> breakers.BreakerState:
    return asyncio.run(breakers.state(name))


def _ai_allowed() -> tuple[bool, str | None]:
    async def run():
        ctx = context.bind(principal("device"))
        return await ai_allowed(), ctx.degraded

    return asyncio.run(run())


def test_global_dollar_budget_opens_and_rolls_over(monkeypatch):
    store, clock = use_store()
    settings = get_settings()
    monkeypatch.setattr(settings, "budget_usd_global_hour", 1.0)
    fake_openai(monkeypatch)
    asyncio.run(store.incr_many([("use:usd:g", HOUR, 800_000)]))
    assert _state("live_ai").state == "warn"
    assert _ai_allowed() == (True, None)
    asyncio.run(store.incr_many([("use:usd:g", HOUR, 200_000)]))
    current = _state("live_ai")
    assert (current.state, current.reason) == ("open", f"budget:usd:{HOUR}")
    assert _ai_allowed() == (False, "ai_budget")
    assert _state("voice").state == "open"  # voice follows live_ai
    # One log line and event per window, not one per request.
    events = [e for e in store.snapshot()["events"] if e["kind"] == "breaker" and e["state"] == "open"]
    assert len(events) == 1
    clock.advance(HOUR)
    assert _state("live_ai").state == "closed"


def test_spend_limit_error_trips_at_once_then_half_opens(monkeypatch):
    store, clock = use_store()
    asyncio.run(breakers.record_result("live_ai", _QuotaError("insufficient_quota")))
    current = _state("live_ai")
    assert (current.state, current.reason) == ("open", "upstream:insufficient_quota")
    clock.advance(breakers.TRIP_SECONDS)
    half = _state("live_ai")
    assert half.state == "half_open"
    assert asyncio.run(breakers.take_probe("live_ai", half)) is True
    assert asyncio.run(breakers.take_probe("live_ai", half)) is False  # one probe per period
    asyncio.run(breakers.record_result("live_ai", None))
    assert _state("live_ai").state == "closed"


def test_failed_probe_reopens(monkeypatch):
    use_store()
    clock = asyncio.run(_trip_and_expire())
    asyncio.run(breakers.record_result("live_ai", RuntimeError("still down")))
    assert _state("live_ai").state == "open"
    clock.advance(breakers.TRIP_SECONDS)
    assert _state("live_ai").state == "half_open"


async def _trip_and_expire():
    from app.defense.store import get_store

    await breakers.trip("live_ai", "error_rate")
    clock = get_store()._clock
    clock.advance(breakers.TRIP_SECONDS)
    return clock


def test_error_rate_trips_after_enough_calls():
    use_store()

    async def run():
        for _ in range(9):
            await breakers.record_result("live_ai", None)
        for _ in range(10):
            await breakers.record_result("live_ai", RuntimeError("boom"))
        assert (await breakers.state("live_ai")).state == "closed"  # 19 calls: below the minimum
        await breakers.record_result("live_ai", RuntimeError("boom"))  # 11 of 20 failed

    asyncio.run(run())
    assert _state("live_ai").reason == "error_rate"


def test_manual_trip_stays_until_cleared():
    _, clock = use_store()
    asyncio.run(breakers.trip("share", "manual", actor="staff"))
    clock.advance(10 * HOUR)
    assert _state("share").state == "open"
    asyncio.run(breakers.clear("share", actor="staff"))
    assert _state("share").state == "closed"


@pytest.mark.parametrize("enabled", [True, False])
def test_kill_switches_work_with_the_store_offline(client, monkeypatch, enabled):
    settings = get_settings()
    monkeypatch.setattr(settings, "defense_enabled", enabled)
    set_store(_BrokenStore())
    calls = fake_openai(monkeypatch)
    monkeypatch.setattr(settings, "kill_switch_live_ai", True)
    monkeypatch.setattr(settings, "kill_switch_share", True)
    assert _state("live_ai").reason == "kill_switch"
    assert _ai_allowed() == (False, "disabled")

    intake = Intake(client)
    body = intake.say_raw("I need food").json()
    assert calls == [] and body["degraded"] == "disabled"
    assert "paused" in intake.state["conversation"][0]["content"]  # said once, on the greeting

    cfg = client.get("/api/v1/intake/voice-config").json()
    assert cfg["mode"] == "intercepted_text" and cfg["degraded"] == "disabled"
    share = client.post("/api/v1/intake/share", json={"channel": "sms", "recipient": "5125551234",
                                                      "service_ids": ["x"]})
    assert share.status_code == 503 and share.json()["code"] == "share_unavailable"


def test_live_ai_breaker_sends_turns_to_the_scripted_flow(client, monkeypatch):
    use_store()
    calls = fake_openai(monkeypatch)
    asyncio.run(breakers.trip("live_ai", "manual"))
    intake = Intake(client)
    first = intake.say_raw("I need food").json()
    assert calls == []
    assert first["degraded"] == "disabled"
    assert "paused" in intake.state["conversation"][0]["content"]
    assert "paused" not in first["response"]["content"]


def test_voice_config_reports_a_spent_voice_budget(client, monkeypatch):
    store, _ = use_store()
    monkeypatch.setattr(get_settings(), "budget_voice_seconds_global_hour", 1200)
    asyncio.run(store.incr_many([("use:voice:g", HOUR, 1200)]))
    cfg = client.get("/api/v1/intake/voice-config").json()
    assert cfg["mode"] == "intercepted_text" and cfg["degraded"] == "voice_budget"
    assert cfg["max_session_seconds"] == 600 and cfg["idle_seconds"] == 90


def test_voice_config_healthy_adds_session_limits(client):
    use_store()
    cfg = client.get("/api/v1/intake/voice-config").json()
    assert cfg["degraded"] is None and cfg["mode"] == "intercepted_text"
    assert cfg["max_session_seconds"] == 600


def test_share_breaker_open_returns_503(client):
    use_store()
    asyncio.run(breakers.trip("share", "error_rate"))
    res = client.post("/api/v1/intake/share", json={"channel": "sms", "recipient": "5125551234",
                                                    "service_ids": ["x"]})
    assert res.status_code == 503 and res.json()["code"] == "share_unavailable"


def test_realtime_mint_is_refused_while_voice_is_open(client, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "voice_pipeline_mode", "realtime_audio")
    monkeypatch.setattr(settings, "allow_raw_audio_stream", True)
    fake_openai(monkeypatch)
    use_store()
    asyncio.run(breakers.trip("voice", "manual"))
    res = client.post("/api/v1/intake/realtime/client-secret", json={})
    assert res.status_code == 503 and res.json()["code"] == "voice_unavailable"

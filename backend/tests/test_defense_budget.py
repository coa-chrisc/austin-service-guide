"""Metering and budgets (defense-02): tokens, dollars, voice seconds."""

from __future__ import annotations

import asyncio
import logging
from types import SimpleNamespace

import pytest

from app.config import get_settings
from app.defense import context, usage
from app.defense.budget import ai_allowed, reserve_voice
from app.defense.limits import DefenseRefusal
from app.defense.store import CALENDAR_MONTH, DAY, HOUR
from tests.defense_support import fake_openai, principal, use_store
from tests.test_intake import Intake

USAGE = {"input_tokens": 1000, "output_tokens": 100, "input_tokens_details": {"cached_tokens": 200}}


@pytest.fixture(autouse=True)
def fresh_prices():
    usage.reset_prices()
    yield
    usage.reset_prices()


class _Stub:
    """A raw client whose responses.create returns ``usage`` (or None)."""

    def __init__(self, usage_obj=None):
        self.calls = 0
        outer = self

        class _R:
            async def create(self, **kwargs):
                outer.calls += 1
                return SimpleNamespace(output=[], output_text="ok", usage=usage_obj)

        self.responses = _R()


def _counter(store, key: str, window: int) -> int:
    return asyncio.run(store.get_many([(key, window)]))[0]


def test_metering_records_tokens_and_dollars():
    store, _ = use_store()
    who = principal("device")

    async def run():
        context.bind(who)
        client = usage.metered(_Stub(USAGE), "intake")
        await client.responses.create(model="gpt-5.5-2026-04-23", input="hi")

    asyncio.run(run())
    # (1000 - 200) x $5 + 200 x $0.50 + 100 x $30 per 1M tokens = $0.0071
    assert _counter(store, f"use:usd:p:{who.hash}", HOUR) == 7100
    assert _counter(store, f"use:usd:p:{who.hash}", DAY) == 7100
    assert _counter(store, "use:usd:g", CALENDAR_MONTH) == 7100
    assert _counter(store, f"use:tin:p:{who.hash}", HOUR) == 1000
    assert _counter(store, "use:tout:g", DAY) == 100


def test_missing_usage_counts_the_worst_case():
    store, _ = use_store()

    async def run():
        context.bind(principal("device"))
        client = usage.metered(_Stub(None), "intake")
        await client.responses.create(model="gpt-5.5", input="x" * 3000, max_output_tokens=2000)

    asyncio.run(run())
    assert _counter(store, "use:tin:g", HOUR) >= 1000
    assert _counter(store, "use:tout:g", HOUR) == 2000


def test_a_model_without_a_price_warns_once_and_keeps_token_budgets(caplog):
    store, _ = use_store()

    async def run():
        context.bind(principal("device"))
        client = usage.metered(_Stub(USAGE), "intake")
        for _ in range(2):
            await client.responses.create(model="mystery-model", input="hi")

    with caplog.at_level(logging.WARNING, logger="app.defense.usage"):
        asyncio.run(run())
    assert sum("mystery-model" in r.getMessage() for r in caplog.records) == 1
    assert _counter(store, "use:usd:g", HOUR) == 0
    assert _counter(store, "use:tin:g", HOUR) == 2000


def test_price_table_override_and_bundled_file(monkeypatch):
    assert usage.prices_for("gpt-5.5-2026-04-23") == {"input": 5.0, "cached_input": 0.5, "output": 30.0}
    monkeypatch.setattr(get_settings(), "openai_price_table_json", '{"models": {"m": {"input": 1, "output": 2}}}')
    usage.reset_prices()
    assert usage.usd_micros("m", 1_000_000, 0, 1_000_000) == 3_000_000


def test_defense_off_returns_the_raw_client(defense_off):
    raw = _Stub(USAGE)
    assert usage.metered(raw, "intake") is raw


def test_spent_principal_budget_switches_to_the_scripted_flow(client, monkeypatch):
    use_store()
    calls = fake_openai(monkeypatch, usage=USAGE)
    monkeypatch.setattr(get_settings(), "budget_tokens_principal_hour", 500)
    intake = Intake(client)  # the live greeting is the one model call
    assert len(calls) == 1
    res = intake.say_raw("I need food")
    assert res.status_code == 200
    body = res.json()
    assert len(calls) == 1, "no model call once the budget is spent"
    assert body["degraded"] == "ai_budget"
    assert "limit for the AI assistant" in body["response"]["content"]
    # The notice is said once per intake, not on every turn.
    again = intake.say_raw("2").json()
    assert again["degraded"] == "ai_budget"
    assert "limit for the AI assistant" not in again["response"]["content"]


def test_per_turn_token_ceiling_stops_the_tool_loop(client, monkeypatch):
    import openai

    use_store()
    monkeypatch.setattr(get_settings(), "openai_max_tokens_per_turn", 1500)
    calls: list[dict] = []
    call = SimpleNamespace(type="function_call", name="search_services", arguments='{"query": "food"}',
                           call_id="c1", id="fc1")

    class _Responses:
        async def create(self, **kwargs):
            calls.append(kwargs)
            return SimpleNamespace(output=[call], output_text="",
                                   usage=SimpleNamespace(input_tokens=1000, output_tokens=100))

    class _Client:
        def __init__(self, **_):
            self.responses = _Responses()

    fake_openai(monkeypatch)
    monkeypatch.setattr(openai, "AsyncOpenAI", _Client)
    intake = Intake(client)
    before = len(calls)
    content = intake.say("I need food")
    assert len(calls) - before == 2  # 1100 tokens, then 2200 >= 1500: stop (the cap is 6 iterations)
    assert "ran out of time" in content


def test_scripted_flow_writes_no_usage():
    from fastapi.testclient import TestClient

    from app.main import app

    store, _ = use_store()
    intake = Intake(TestClient(app))
    for text in ("I need food", "2", "78741"):
        intake.say(text)
    assert not [k for k in store.snapshot()["counters"] if k.startswith("use:")]


def test_ai_allowed_is_false_without_live_ai():
    use_store()

    async def run():
        context.bind(principal("device"))
        return await ai_allowed()

    assert asyncio.run(run()) is False


def test_voice_reservation_charges_the_session_length(monkeypatch):
    store, clock = use_store()
    settings = get_settings()
    monkeypatch.setattr(settings, "realtime_max_session_seconds", 600)
    device = principal("device")

    async def run():
        await reserve_voice(device)  # 600 of the 900-second hourly budget
        with pytest.raises(DefenseRefusal) as refused:
            await reserve_voice(device)
        assert refused.value.status == 429 and refused.value.code == "voice_budget"
        for _ in range(2):  # 1200, then 1800 of the 1800-second daily budget
            clock.advance(HOUR)
            await reserve_voice(device)
        clock.advance(HOUR)
        with pytest.raises(DefenseRefusal):
            await reserve_voice(device)

        office = principal("access", "office")  # x10: 9000 s an hour
        for _ in range(15):
            await reserve_voice(office)

    asyncio.run(run())
    assert _counter(store, "use:voice:g", DAY) == 600 * 18

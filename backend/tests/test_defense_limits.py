"""Route rate limits (defense-01 PR a): policy table, tiers, headers, D5, D6."""

from __future__ import annotations

import asyncio

import pytest

from app.defense import limits
from app.defense.limits import DEFAULT_POLICIES, DefenseRefusal, check
from tests.defense_support import gated_client, login, principal, use_store
from tests.test_intake import Intake

ROWS = [(p.name, r.name, r.scope) for p in DEFAULT_POLICIES for r in p.rules]


@pytest.fixture(autouse=True)
def fresh_policies(monkeypatch):
    for key in list(__import__("os").environ):
        if key.startswith("RL_"):
            monkeypatch.delenv(key)
    limits.reset_policies()
    yield
    limits.reset_policies()


def _override(monkeypatch, policy: str, rule: str, value: int) -> None:
    monkeypatch.setenv(f"RL_{policy}_{rule}".upper(), str(value))
    limits.reset_policies()


# ── Every row of the policy table ───────────────────────────────────────

@pytest.mark.parametrize(("policy", "rule", "scope"), ROWS)
def test_every_policy_row_reaches_its_limit(monkeypatch, policy, rule, scope):
    _, clock = use_store()
    _override(monkeypatch, policy, rule, 2)
    who = principal("device")
    recipient = "r-hash" if scope == "recipient" else None

    async def run():
        for _ in range(2):
            await check(policy, who, recipient_hash=recipient)
        with pytest.raises(DefenseRefusal) as refused:
            await check(policy, who, recipient_hash=recipient)
        return refused.value

    refusal = asyncio.run(run())
    assert refusal.status == 429 and refusal.code == "rate_limited" and refusal.policy == policy
    assert refusal.retry_after and refusal.retry_after > 0


def test_zero_disables_a_row(monkeypatch):
    use_store()
    _override(monkeypatch, "intake_message", "principal", 0)
    who = principal("device")

    async def run():
        for _ in range(25):
            await check("intake_message", who)

    asyncio.run(run())


def test_window_rollover_resets_the_count(monkeypatch):
    _, clock = use_store()
    _override(monkeypatch, "intake_message", "principal", 1)
    who = principal("device")

    async def run():
        await check("intake_message", who)
        with pytest.raises(DefenseRefusal):
            await check("intake_message", who)
        clock.advance(60)
        await check("intake_message", who)

    asyncio.run(run())


# ── HTTP: body, headers, Retry-After ───────────────────────────────────

def test_refusal_body_and_headers_over_http(client, monkeypatch):
    use_store()
    _override(monkeypatch, "intake_start", "principal", 1)
    first = client.post("/api/v1/intake/start", json={})
    assert first.status_code == 200
    assert first.headers["RateLimit-Limit"] == "1"
    assert first.headers["RateLimit-Remaining"] == "0"
    assert int(first.headers["RateLimit-Reset"]) > 0
    second = client.post("/api/v1/intake/start", json={})
    assert second.status_code == 429
    body = second.json()
    assert body["code"] == "rate_limited" and body["policy"] == "intake_start"
    assert body["retry_after"] == int(second.headers["Retry-After"]) > 0
    assert isinstance(body["detail"], str) and "directory" in body["detail"]


@pytest.mark.parametrize(("path", "method"), [
    ("/api/v1/services?page_size=1", "GET"),
    ("/api/v1/services/categories", "GET"),
    ("/api/v1/services/crisis-resources", "GET"),
    ("/api/v1/services/map-pins", "GET"),
])
def test_directory_and_crisis_routes_are_never_limited(client, monkeypatch, path, method):
    """D6: the non-AI paths have no in-app limit at all."""
    use_store()
    for policy in DEFAULT_POLICIES:
        for rule in policy.rules:
            monkeypatch.setenv(f"RL_{policy.name}_{rule.name}".upper(), "1")
    limits.reset_policies()
    for _ in range(30):
        res = client.request(method, path)
        assert res.status_code in (200, 404), (path, res.status_code)
        assert res.status_code != 429 and "RateLimit-Limit" not in res.headers


def test_crisis_message_is_answered_even_when_rate_limited(client, monkeypatch):
    """D6: a flood refusal never hides the crisis response."""
    use_store()
    _override(monkeypatch, "intake_message", "principal", 1)
    intake = Intake(client)
    intake.say("I need food")
    assert intake.say_raw("2").status_code == 429
    res = intake.say_raw("I want to kill myself")
    assert res.status_code == 200
    assert res.json()["response"]["crisis_detected"] is True


# ── Tiers ───────────────────────────────────────────────────────────────

def test_gated_labels_have_separate_allowances(monkeypatch):
    from app.config import get_settings
    from app.main import app

    use_store()
    monkeypatch.setattr(get_settings(), "defense_access_multiplier", 1.0)
    _override(monkeypatch, "intake_start", "principal", 2)
    alpha, bravo = gated_client(app), gated_client(app)
    login(alpha, "alpha-code-1")
    login(bravo, "bravo-code-2")
    for _ in range(2):
        assert alpha.post("/api/v1/intake/start", json={}).status_code == 200
    assert alpha.post("/api/v1/intake/start", json={}).status_code == 429
    assert bravo.post("/api/v1/intake/start", json={}).status_code == 200


def test_gated_label_gets_the_multiplier_and_skips_network_rows(monkeypatch):
    use_store()
    _override(monkeypatch, "intake_message", "net", 1)
    who = principal("access", "office")

    async def run():
        # Default 20/min x DEFENSE_ACCESS_MULTIPLIER (10), and the /24 row of 1 is skipped.
        for _ in range(200):
            await check("intake_message", who)
        with pytest.raises(DefenseRefusal):
            await check("intake_message", who)

    asyncio.run(run())


def test_demo_office_does_not_trip_defaults():
    """Ten people on one label behind one NAT, two busy recording hours.

    Each person starts three intakes an hour, sends two messages a minute
    with a results read after each, and builds three plans an hour.
    """
    _, clock = use_store()
    office = principal("access", "rockefeller", net="office-nat")

    async def run():
        for minute in range(120):
            for _person in range(10):
                if minute % 20 == 0:
                    await check("intake_start", office)
                    await check("intake_plan", office)
                for _ in range(2):
                    await check("intake_message", office)
                    await check("intake_read", office)
            clock.advance(60)

    asyncio.run(run())


def test_nat_crowd_one_flooder_does_not_block_the_others():
    """50 devices behind one address: the flooder gets 429, the others do not."""
    use_store()

    async def run():
        flooder = principal("device", "flood", net="carrier")
        refused = 0
        for _ in range(40):
            try:
                await check("intake_message", flooder)
            except DefenseRefusal:
                refused += 1
        assert refused == 20
        for i in range(50):
            honest = principal("device", f"dev-{i}", net="carrier")
            for _ in range(8):
                await check("intake_message", honest)

    asyncio.run(run())


def test_anon_with_a_challenge_is_quartered_and_refused_voice_and_share(monkeypatch):
    use_store()
    monkeypatch.setattr(limits, "challenge_provider", lambda: "pow")
    anon = principal("anon", "net:x")

    async def run():
        for _ in range(5):  # 20 / 4
            await check("intake_message", anon)
        with pytest.raises(DefenseRefusal) as flood:
            await check("intake_message", anon)
        assert flood.value.status == 429
        for policy in ("voice_mint", "share"):
            with pytest.raises(DefenseRefusal) as refused:
                await check(policy, anon)
            assert refused.value.status == 403 and refused.value.code == "challenge_required"

    asyncio.run(run())


def test_anon_without_a_challenge_gets_device_limits(monkeypatch):
    use_store()
    monkeypatch.setattr(limits, "challenge_provider", lambda: "none")
    anon = principal("anon", "net:x")

    async def run():
        for _ in range(20):
            await check("intake_message", anon)
        await check("share", anon)

    asyncio.run(run())


def test_new_device_waits_out_the_warmup_before_voice():
    _, clock = use_store()
    fresh = principal("device", issued_at=int(clock()) - 10)

    async def run():
        with pytest.raises(DefenseRefusal) as refused:
            await check("voice_mint", fresh)
        assert refused.value.status == 429 and 100 <= refused.value.retry_after <= 110
        clock.advance(120)
        await check("voice_mint", fresh)

    asyncio.run(run())


def test_share_recipient_is_limited_per_address(client, monkeypatch):
    from app.routers import intake as intake_router

    use_store()

    async def fake_send_sms(*, to, body):
        return {"ok": True, "demo": True, "channel": "sms", "to": to}

    monkeypatch.setattr(intake_router, "send_sms", fake_send_sms)
    _override(monkeypatch, "share_recipient", "day", 1)
    from app.services import catalog

    sid = catalog.get_all_services(page=1, page_size=1)["items"][0].id
    body = {"channel": "sms", "service_ids": [sid]}
    assert client.post("/api/v1/intake/share", json={**body, "recipient": "5125551234"}).status_code == 200
    again = client.post("/api/v1/intake/share", json={**body, "recipient": "(512) 555-1234"})
    assert again.status_code == 429 and again.json()["policy"] == "share_recipient"
    assert client.post("/api/v1/intake/share", json={**body, "recipient": "5125559999"}).status_code == 200


# ── Store failure (D5) ──────────────────────────────────────────────────

class _BrokenStore:
    name = "broken"
    shared = False

    def now(self):
        import time

        return time.time()

    async def _fail(self, *a, **k):
        raise ConnectionError("store down")

    incr_many = get_many = put_once = get_record = set_record = delete_record = _fail
    append_event = list_events = _fail


def test_store_down_chat_falls_back_and_voice_share_fail_closed(client, monkeypatch):
    from app.defense.store import set_store
    from app.defense.store_memory import MemoryStore

    set_store(_BrokenStore())
    monkeypatch.setattr(limits, "_fallback_store", MemoryStore())
    intake = Intake(client)  # intake_start: local fallback
    assert intake.say_raw("I need food").status_code == 200

    async def run():
        for policy in ("voice_mint", "share", "defense_token"):
            with pytest.raises(DefenseRefusal) as refused:
                await check(policy, principal("device"))
            assert refused.value.status == 503

    asyncio.run(run())


def test_store_down_fallback_limiter_runs_at_half(monkeypatch):
    from app.defense.store import set_store
    from app.defense.store_memory import MemoryStore

    set_store(_BrokenStore())
    monkeypatch.setattr(limits, "_fallback_store", MemoryStore())
    who = principal("device")

    async def run():
        for _ in range(10):  # 20 / 2
            await check("intake_message", who)
        with pytest.raises(DefenseRefusal):
            await check("intake_message", who)

    asyncio.run(run())


# ── DEFENSE_ENABLED=false ───────────────────────────────────────────────

def test_disabled_restores_todays_behaviour(client, defense_off, monkeypatch):
    from app.defense.store import get_store

    store, _ = use_store()
    _override(monkeypatch, "intake_message", "principal", 1)
    _override(monkeypatch, "intake_start", "principal", 1)
    intake = Intake(client)
    for text in ("I need food", "2", "78741"):
        res = intake.say_raw(text)
        assert res.status_code == 200
        assert "RateLimit-Limit" not in res.headers and "degraded" not in res.json()
    Intake(client)
    assert client.get("/api/v1/intake/voice-config").json() == {
        "mode": "intercepted_text", "raw_audio_allowed": False, "live_ai": False,
    }
    assert get_store() is store and store.snapshot()["counters"] == {}

"""Proof-of-work challenge and the device token (defense-01, decision D4)."""

from __future__ import annotations

import asyncio

import pytest

from app.config import get_settings
from app.defense import challenge, device
from app.defense.keys import challenge_provider, check_defense_config, keyed_hash, reset_keys, token_secret
from app.defense.store import DefenseConfigError
from tests.defense_support import gated_client, login, use_store


@pytest.fixture
def pow_on(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "challenge_provider", "pow")
    monkeypatch.setattr(settings, "defense_pow_bits", 8)  # fast tests; the default is 13
    monkeypatch.setattr(settings, "defense_token_secret", "s" * 40)
    reset_keys()
    yield
    reset_keys()


def _solved(store) -> dict:
    issued = challenge.issue_pow(store.now())
    counter = challenge.solve_pow(issued["nonce"], issued["difficulty"])
    return {k: issued[k] for k in ("nonce", "difficulty", "expires_at", "sig")} | {"counter": str(counter)}


def _verify(store, body) -> bool:
    return asyncio.run(challenge.verify_pow(store, body["nonce"], body["difficulty"], body["expires_at"],
                                            body["sig"], body["counter"]))


def test_leading_zero_bits():
    assert challenge.leading_zero_bits(b"\x00\x00\xff") == 16
    assert challenge.leading_zero_bits(b"\x00\x10") == 11
    assert challenge.leading_zero_bits(b"\x80") == 0
    assert challenge.leading_zero_bits(b"\x00\x00") == 16


def test_valid_solution_verifies_once(pow_on):
    store, _ = use_store()
    body = _solved(store)
    assert _verify(store, body) is True
    assert _verify(store, body) is False  # replayed nonce


def test_expired_challenge_fails(pow_on):
    store, clock = use_store()
    body = _solved(store)
    clock.advance(challenge.POW_TTL_SECONDS)
    assert _verify(store, body) is False


@pytest.mark.parametrize("tamper", ["difficulty", "expires_at", "sig", "counter", "nonce"])
def test_tampered_challenge_fails(pow_on, tamper):
    store, _ = use_store()
    body = _solved(store)
    if tamper == "difficulty":
        body["difficulty"] = 1  # easier than issued: the signature no longer matches
    elif tamper == "expires_at":
        body["expires_at"] += 30
    elif tamper == "sig":
        body["sig"] = "A" * len(body["sig"])
    elif tamper == "counter":
        body["counter"] = "12a"
    else:
        body["nonce"] = body["nonce"][:-1] + ("A" if body["nonce"][-1] != "A" else "B")
    assert _verify(store, body) is False


def test_wrong_answer_fails(pow_on):
    store, _ = use_store()
    issued = challenge.issue_pow(store.now())
    import hashlib

    bad = next(c for c in range(10_000) if challenge.leading_zero_bits(
        hashlib.sha256(f"{issued['nonce']}{c}".encode()).digest()) < issued["difficulty"])
    body = {k: issued[k] for k in ("nonce", "difficulty", "expires_at", "sig")} | {"counter": str(bad)}
    assert _verify(store, body) is False


def test_token_endpoint_sets_the_device_cookie(pow_on):
    from fastapi.testclient import TestClient

    from app.main import app

    client = TestClient(app)  # its own cookie jar: the shared client must not keep csg_dev
    store, _ = use_store()
    got = client.get("/api/v1/defense/challenge")
    assert got.status_code == 200 and got.headers["Cache-Control"] == "no-store"
    issued = got.json()
    assert issued["provider"] == "pow" and issued["difficulty"] == 8
    assert issued["token_ttl_seconds"] == 86_400
    counter = challenge.solve_pow(issued["nonce"], issued["difficulty"])
    body = {k: issued[k] for k in ("nonce", "difficulty", "expires_at", "sig")} | {"counter": str(counter)}
    res = client.post("/api/v1/defense/token", json=body)
    assert res.status_code == 204, res.text
    cookie = res.headers["set-cookie"]
    assert cookie.startswith(f"{device.COOKIE_NAME}=v1.")
    for part in ("HttpOnly", "Max-Age=86400", "Path=/api", "SameSite=lax"):
        assert part.lower() in cookie.lower()
    token = device.parse(client.cookies.get(device.COOKIE_NAME), store.now())
    assert token is not None

    # The next AI request counts against the device, not the network.
    assert client.post("/api/v1/intake/start", json={}).status_code == 200
    keys = " ".join(store.snapshot()["counters"])
    assert f"rl:intake_start:p:{keyed_hash(f'device:{token.id}')}" in keys

    replay = client.post("/api/v1/defense/token", json=body)
    assert replay.status_code == 400 and replay.json()["code"] == "challenge_failed"


def test_anon_must_pass_the_challenge_before_share(client, pow_on):
    use_store()
    res = client.post("/api/v1/intake/share", json={"channel": "sms", "recipient": "5125551234",
                                                    "service_ids": ["x"]})
    assert res.status_code == 403 and res.json()["code"] == "challenge_required", res.text


def test_provider_none_issues_nothing(client):
    use_store()
    assert challenge_provider() == "none"
    assert client.get("/api/v1/defense/challenge").json() == {"provider": "none"}
    assert client.post("/api/v1/defense/token", json={
        "nonce": "abcdefgh", "difficulty": 8, "expires_at": 1, "sig": "abcdefgh", "counter": "1",
    }).status_code == 404


def test_auto_provider_is_off_behind_the_access_gate(monkeypatch):
    monkeypatch.setattr(get_settings(), "challenge_provider", "auto")
    monkeypatch.delenv("ACCESS_CODES", raising=False)
    assert challenge_provider() == "pow"
    monkeypatch.setenv("ACCESS_CODES", "alpha:alpha-code-1")
    assert challenge_provider() == "none"


def test_gated_user_never_sees_a_challenge(monkeypatch):
    from app.main import app

    use_store()
    monkeypatch.setattr(get_settings(), "challenge_provider", "auto")
    monkeypatch.setenv("ACCESS_CODES", "alpha:alpha-code-1,bravo:bravo-code-2")
    c = gated_client(app)
    login(c, "alpha-code-1")
    assert c.get("/api/v1/defense/challenge").json() == {"provider": "none"}
    # Voice and share are open to the label without any device token.
    res = c.post("/api/v1/intake/share", json={"channel": "sms", "recipient": "5125551234", "service_ids": ["x"]})
    assert res.status_code == 400  # no matching services, not 403 challenge_required


def test_public_deployment_needs_a_token_secret(monkeypatch):
    settings = get_settings()
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.delenv("ACCESS_CODES", raising=False)
    monkeypatch.setattr(settings, "challenge_provider", "auto")
    monkeypatch.setattr(settings, "defense_token_secret", "")
    reset_keys()
    try:
        with pytest.raises(DefenseConfigError):
            check_defense_config()
        monkeypatch.setenv("ACCESS_CODES", "alpha:alpha-code-1")  # gated: no challenge, no secret needed
        reset_keys()
        assert token_secret()
        monkeypatch.setattr(settings, "defense_token_secret", "short")
        reset_keys()
        with pytest.raises(DefenseConfigError):
            token_secret()
    finally:
        reset_keys()

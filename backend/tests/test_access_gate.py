"""Tests for the optional access-code gate, using a throwaway app."""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from fastapi.testclient import TestClient

from app import access_gate
from app.access_gate import (
    COOKIE_NAME,
    AccessGateConfigError,
    AccessGateMiddleware,
    cookie_is_valid,
    load_gate_config,
)

SECRET = "s" * 40
CODES = "chris:alpha-1234,rocky:bravo-5678"


@pytest.fixture(autouse=True)
def no_delay(monkeypatch):
    monkeypatch.setattr(access_gate, "FAILED_ATTEMPT_DELAY_SECONDS", 0)


def make_client(codes: str = CODES) -> TestClient:
    config = load_gate_config({"ACCESS_CODES": codes, "ACCESS_GATE_SECRET": SECRET})
    app = FastAPI()

    @app.get("/api/v1/health")
    async def health():
        return {"status": "healthy"}

    @app.get("/api/v1/ping")
    async def ping():
        return {"pong": True}

    @app.get("/{full_path:path}")
    async def spa(full_path: str):
        return JSONResponse({"spa": full_path}, headers={"Cache-Control": "public, max-age=3600", "Vary": "Accept"})

    app.add_middleware(AccessGateMiddleware, config=config, app_name="Test Guide")
    return TestClient(app, base_url="https://testserver")


def login(client: TestClient, code: str, next_path: str = "/"):
    return client.post("/access", data={"code": code, "next": next_path}, follow_redirects=False)


def test_off_when_unset():
    assert load_gate_config({}) is None
    assert load_gate_config({"ACCESS_CODES": "  "}) is None


@pytest.mark.parametrize(
    "env",
    [
        {"ACCESS_CODES": CODES},  # no secret
        {"ACCESS_CODES": CODES, "ACCESS_GATE_SECRET": "short"},
        {"ACCESS_CODES": "nocolon", "ACCESS_GATE_SECRET": SECRET},
        {"ACCESS_CODES": "a:short", "ACCESS_GATE_SECRET": SECRET},
        {"ACCESS_CODES": "a:alpha-1234,a:bravo-5678", "ACCESS_GATE_SECRET": SECRET},
        {"ACCESS_CODES": "bad label:alpha-1234", "ACCESS_GATE_SECRET": SECRET},
        {"ACCESS_CODES": ",", "ACCESS_GATE_SECRET": SECRET},
    ],
)
def test_bad_config_fails_loudly(env):
    with pytest.raises(AccessGateConfigError):
        load_gate_config(env)


def test_unauthenticated_page_redirects_to_gate():
    r = make_client().get("/results?x=1", follow_redirects=False)
    assert r.status_code == 303
    assert r.headers["location"] == "/access?next=%2Fresults%3Fx%3D1"


def test_unauthenticated_api_is_401():
    r = make_client().get("/api/v1/ping")
    assert r.status_code == 401
    assert "pong" not in r.text


def test_health_and_gate_page_are_public():
    c = make_client()
    assert c.get("/api/v1/health").json() == {"status": "healthy"}
    r = c.get("/access?next=/results")
    assert r.status_code == 200
    assert "Test Guide" in r.text and 'value="/results"' in r.text


def test_wrong_code_rejected_without_cookie():
    r = login(make_client(), "nope-nope-nope")
    assert r.status_code == 401
    assert COOKIE_NAME not in r.cookies


def test_valid_code_sets_cookie_and_unlocks():
    c = make_client()
    r = login(c, "  bravo-5678 ", "/results")
    assert r.status_code == 303 and r.headers["location"] == "/results"
    set_cookie = r.headers["set-cookie"].lower()
    assert "httponly" in set_cookie and "secure" in set_cookie and "samesite=lax" in set_cookie
    assert c.get("/api/v1/ping").json() == {"pong": True}
    assert c.get("/results").json() == {"spa": "results"}


@pytest.mark.parametrize("bad_next", ["//evil.example", "https://evil.example", "/\\evil.example", ""])
def test_open_redirect_blocked(bad_next):
    r = login(make_client(), "alpha-1234", bad_next)
    assert r.headers["location"] == "/"


def test_forged_or_revoked_cookie_rejected():
    c = make_client()
    login(c, "alpha-1234")
    issued = c.cookies.get(COOKIE_NAME)
    config = load_gate_config({"ACCESS_CODES": CODES, "ACCESS_GATE_SECRET": SECRET})
    assert cookie_is_valid(config, issued)
    assert not cookie_is_valid(config, "rocky." + issued.split(".", 1)[1])
    assert not cookie_is_valid(config, "chris.deadbeef")
    # Changing chris's code revokes the cookie issued for the old one.
    rotated = load_gate_config({"ACCESS_CODES": "chris:charlie-999,rocky:bravo-5678", "ACCESS_GATE_SECRET": SECRET})
    assert not cookie_is_valid(rotated, issued)


def test_oversized_form_rejected():
    r = make_client().post("/access", content=b"code=" + b"x" * 5000, headers={"content-type": "application/x-www-form-urlencoded"})
    assert r.status_code == 413


def test_gated_responses_are_not_publicly_cacheable():
    c = make_client()
    login(c, "alpha-1234")
    r = c.get("/results")
    assert r.headers["cache-control"] == "private, max-age=3600"
    assert r.headers["vary"] == "Accept, Cookie"


def test_non_ascii_cookie_is_rejected_not_500():
    c = make_client()
    r = c.get("/api/v1/ping", headers={"cookie": f"{COOKIE_NAME}=chris.\u00e9".encode("utf-8")})
    assert r.status_code == 401

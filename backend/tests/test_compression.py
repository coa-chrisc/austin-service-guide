"""Gzip response compression (issue #49): SPA files and JSON, with the app's
real middleware stack, including the access gate and the intake body limit."""

from __future__ import annotations

import gzip

import pytest
from fastapi import FastAPI
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.testclient import TestClient
from starlette.middleware import Middleware

from app.access_gate import AccessGateMiddleware, load_gate_config
from app.main import app as main_app
from app.security_headers import SecurityHeadersMiddleware
from app.spa import mount_spa

GZIP = {"Accept-Encoding": "gzip"}
CODE = "abcd-efgh-jkmn"
CODES = f"tester:{CODE}"
SECRET = "s" * 40
ASSET = "assets/index-AbC123xy.js"


def _wire_bytes(res) -> int:
    """Bytes received before httpx decoded the body."""
    return res.num_bytes_downloaded


@pytest.fixture()
def static_dir(tmp_path):
    static = tmp_path / "static"
    (static / "assets").mkdir(parents=True)
    (static / "index.html").write_text("<!doctype html><html><body>" + "<div>INDEX</div>" * 200 + "</body></html>")
    (static / ASSET).write_text("export const x = 1;\n" * 500)
    return static


def _spa_app(static_dir, *, gate: bool = False) -> FastAPI:
    """A fresh app with main's middleware stack (same classes, options and order) plus the SPA."""
    app = FastAPI()
    middleware = list(main_app.user_middleware)
    if gate:
        # main.py adds the gate just inside the security headers (outermost).
        assert middleware[0].cls is SecurityHeadersMiddleware
        config = load_gate_config({"ACCESS_CODES": CODES, "ACCESS_GATE_SECRET": SECRET})
        middleware.insert(1, Middleware(AccessGateMiddleware, config=config, app_name="Test Guide"))
    app.user_middleware = middleware
    mount_spa(app, static_dir)
    return app


def test_gzip_is_the_innermost_middleware():
    classes = [m.cls for m in main_app.user_middleware]
    assert classes[-1] is GZipMiddleware
    assert classes.count(GZipMiddleware) == 1


@pytest.mark.parametrize("path", ["/", "/services", f"/{ASSET}"])
def test_spa_files_are_gzipped(static_dir, path):
    client = TestClient(_spa_app(static_dir))
    res = client.get(path, headers=GZIP)
    assert res.status_code == 200
    assert res.headers["content-encoding"] == "gzip"
    assert "accept-encoding" in res.headers["vary"].lower()
    expected = (static_dir / (ASSET if path.endswith(".js") else "index.html")).read_bytes()
    assert res.content == expected
    assert _wire_bytes(res) < len(expected) / 4
    # Cache policy and security headers survive compression.
    assert ("immutable" in res.headers["cache-control"]) == path.endswith(".js")
    assert res.headers["x-content-type-options"] == "nosniff"


def test_spa_files_are_plain_without_accept_encoding(static_dir):
    client = TestClient(_spa_app(static_dir))
    res = client.get(f"/{ASSET}", headers={"Accept-Encoding": "identity"})
    assert res.status_code == 200
    assert "content-encoding" not in res.headers
    assert res.content == (static_dir / ASSET).read_bytes()


def test_raw_gzip_body_decompresses(static_dir):
    client = TestClient(_spa_app(static_dir))
    with client.stream("GET", f"/{ASSET}", headers=GZIP) as res:
        raw = b"".join(res.iter_raw())
    assert gzip.decompress(raw) == (static_dir / ASSET).read_bytes()


def test_gate_responses_still_work_and_gated_assets_compress(static_dir):
    client = TestClient(_spa_app(static_dir, gate=True))
    redirect = client.get("/", headers=GZIP, follow_redirects=False)
    assert redirect.status_code == 303
    assert redirect.headers["location"].startswith("/access")
    api = client.get("/api/v1/services", headers=GZIP)
    assert api.status_code == 401
    assert api.json() == {"detail": "Access code required."}
    form = client.get("/access", headers=GZIP)
    assert form.status_code == 200 and "<form" in form.text
    login = client.post("/access", data={"code": CODE, "next": "/"}, headers=GZIP, follow_redirects=False)
    assert login.status_code == 303
    res = client.get(f"/{ASSET}", headers=GZIP)
    assert res.status_code == 200
    assert res.headers["content-encoding"] == "gzip"
    assert res.content == (static_dir / ASSET).read_bytes()


def test_large_json_is_gzipped_and_small_json_is_not(client):
    services = client.get("/api/v1/services", headers=GZIP)
    assert services.status_code == 200
    assert services.headers["content-encoding"] == "gzip"
    assert services.json()["items"]
    health = client.get("/api/v1/health", headers=GZIP)
    assert health.status_code == 200
    assert "content-encoding" not in health.headers
    assert health.json()["status"] == "healthy"


def test_intake_works_with_gzip(client):
    res = client.post("/api/v1/intake/start", json={}, headers=GZIP)
    assert res.status_code == 200, res.text
    assert res.json()["state"]
    msg = client.post(
        "/api/v1/intake/message",
        json={"state": res.json()["state"], "message": "I need help with rent"},
        headers=GZIP,
    )
    assert msg.status_code == 200, msg.text
    assert msg.json()["response"]["content"]


def test_body_limit_still_counts_the_request_body(client):
    res = client.post(
        "/api/v1/intake/message",
        content=b"x" * (300 * 1024),
        headers={"content-type": "application/json", **GZIP},
    )
    assert res.status_code == 413
    assert "KiB" in res.json()["detail"]

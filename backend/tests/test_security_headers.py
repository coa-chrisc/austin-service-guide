"""Security headers on every response: API, SPA, access gate, errors.

The CSP must leave the app working: Vite assets and the service worker are
same-origin, MUI injects inline styles, the map loads tiles from the
build-time tile server, and realtime voice posts its SDP offer to
api.openai.com. FastAPI's own /docs pages load Swagger UI from a CDN, so
they are the only responses without a CSP.
"""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.access_gate import AccessGateMiddleware, load_gate_config

CODES = "alex:abcd-efgh-jkmn"
SECRET = "s" * 40


def _directives(csp: str) -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    for part in csp.split(";"):
        tokens = part.split()
        if tokens:
            out[tokens[0]] = tokens[1:]
    return out


def _assert_hardened(headers) -> None:
    assert headers["x-content-type-options"] == "nosniff"
    assert headers["x-frame-options"] == "DENY"
    assert headers["referrer-policy"] == "strict-origin-when-cross-origin"
    policy = headers["permissions-policy"]
    assert "microphone=(self)" in policy  # voice intake needs the mic
    assert "camera=()" in policy
    csp = _directives(headers["content-security-policy"])
    assert csp["frame-ancestors"] == ["'none'"]
    assert csp["default-src"] == ["'self'"]
    assert csp["script-src"] == ["'self'"]
    assert csp["object-src"] == ["'none'"]
    assert csp["base-uri"] == ["'self'"]
    assert csp["form-action"] == ["'self'"]
    assert "https://api.openai.com" in csp["connect-src"]  # realtime SDP offer
    assert "'unsafe-inline'" in csp["style-src"]  # MUI / emotion style tags
    assert "worker-src" in csp and "'self'" in csp["worker-src"]  # service worker


def test_api_responses_carry_security_headers(client):
    res = client.get("/api/v1/health")
    assert res.status_code == 200
    _assert_hardened(res.headers)


def test_error_responses_carry_security_headers(client):
    for res in (
        client.get("/api/v1/services/does-not-exist"),
        client.post("/api/v1/intake/message", json={}),
        client.post(
            "/api/v1/intake/message",
            content=b"x" * (300 * 1024),
            headers={"content-type": "application/json"},
        ),
    ):
        assert res.status_code in (404, 413, 422), res.status_code
        _assert_hardened(res.headers)


def test_hsts_only_over_https(client):
    assert "strict-transport-security" not in client.get("/api/v1/health").headers
    res = client.get("/api/v1/health", headers={"x-forwarded-proto": "https"})
    assert res.headers["strict-transport-security"].startswith("max-age=")
    assert "includeSubDomains" in res.headers["strict-transport-security"]


def test_docs_pages_skip_csp_but_keep_other_headers(client):
    res = client.get("/docs")
    assert res.status_code == 200
    assert "content-security-policy" not in res.headers
    assert res.headers["x-frame-options"] == "DENY"
    assert res.headers["x-content-type-options"] == "nosniff"


def _gated_spa_app(tmp_path) -> FastAPI:
    from app.security_headers import SecurityHeadersMiddleware
    from app.spa import mount_spa

    static = tmp_path / "static"
    (static / "assets").mkdir(parents=True)
    (static / "index.html").write_text("<html>INDEX</html>")
    (static / "sw.js").write_text("// sw")
    app = FastAPI()
    mount_spa(app, static)
    config = load_gate_config({"ACCESS_CODES": CODES, "ACCESS_GATE_SECRET": SECRET})
    app.add_middleware(AccessGateMiddleware, config=config, app_name="Test Guide")
    app.add_middleware(SecurityHeadersMiddleware)
    return app


def test_gate_form_spa_and_service_worker_are_hardened(tmp_path):
    client = TestClient(_gated_spa_app(tmp_path))
    # The access-code form must not be frameable (clickjacking).
    _assert_hardened(client.get("/access").headers)
    # Unauthenticated redirect and API 401 too.
    _assert_hardened(client.get("/", follow_redirects=False).headers)
    _assert_hardened(client.get("/api/v1/anything").headers)
    client.post("/access", data={"code": "abcd-efgh-jkmn", "next": "/"}, follow_redirects=False)
    for path in ("/", "/results", "/sw.js"):
        res = client.get(path)
        assert res.status_code == 200, path
        _assert_hardened(res.headers)


def test_existing_header_is_not_overridden():
    from app.security_headers import SecurityHeadersMiddleware
    from starlette.responses import PlainTextResponse

    app = FastAPI()

    @app.get("/framed")
    async def framed():
        return PlainTextResponse("ok", headers={"X-Frame-Options": "SAMEORIGIN"})

    app.add_middleware(SecurityHeadersMiddleware)
    res = TestClient(app).get("/framed")
    assert res.headers.get_list("x-frame-options") == ["SAMEORIGIN"]


@pytest.mark.parametrize(
    ("url", "expected"),
    [
        (None, "https://tile.openstreetmap.org"),
        ("", "https://tile.openstreetmap.org"),
        ("https://tiles.example.org/{z}/{x}/{y}.png", "https://tiles.example.org"),
        ("https://{s}.tile.example.com/{z}/{x}/{y}.png", "https://*.tile.example.com"),
        ("https://tiles.example.org:8443/{z}/{x}/{y}.png", "https://tiles.example.org:8443"),
        # Shapes a CSP source can't express exactly fall back to any https origin.
        ("https://a{s}.example.com/{z}/{x}/{y}.png", "https:"),
        ("http://tiles.example.org/{z}/{x}/{y}.png", "https:"),
        ("https://tiles.example.org;script-src *", "https:"),
    ],
)
def test_tile_source(url, expected):
    from app.security_headers import tile_source

    assert tile_source(url) == expected


def test_csp_allows_configured_tile_server(monkeypatch):
    from app.security_headers import build_csp

    monkeypatch.setenv("VITE_MAP_TILE_URL", "https://{s}.tiles.example.net/{z}/{x}/{y}.png")
    csp = _directives(build_csp())
    # <img> tiles, and the service worker's runtime cache fetches them.
    assert "https://*.tiles.example.net" in csp["img-src"]
    assert "https://*.tiles.example.net" in csp["connect-src"]
    assert "https://tile.openstreetmap.org" not in csp["img-src"]

    monkeypatch.delenv("VITE_MAP_TILE_URL")
    assert "https://tile.openstreetmap.org" in _directives(build_csp())["img-src"]

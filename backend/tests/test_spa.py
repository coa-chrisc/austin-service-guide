"""Tests for app.spa.mount_spa using a throwaway app and temp static dir."""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.spa import mount_spa


@pytest.fixture()
def client(tmp_path):
    static = tmp_path / "static"
    (static / "assets").mkdir(parents=True)
    (static / "index.html").write_text("<html>INDEX</html>")
    (static / "sw.js").write_text("// sw")
    (static / "manifest.webmanifest").write_text("{}")
    (static / "assets" / "app-abc123.js").write_text("console.log(1)")
    (tmp_path / "secret.txt").write_text("SECRET")  # outside static dir

    app = FastAPI()

    @app.get("/api/v1/ping")
    async def ping():
        return {"pong": True}

    mount_spa(app, static)
    return TestClient(app)


def test_root_and_client_routes_fall_back_to_index(client):
    for path in ("/", "/results", "/admin/x/y"):
        r = client.get(path)
        assert r.status_code == 200
        assert "INDEX" in r.text
        assert r.headers["cache-control"] == "no-cache"


def test_hashed_assets_are_immutable(client):
    r = client.get("/assets/app-abc123.js")
    assert r.status_code == 200
    assert "immutable" in r.headers["cache-control"]


def test_missing_asset_is_404_not_html(client):
    assert client.get("/assets/missing.js").status_code == 404


def test_sw_and_manifest_no_cache(client):
    assert client.get("/sw.js").headers["cache-control"] == "no-cache"
    assert client.get("/manifest.webmanifest").headers["cache-control"] == "no-cache"


def test_api_not_shadowed(client):
    assert client.get("/api/v1/ping").json() == {"pong": True}
    r = client.get("/api/v1/nope")
    assert r.status_code == 404
    assert "INDEX" not in r.text


@pytest.mark.parametrize(
    "path",
    ["/../secret.txt", "/%2e%2e/secret.txt", "/assets/../../secret.txt", "/..%2fsecret.txt", "/%2e%2e%2fsecret.txt"],
)
def test_traversal_blocked(client, path):
    r = client.get(path)
    assert "SECRET" not in r.text


def test_missing_index_raises(tmp_path):
    with pytest.raises(RuntimeError):
        mount_spa(FastAPI(), tmp_path)

"""Regression tests for catalog and admin endpoints."""

from __future__ import annotations


def test_search_edge_cases(client):
    assert client.get("/api/v1/services", params={"search": "%'\"<>(*"}).status_code == 200
    assert client.get("/api/v1/services/not-a-real-slug").status_code == 404


def test_radius_must_be_positive_and_finite(client):
    for radius in ["-5", "nan", "0"]:
        res = client.get("/api/v1/services", params={"zip_code": "78701", "radius": radius})
        assert res.status_code == 422, radius


def test_admin_service_writes_return_422_on_invalid_body(client, monkeypatch):
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "admin_api_token", "test-token")
    auth = {"X-Admin-Token": "test-token"}
    assert client.post("/api/v1/admin/services", json={}, headers=auth).status_code == 422
    res = client.patch("/api/v1/admin/services/svc-wic", json={"categories": 5}, headers=auth)
    assert res.status_code == 422
    assert client.patch("/api/v1/admin/services/nope", json={}, headers=auth).status_code == 404


def test_admin_writes_reject_non_http_website_url(client, monkeypatch):
    """website_url is rendered as a link, so javascript:/data: URLs would be stored XSS."""
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "admin_api_token", "test-token")
    auth = {"X-Admin-Token": "test-token"}
    url = "/api/v1/admin/services"
    base = {"id": "svc-test-url-scheme", "name": "URL Test", "slug": "url-test"}
    for bad in ("javascript:alert(document.cookie)", " JavaScript:alert(1)",
                "data:text/html,<script>alert(1)</script>", "//evil.example", "ftp://x.example"):
        assert client.post(url, json={**base, "website_url": bad}, headers=auth).status_code == 422, bad
        res = client.patch(f"{url}/svc-wic", json={"website_url": bad}, headers=auth)
        assert res.status_code == 422, bad
    assert client.get("/api/v1/services/svc-wic").json()["website_url"].startswith("https://")
    ok = client.post(url, json={**base, "website_url": "https://example.org/x"}, headers=auth)
    assert ok.status_code == 201
    empty = {**base, "id": "svc-test-url-empty", "slug": "url-empty", "website_url": ""}
    assert client.post(url, json=empty, headers=auth).status_code == 201
    for sid in ("svc-test-url-scheme", "svc-test-url-empty"):
        client.delete(f"{url}/{sid}", headers=auth)


def test_every_catalog_website_url_is_http():
    from app.services.catalog_loader import load_services

    for svc in load_services():
        assert svc.website_url == "" or svc.website_url.startswith(("https://", "http://")), svc.slug


def test_search_matches_whole_words_and_ignores_filler(client):
    names = lambda q: {  # noqa: E731
        s["name"]
        for s in client.get("/api/v1/services", params={"search": q, "page_size": 100}).json()["items"]
    }
    rent = names("rent help")
    assert "Austin Tenants' Council" in rent
    assert rent == names("rent")  # "help" is filler, not a match term
    assert "Any Baby Can" not in rent  # "parents" is not "rent"
    assert names("help")  # all-filler queries still search


def test_search_maps_everyday_words_to_categories(client):
    def items(q):
        return client.get("/api/v1/services", params={"search": q, "page_size": 100}).json()["items"]

    assert all("housing" in s["categories"] or "rent" in s["description"].lower() for s in items("rent"))
    assert any("housing" in s["categories"] for s in items("rent help"))
    assert any("healthcare" in s["categories"] for s in items("i need a doctor"))

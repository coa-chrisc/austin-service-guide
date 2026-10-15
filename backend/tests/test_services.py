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

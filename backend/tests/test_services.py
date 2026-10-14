"""Regression tests for catalog and admin endpoints."""

from __future__ import annotations


def test_search_edge_cases(client):
    assert client.get("/api/v1/services", params={"search": "%'\"<>(*"}).status_code == 200
    assert client.get("/api/v1/services/not-a-real-slug").status_code == 404


def test_radius_must_be_positive_and_finite(client):
    for radius in ["-5", "nan", "0"]:
        res = client.get("/api/v1/services", params={"zip_code": "78701", "radius": radius})
        assert res.status_code == 422, radius


def test_admin_service_writes_return_422_on_invalid_body(client):
    assert client.post("/api/v1/admin/services", json={}).status_code == 422
    res = client.patch("/api/v1/admin/services/svc-wic", json={"categories": 5})
    assert res.status_code == 422
    assert client.patch("/api/v1/admin/services/nope", json={}).status_code == 404

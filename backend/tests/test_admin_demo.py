"""Admin demo data and personas come from the data pack (admin_demo.yaml, personas.yaml)."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.services import data_pack, personas, seed_data


def _clear_caches() -> None:
    data_pack.data_dir.cache_clear()
    personas._load_personas.cache_clear()
    seed_data._demo.cache_clear()
    seed_data.get_demo_residents.cache_clear()
    seed_data.get_demo_staff.cache_clear()


@pytest.fixture(autouse=True)
def _fresh_caches():
    _clear_caches()
    yield
    _clear_caches()


@pytest.fixture
def empty_pack(tmp_path: Path, monkeypatch) -> Path:
    """A pack with only the required file: no admin_demo.yaml, no personas.yaml."""
    (tmp_path / "categories.yaml").write_text("[]\n")
    monkeypatch.setenv("CITY_DATA_DIR", str(tmp_path))
    _clear_caches()
    return tmp_path


def test_default_pack_analytics(client):
    overview = client.get("/api/v1/admin/analytics/overview").json()
    assert overview["total_sessions"] == 1247
    assert overview["total_residents"] == 27
    assert len(overview["daily_sessions"]) == 30
    assert [d["id"] for d in overview["council_districts"]] == ["1", "2", "3", "4"]
    assert overview["council_districts"][0]["zips"][0] == "78702"

    equity = client.get("/api/v1/admin/analytics/equity").json()
    assert equity["disparity_alerts"][0]["zip"] == "78702"
    assert len(client.get("/api/v1/admin/analytics/demand-map").json()) == 14
    assert client.get("/api/v1/admin/analytics/services").json()[0]["service_name"] == (
        "Central Texas Food Bank"
    )


def test_default_pack_tables(client):
    assert client.get("/api/v1/admin/partner-gaps").json()["totals"] == {
        "referrals": 172,
        "connections": 102,
        "gap": 70,
        "connection_rate": 0.593,
    }
    assert len(client.get("/api/v1/admin/eligibility-rules").json()) == 11
    assert len(client.get("/api/v1/admin/reports").json()) == 9
    assert client.get("/api/v1/admin/audit-log").json()["total"] == 8
    staff = client.get("/api/v1/admin/staff").json()
    assert len(staff) == 6
    assert all(m["email"].endswith("@example.gov") for m in staff)
    residents = client.get("/api/v1/admin/residents?page_size=100").json()
    assert residents["total"] == 27
    assert client.get("/api/v1/admin/residents/res-01").status_code == 200


def test_default_pack_personas(client):
    listed = client.get("/api/v1/intake/personas").json()["personas"]
    assert len(listed) == 8
    persona = personas.get_persona(listed[0]["id"])
    assert persona is not None
    assert persona.persona_note.startswith(personas._HYBRID_NOTE_PREFIX)
    res = client.post("/api/v1/intake/load-persona", json={"persona_id": listed[0]["id"]})
    assert res.status_code == 200


def test_pack_without_demo_files_still_serves(client, empty_pack):
    assert client.get("/api/v1/intake/personas").json() == {"personas": []}
    assert client.post("/api/v1/intake/load-persona", json={"persona_id": "x"}).status_code == 404

    overview = client.get("/api/v1/admin/analytics/overview")
    assert overview.status_code == 200
    body = overview.json()
    assert body["total_sessions"] == 0
    assert body["daily_sessions"] == []
    assert body["council_districts"] == []

    for path in (
        "analytics/demographics",
        "analytics/services",
        "analytics/languages",
        "analytics/equity",
        "analytics/demand-map",
        "eligibility-rules",
        "reports",
        "partner-gaps",
        "audit-log",
        "staff",
        "residents",
    ):
        assert client.get(f"/api/v1/admin/{path}").status_code == 200, path
    assert client.get("/api/v1/admin/partner-gaps").json()["totals"]["connection_rate"] == 0.0
    assert client.get("/api/v1/admin/residents/res-01").status_code == 404

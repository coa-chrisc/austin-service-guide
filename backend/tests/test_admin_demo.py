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
    assert len(client.get("/api/v1/admin/reports").json()) == 7
    assert client.get("/api/v1/admin/audit-log").json()["total"] == 8
    staff = client.get("/api/v1/admin/staff").json()
    assert len(staff) == 6
    assert all(m["email"].endswith("@example.gov") for m in staff)
    assert {m["role"] for m in staff} <= {"super_admin", "admin", "manager", "viewer"}
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


def test_default_pack_totals_agree(client):
    """Dashboard, Analytics, Demand Map, Languages and Equity show one story."""
    overview = client.get("/api/v1/admin/analytics/overview").json()
    total = overview["total_sessions"]
    assert sum(d["count"] for d in overview["daily_sessions"]) == total
    assert overview["monthly_trend"][-1]["sessions"] == total
    current = overview["monthly_trend"][-1]
    assert round(current["completed"] / total, 2) == overview["completion_rate"]

    demand = client.get("/api/v1/admin/analytics/demand-map").json()
    assert sum(p["sessions"] for p in demand) == total
    languages = client.get("/api/v1/admin/analytics/languages").json()
    assert sum(lang["session_count"] for lang in languages) == total
    assert sum(lang["completed"] for lang in languages) == current["completed"]
    for lang in languages:
        assert lang["percentage"] == round(100 * lang["session_count"] / total, 1)

    demographics = client.get("/api/v1/admin/analytics/demographics").json()
    for key in ("age_ranges", "household_sizes", "employment_statuses",
                "housing_situations", "insurance_statuses"):
        assert sum(b["count"] for b in demographics[key]) == total, key
    by_zip = {p["zip"]: p["sessions"] for p in demand}
    for bucket in demographics["zip_codes"]:
        assert bucket["count"] == by_zip[bucket["label"]]

    # Equity geographic rows: one per council district, then the rest.
    geo = client.get("/api/v1/admin/analytics/equity").json()["geographic"]
    districts = overview["council_districts"]
    assert [g["label"] for g in geo[: len(districts)]] == [d["label"] for d in districts]
    census = {p["zip"]: p["census_percentage"] for p in demand}
    for district, row in zip(districts, geo):
        sessions = sum(by_zip[z] for z in district["zips"])
        assert row["portal_percentage"] == round(100 * sessions / total, 1)
        assert row["census_percentage"] == district["census_percentage"]
        assert round(sum(census[z] for z in district["zips"]), 1) == district["census_percentage"]
        assert row["gap"] == round(row["portal_percentage"] - row["census_percentage"], 1)


def test_reports_and_audit_never_future_dated(client):
    from datetime import date, datetime

    today = date.today()
    reports = client.get("/api/v1/admin/reports").json()
    assert {r["id"] for r in reports} == {
        "monthly-summary", "unmet-need-partner-gaps", "language-access",
        "equity-zip-district", "crisis-summary", "service-demand-zip", "catalog-export",
    }
    for r in reports:
        if r["cadence"] == "on_demand":
            assert r["last_run"] == ""
            continue
        # Local wall time, no zone: the browser shows the scheduled hour as-is.
        assert not r["last_run"].endswith("Z")
        assert datetime.fromisoformat(r["last_run"]).date() < today
    for entry in client.get("/api/v1/admin/audit-log").json()["items"]:
        assert date.fromisoformat(entry["timestamp"][:10]) < today
        assert entry["resource_type"] not in {"resident", "session"}


def test_last_scheduled_run_is_before_today(monkeypatch):
    from datetime import date

    for today, weekly, monthly, quarterly in (
        (date(2026, 11, 15), date(2026, 11, 9), date(2026, 11, 1), date(2026, 10, 1)),
        (date(2026, 11, 1), date(2026, 10, 26), date(2026, 10, 1), date(2026, 10, 1)),
        (date(2026, 10, 1), date(2026, 9, 28), date(2026, 9, 1), date(2026, 7, 1)),
        (date(2026, 11, 16), date(2026, 11, 9), date(2026, 11, 1), date(2026, 10, 1)),
    ):
        monkeypatch.setattr(seed_data, "_TODAY", today)
        assert seed_data._last_scheduled_run("weekly") == weekly
        assert seed_data._last_scheduled_run("monthly") == monthly
        assert seed_data._last_scheduled_run("quarterly") == quarterly
        assert seed_data._last_scheduled_run("on_demand") is None

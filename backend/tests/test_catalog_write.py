"""Admin catalog writes cannot store a record the engine cannot use (issue #20 b).

Each test pins one bug from the issue: a category display name accepted as
a slug, a duplicate slug hijacking an existing service, PATCH changing the
id, and the 200-service matching cap. Every test reloads the catalog after
itself so in-memory writes do not leak into other tests.
"""

from __future__ import annotations

import pytest

from app.config import get_settings
from app.models import ResidentProfile, Service
from app.services import catalog
from app.services.hours import _parse_range
from app.services.matching import match_services

URL = "/api/v1/admin/services"
AUTH = {"X-Admin-Token": "test-token"}

LOCATION = {
    "name": "Main office",
    "address": "100 Test St",
    "city": "Austin",
    "state": "TX",
    "zip_code": "78744",
    "latitude": 30.2,
    "longitude": -97.75,
    "is_primary": True,
}


def new_service(**overrides) -> dict:
    body = {
        "name": "Write Path Test Pantry",
        "slug": "write-path-test-pantry",
        "provider_name": "Test Provider",
        "description": "Groceries for any household.",
        "eligibility_summary": "Open to all residents.",
        "categories": ["food"],
        "website_url": "https://example.org",
        "phone": "512-555-0100",
        "locations": [dict(LOCATION)],
    }
    body.update(overrides)
    return body


@pytest.fixture(autouse=True)
def _token_and_fresh_catalog(monkeypatch):
    monkeypatch.setattr(get_settings(), "admin_api_token", "test-token")
    catalog.load_seed_data()
    yield
    catalog.load_seed_data()


# ── Category display name where a slug is expected ──────────────────

def test_unknown_category_is_rejected(client):
    res = client.post(URL, json=new_service(categories=["Food Assistance"]), headers=AUTH)
    assert res.status_code == 422
    assert "Food Assistance" in str(res.json()["detail"])
    assert catalog.get_service_by_slug("write-path-test-pantry") is None


def test_category_slug_is_stored_and_matches(client):
    res = client.post(URL, json=new_service(), headers=AUTH)
    assert res.status_code == 201, res.json()
    assert res.json()["categories"] == ["food"]
    slugs = {m.service.slug for m in match_services(ResidentProfile(immediate_needs=["food"]))}
    # Matching is capped at 15, so look at the engine's verdict directly.
    from app.services.matching import explain_matches

    rows = {r["slug"]: r for r in explain_matches(ResidentProfile(immediate_needs=["food"]))}
    assert rows["write-path-test-pantry"]["outcome"] in ("matched", "over_cap")
    assert slugs  # the profile still matches food services


# ── Duplicate slug ──────────────────────────────────────────────────

def test_duplicate_slug_is_a_conflict(client):
    original = client.get("/api/v1/services/central-texas-food-bank").json()
    res = client.post(URL, json=new_service(slug="central-texas-food-bank"), headers=AUTH)
    assert res.status_code == 409
    after = client.get("/api/v1/services/central-texas-food-bank").json()
    assert after["id"] == original["id"] == "svc-ctfb"
    assert after["name"] == original["name"]


def test_duplicate_id_is_a_conflict(client):
    res = client.post(URL, json=new_service(id="svc-ctfb"), headers=AUTH)
    assert res.status_code == 409
    assert catalog.get_service_by_id("svc-ctfb").slug == "central-texas-food-bank"


def test_patch_to_another_services_slug_is_a_conflict(client):
    res = client.patch(f"{URL}/svc-wic", json={"slug": "central-texas-food-bank"}, headers=AUTH)
    assert res.status_code == 409
    assert catalog.get_service_by_slug("central-texas-food-bank").id == "svc-ctfb"


# ── PATCH can change the id ─────────────────────────────────────────

def test_patch_cannot_change_the_id(client):
    res = client.patch(f"{URL}/svc-wic", json={"id": "svc-ctfb"}, headers=AUTH)
    assert res.status_code == 422
    assert catalog.get_service_by_id("svc-wic").id == "svc-wic"
    assert catalog.get_service_by_id("svc-ctfb").slug == "central-texas-food-bank"


def test_patch_rejects_unknown_keys(client):
    res = client.patch(f"{URL}/svc-wic", json={"nmae": "typo"}, headers=AUTH)
    assert res.status_code == 422


# ── New records follow the pack conventions ─────────────────────────

def test_create_generates_pack_ids(client):
    res = client.post(URL, json=new_service(), headers=AUTH)
    assert res.status_code == 201, res.json()
    body = res.json()
    assert body["id"] == "svc-write-path-test-pantry"
    assert body["locations"][0]["id"] == "loc-write-path-test-pantry-1"
    assert body["locations"][0]["service_id"] == body["id"]


def test_zero_coordinates_are_rejected(client):
    loc = {**LOCATION, "latitude": 0, "longitude": 0}
    res = client.post(URL, json=new_service(locations=[loc]), headers=AUTH)
    assert res.status_code == 422


# ── Hours edit ──────────────────────────────────────────────────────

def test_hours_day_map_saves_and_parses(client):
    svc = catalog.get_service_by_id("svc-ctfb")
    locations = [loc.model_dump() for loc in svc.locations]
    locations[0]["hours"] = {"monday": "9:00 AM – 1:00 PM", "tuesday": "Closed", "sunday": "24 hours"}
    res = client.patch(f"{URL}/svc-ctfb", json={"locations": locations}, headers=AUTH)
    assert res.status_code == 200, res.json()
    stored = catalog.get_service_by_id("svc-ctfb").locations[0].hours
    assert stored["monday"] == "9:00 AM – 1:00 PM"
    assert _parse_range(stored["monday"]) is not None
    # A string where the day map belongs is still a 422, never a silent save.
    locations[0]["hours"] = "Mon-Fri 9-5"
    assert client.patch(f"{URL}/svc-ctfb", json={"locations": locations}, headers=AUTH).status_code == 422


# ── Soft delete replaces the record ─────────────────────────────────

def test_delete_does_not_mutate_the_loaded_record(client):
    from app.services.catalog_loader import load_services

    assert client.delete(f"{URL}/svc-wic", headers=AUTH).status_code == 200
    assert catalog.get_service_by_id("svc-wic").status == "inactive"
    loaded = next(s for s in load_services() if s.id == "svc-wic")
    assert loaded.status == "active"  # the pack copy is untouched, so reload restores it


# ── Matching cap ────────────────────────────────────────────────────

def test_matching_reads_past_the_first_200_services(monkeypatch):
    filler = [
        Service(id=f"svc-filler-{i}", name=f"Filler {i}", slug=f"filler-{i}",
                description="Legal clinic.", categories=["legal"])
        for i in range(250)
    ]
    target = Service(id="svc-late-pantry", name="Late Pantry", slug="late-pantry",
                     description="Groceries.", categories=["food"])
    filler[240] = target
    monkeypatch.setattr(catalog, "_services", {s.id: s for s in filler})
    monkeypatch.setattr(catalog, "_services_by_slug", {s.slug: s for s in filler})
    slugs = [m.service.slug for m in match_services(ResidentProfile(immediate_needs=["food"]))]
    assert slugs == ["late-pantry"]

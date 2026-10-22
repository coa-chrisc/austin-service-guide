"""Place data comes from the data pack, not from Python.

Most tests point CITY_DATA_DIR at a tiny pack for an imaginary town and check
that crisis lines, ZIP proximity and matching follow it. The last group checks
that the Austin reference pack's rule files only name real catalog services.
"""

from __future__ import annotations

import os
from pathlib import Path

import pytest
import yaml

from app.models import IntakeSession, ResidentProfile
from app.services import catalog, catalog_loader
from app.services.i18n import translate_service_description
from app.services.matching import (
    assess_risks,
    calculate_benefits,
    crisis_services,
    match_services,
)
from app.services.scenarios import crisis_response
from app.services.scripted import zip_buttons

LOCAL_LINE = "Riverbend Crisis Line"
LOCAL_PHONE = "555-010-0100"


def _write(path: Path, data) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(yaml.safe_dump(data, sort_keys=False), encoding="utf-8")


def _tiny_pack(root: Path) -> Path:
    _write(root / "categories.yaml", [{"id": "cat-food", "name": "Food", "slug": "food"}])
    _write(root / "life_events.yaml", [])
    _write(root / "crisis_resources.yaml", [
        {"name": "988 Suicide & Crisis Lifeline", "description": "National", "phone": "988",
         "crisis_topic": "mental_health"},
        {"name": LOCAL_LINE, "description": "Local mental health crisis line",
         "phone": LOCAL_PHONE, "crisis_topic": "mental_health"},
    ])
    _write(root / "zip_centroids.yaml", [
        {"zip": "00001", "latitude": 40.0, "longitude": -100.0, "featured": True},
        {"zip": "00002", "latitude": 45.0, "longitude": -110.0},
    ])
    _write(root / "services" / "riverbend-pantry.yaml", {
        "id": "svc-riverbend-pantry",
        "name": "Riverbend Pantry",
        "slug": "riverbend-pantry",
        "description": "Free groceries for anyone who needs food.",
        "cost_type": "free",
        "categories": ["food"],
        "locations": [{
            "id": "loc-rp", "service_id": "svc-riverbend-pantry", "name": "Main",
            "address": "1 River Rd", "city": "Riverbend", "state": "NE",
            "zip_code": "00001", "latitude": 40.01, "longitude": -100.01,
            "is_primary": True,
        }],
    })
    return root


def _use_pack(path: Path | None) -> None:
    """Point the process at ``path`` (None = the default pack) and reload."""
    if path is None:
        os.environ.pop("CITY_DATA_DIR", None)
    else:
        os.environ["CITY_DATA_DIR"] = str(path)
    catalog_loader.reload_all()
    catalog.load_seed_data()


@pytest.fixture
def tiny_pack(tmp_path):
    previous = os.environ.get("CITY_DATA_DIR")
    _use_pack(_tiny_pack(tmp_path / "pack"))
    try:
        yield
    finally:
        _use_pack(Path(previous) if previous else None)


def test_crisis_response_names_the_pack_local_line(tiny_pack):
    text = crisis_response(IntakeSession()).content
    assert f"**{LOCAL_LINE}** — **{LOCAL_PHONE}**" in text
    assert "Integral Care" not in text and "SAFE Alliance" not in text
    # National defaults stay, and the pack's tagged 988 entry is not repeated.
    assert text.count("Lifeline") == 1
    assert "1-800-799-7233" in text and "9-1-1" in text


def test_zip_proximity_uses_pack_centroids(tiny_pack):
    def near(zip_code: str) -> list[str]:
        items = catalog.get_all_services(zip_code=zip_code, radius=5, page_size=50)["items"]
        return [s.slug for s in items]

    assert near("00001") == ["riverbend-pantry"]
    assert near("00002") == []  # pack centroid is far from the pantry
    assert near("78701") == ["riverbend-pantry"]  # unknown here: not filtered
    assert zip_buttons() == ["00001", "Other"]


def test_matching_works_without_matching_rules(tiny_pack):
    assert crisis_services() == {}
    profile = ResidentProfile(
        immediate_needs=["food"],
        household_size=3,
        income_bracket="$0-$10,000",
        crisis_indicators=["suicidal_ideation", "domestic_violence"],
        has_chronic_conditions=True,
        zip_code="78741",
    )
    matches = match_services(profile)
    assert [m.service.slug for m in matches] == ["riverbend-pantry"]

    flags = {f.risk_type: f for f in assess_risks(profile)}
    assert flags["mental_health_crisis"].prevention_services == [
        "988 Suicide & Crisis Lifeline", f"{LOCAL_LINE} ({LOCAL_PHONE})",
    ]
    assert flags["domestic_violence"].prevention_services == [
        "National DV Hotline (1-800-799-7233)",
    ]
    assert flags["food_insecurity"].prevention_services == []
    # No high-heat ZIPs in this pack: a single factor is not a heat risk.
    assert "heat_vulnerable" not in flags

    benefits = calculate_benefits(profile, matches)
    assert benefits["breakdown"] == [{"service": "Riverbend Pantry", "monthly_value": 25.0}]
    assert translate_service_description("svc-riverbend-pantry", "es") is None


# ── The Austin reference pack's rules point at real catalog records ──

@pytest.fixture(scope="module")
def reference_catalog():
    catalog.load_seed_data()


def test_matching_rules_name_real_services(reference_catalog):
    rules = catalog_loader.load_matching_rules()
    slugs = [s for group in rules.crisis_services.values() for s in group]
    slugs += [e.service for group in rules.prevention_services.values() for e in group if e.service]
    slugs += [s for est in rules.benefit_estimates for s in est.services]
    assert slugs and rules.high_heat_zips
    missing = [s for s in slugs if catalog.get_service_by_slug(s) is None]
    assert not missing


def test_service_translations_name_real_services(reference_catalog):
    table = catalog_loader.load_service_translations()
    assert table
    assert not [s for s in table if catalog.get_service_by_slug(s) is None]
    svc = catalog.get_service_by_slug("integral-care")
    assert translate_service_description(svc.id, "es").startswith("La Autoridad Local")


def test_reference_pack_has_local_crisis_lines(reference_catalog):
    assert catalog_loader.local_crisis_lines("mental_health")
    assert catalog_loader.local_crisis_lines("domestic_violence")

"""Catalog schema + validator tests (use tmp dirs; never touch real data)."""

from __future__ import annotations

import copy
import importlib.util
import json
from pathlib import Path

import pytest
import yaml

SCRIPT = Path(__file__).resolve().parent.parent / "scripts" / "validate_catalog.py"
spec = importlib.util.spec_from_file_location("validate_catalog", SCRIPT)
vc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(vc)

SERVICE = {
    "id": "svc-a",
    "name": "Service A",
    "slug": "service-a",
    "provider_name": "Org A",
    "eligibility_summary": "Everyone.",
    "status": "active",
    "categories": ["healthcare"],
    "phone": "512-555-0100",
    "website_url": "https://example.org",
    "locations": [
        {
            "id": "loc-a",
            "service_id": "svc-a",
            "name": "Main",
            "address": "1 Main St",
            "city": "Austin",
            "state": "TX",
            "zip_code": "78701",
            "latitude": 30.27,
            "longitude": -97.74,
            "hours": {"monday": "9 AM - 5 PM"},
            "hours_verified": True,
        }
    ],
}


def make_catalog(tmp_path: Path, *services: dict) -> Path:
    (tmp_path / "services").mkdir()
    (tmp_path / "categories.yaml").write_text(
        yaml.safe_dump([{"id": "cat-healthcare", "name": "Healthcare", "slug": "healthcare"}])
    )
    for s in services:
        (tmp_path / "services" / f"{s['slug']}.yaml").write_text(yaml.safe_dump(s))
    return tmp_path


def variant(**changes) -> dict:
    s = copy.deepcopy(SERVICE)
    for k, v in changes.items():
        if v is None:
            s.pop(k, None)
        else:
            s[k] = v
    return s


def test_schema_is_valid_draft_2020_12():
    from jsonschema import Draft202012Validator

    Draft202012Validator.check_schema(json.loads(vc.SCHEMA_PATH.read_text()))


def test_real_catalog_passes_non_strict():
    result = vc.validate_catalog()
    assert result["errors"] == []
    assert result["services"] > 0


def test_valid_tmp_catalog(tmp_path):
    result = vc.validate_catalog(make_catalog(tmp_path, SERVICE))
    assert result["errors"] == []
    assert result["unverified"] == 1


def test_duplicate_id_fails(tmp_path):
    other = variant(slug="service-b", name="B")
    for loc in other["locations"]:
        loc["service_id"] = "svc-a"
    result = vc.validate_catalog(make_catalog(tmp_path, SERVICE, other))
    assert any("duplicate id" in e for e in result["errors"])


def test_unknown_category_fails(tmp_path):
    result = vc.validate_catalog(make_catalog(tmp_path, variant(categories=["nope"])))
    assert any("unknown category" in e for e in result["errors"])


def test_missing_eligibility_summary_fails(tmp_path):
    result = vc.validate_catalog(make_catalog(tmp_path, variant(eligibility_summary=None)))
    assert any("eligibility_summary" in e for e in result["errors"])


def test_location_service_id_mismatch_fails(tmp_path):
    s = variant()
    s["locations"][0]["service_id"] = "svc-other"
    result = vc.validate_catalog(make_catalog(tmp_path, s))
    assert any("does not match parent id" in e for e in result["errors"])


def test_missing_contact_phone_fails(tmp_path):
    s = variant(phone=None)
    s["locations"][0].pop("phone", None)
    result = vc.validate_catalog(make_catalog(tmp_path, s))
    assert any("no contact phone" in e for e in result["errors"])


def test_location_phone_satisfies_contact(tmp_path):
    s = variant(phone=None)
    s["locations"][0]["phone"] = "512-555-0101"
    assert vc.validate_catalog(make_catalog(tmp_path, s))["errors"] == []


def test_strict_fails_without_verification_fields(tmp_path):
    cat = make_catalog(tmp_path, SERVICE)
    assert vc.validate_catalog(cat, strict=False)["errors"] == []
    strict = vc.validate_catalog(cat, strict=True)
    assert any("unverified" in e for e in strict["errors"])
    assert vc.main(["--strict", "--data-dir", str(cat)]) == 1
    assert vc.main(["--data-dir", str(cat)]) == 0


def test_strict_passes_when_verified(tmp_path):
    s = variant(last_verified_date="2026-01-31", verified_by="Data steward")
    assert vc.validate_catalog(make_catalog(tmp_path, s), strict=True)["errors"] == []


def test_bad_verified_date_fails(tmp_path):
    s = variant(last_verified_date="not-a-date", verified_by="x")
    assert vc.validate_catalog(make_catalog(tmp_path, s))["errors"]

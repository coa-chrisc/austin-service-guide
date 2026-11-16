"""Data-pack contract: schemas in config/schemas/ and app/services/pack_validator.py.

One good pack built in code, then one mutation per rule that must produce
that rule's issue. Directory-mode tests use tmp dirs; nothing touches the
real data.
"""

from __future__ import annotations

import copy
import json
import os
import re
from datetime import date, timedelta
from pathlib import Path

import pytest
import yaml
from jsonschema import Draft202012Validator

from app.services import catalog, catalog_loader, pack_validator as pv
from app.services.data_pack import DEFAULT_DATA_DIR

BACKEND = Path(__file__).resolve().parents[1]
EXAMPLE = BACKEND / "tests" / "fixtures" / "packs" / "example-minimal"
YESTERDAY = (date.today() - timedelta(days=1)).isoformat()


def svc(slug: str, cats: list[str], n: int = 1) -> dict:
    return {
        "id": f"svc-{slug}",
        "slug": slug,
        "name": slug.title(),
        "provider_name": "Org",
        "description": "Plain text.",
        "eligibility_summary": "Everyone.",
        "status": "active",
        "categories": cats,
        "phone": "555-010-0100",
        "website_url": "https://example.org",
        "last_verified_date": YESTERDAY,
        "verified_by": "Data team",
        "locations": [{
            "id": f"loc-{slug}-{n}",
            "service_id": f"svc-{slug}",
            "name": "Main",
            "address": "1 Main St",
            "city": "Example Town",
            "state": "NE",
            "zip_code": "00001",
            "latitude": 40.0,
            "longitude": -100.0,
            "is_primary": True,
            "hours": {"monday": "9:00 AM – 5:00 PM", "sunday": "Closed", "friday": "24 hours"},
            "hours_verified": True,
        }],
    }


def good_pack() -> dict:
    return {
        "pack.yaml": {"schema_version": 1, "id": "test", "name": "Test", "bbox": [-101, 39, -99, 41]},
        "categories.yaml": [
            {"id": "cat-food", "name": "Food", "slug": "food"},
            {"id": "cat-housing", "name": "Housing", "slug": "housing"},
        ],
        "life_events.yaml": [{"id": "le-new-baby", "name": "New baby", "slug": "new_baby", "related_categories": ["food"]}],
        "crisis_resources.yaml": [{"name": "Line", "description": "Local", "phone": "555-010-0199", "crisis_topic": "mental_health"}],
        "zip_centroids.yaml": [{"zip": "00001", "latitude": 40.0, "longitude": -100.0, "featured": True}],
        "matching_rules.yaml": {
            "high_heat_zips": ["00001"],
            "crisis_services": {"domestic_violence": ["shelter"]},
            "prevention_services": {"food_insecurity": [{"service": "pantry"}, {"text": "Church meals"}]},
            "benefit_estimates": [{"services": ["pantry"], "label": "Groceries", "monthly_value": 100}],
        },
        "service_translations.yaml": {"pantry": {"es": {"description": "Comida gratis."}}},
        "personas.yaml": {"p-one": {
            "id": "p-one", "label": "One", "language": "en", "opening_message": "Hi", "persona_note": "Note",
            "seed_profile": {"immediate_needs": ["food"], "household_size": 2, "crisis_indicators": ["homelessness"]},
            "script": [{"role": "user", "content": "Hi", "delay_ms": 0}],
        }},
        "admin_demo.yaml": {"analytics": {"total_sessions": 1}, "eligibility_rules": []},
        "services/pantry.yaml": svc("pantry", ["food"]),
        "services/shelter.yaml": svc("shelter", ["housing"]),
    }


def codes(result: dict, severity: str) -> set[tuple[str, str]]:
    return {(i["code"], i["file"]) for i in result[severity + "s"]}


# ── Schemas and index ────────────────────────────────────────────────

def test_every_schema_is_valid_draft_2020_12():
    for entry in json.loads((pv.schema_dir() / "index.json").read_text())["files"]:
        Draft202012Validator.check_schema(json.loads((pv.schema_dir() / entry["schema"]).read_text()))


def test_index_names_every_file_the_backend_reads():
    read = set()
    for path in (BACKEND / "app" / "services").glob("*.py"):
        read |= set(re.findall(r'read_yaml\(\s*"([a-z_]+\.yaml)"', path.read_text()))
    listed = {e["path"] for e in pv.contract()["files"]}
    assert read and read <= listed, read - listed
    assert "services/<slug>.yaml" in listed
    services_entry = next(e for e in pv.contract()["files"] if e["path"].startswith("services/"))
    assert (pv.schema_dir() / services_entry["schema"]).resolve() == (BACKEND.parent / "config" / "services.schema.json")


def test_good_pack_is_clean():
    result = pv.validate_pack(good_pack())
    assert result["errors"] == [] and result["warnings"] == []
    assert result["unverified"] == 0
    assert result["counts"]["services"] == 2 and result["counts"]["personas"] == 1


def test_reference_pack_has_no_errors():
    result = pv.validate_pack(DEFAULT_DATA_DIR)
    assert result["errors"] == []
    assert result["counts"]["services"] == 87 and result["counts"]["gated"] == 32
    assert {i["code"] for i in result["warnings"]} <= {
        "unverified", "hours_unverified", "zip_not_covered", "category_unknown_to_engine",
    }


def test_example_pack_has_no_errors():
    result = pv.validate_pack(EXAMPLE)
    assert result["errors"] == []
    assert {i["code"] for i in result["warnings"]} == {"unverified"}


def test_app_boots_and_matches_on_the_example_pack():
    from fastapi.testclient import TestClient

    from app.main import app
    from app.models import ResidentProfile
    from app.services.matching import match_services

    previous = os.environ.get("CITY_DATA_DIR")
    os.environ["CITY_DATA_DIR"] = str(EXAMPLE)
    catalog_loader.reload_all()
    try:
        with TestClient(app) as client:
            listed = client.get("/api/v1/services", params={"page_size": 50}).json()
            assert sorted(s["slug"] for s in listed["items"]) == ["example-snap-help", "example-town-pantry"]
            assert [c["slug"] for c in client.get("/api/v1/categories").json()] == ["food"]
        matches = match_services(ResidentProfile(immediate_needs=["food"]))
        assert {m.service.slug for m in matches} == {"example-snap-help", "example-town-pantry"}
    finally:
        if previous is None:
            os.environ.pop("CITY_DATA_DIR", None)
        else:
            os.environ["CITY_DATA_DIR"] = previous
        catalog_loader.reload_all()
        catalog.load_seed_data()


# ── One fixture per rule ─────────────────────────────────────────────

def _set(p: dict, file: str, path: list, value) -> None:
    target = p[file]
    for key in path[:-1]:
        target = target[key]
    if value is _DEL:
        del target[path[-1]]
    else:
        target[path[-1]] = value


_DEL = object()
S = "services/pantry.yaml"
LOC = ["locations", 0]


def _many_services(p: dict) -> None:
    for i in range(200):
        p[f"services/extra-{i}.yaml"] = svc(f"extra-{i}", ["food"])


def _second_primary(p: dict) -> None:
    extra = copy.deepcopy(p[S]["locations"][0])
    extra["id"] = "loc-pantry-2"
    p[S]["locations"].append(extra)


def _dup_slug(p: dict) -> None:
    other = svc("pantry", ["food"], n=9)
    other["id"] = "svc-other"
    for loc in other["locations"]:
        loc["service_id"] = "svc-other"
    p["services/pantry-copy.yaml"] = other


CASES = [
    # (id, mutation, severity, code, file)
    ("missing summary", lambda p: _set(p, S, ["eligibility_summary"], _DEL), "error", "schema", S),
    ("unknown service key", lambda p: _set(p, S, ["eligibilty_summary"], "typo"), "error", "schema", S),
    ("language name not code", lambda p: _set(p, S, ["languages_offered"], ["English"]), "error", "schema", S),
    ("bad email", lambda p: _set(p, S, ["email"], "not-an-email"), "error", "schema", S),
    ("javascript url", lambda p: _set(p, S, ["website_url"], "javascript:alert(1)"), "error", "schema", S),
    ("source url not http", lambda p: _set(p, S, ["sources"], [{"url": "ftp://x"}]), "error", "schema", S),
    ("unknown gate", lambda p: _set(p, S, ["eligibility_requires"], ["income_limit"]), "error", "schema", S),
    ("no phone anywhere", lambda p: _set(p, S, ["phone"], _DEL), "error", "schema", S),
    ("duplicate id", lambda p: _set(p, "services/shelter.yaml", ["id"], "svc-pantry"), "error", "duplicate_id", "services/shelter.yaml"),
    ("duplicate slug", _dup_slug, "error", "duplicate_slug", "services/pantry-copy.yaml"),
    ("slug vs file name", lambda p: p.update({"services/other.yaml": p.pop("services/shelter.yaml")}), "error", "slug_file_mismatch", "services/other.yaml"),
    ("location service_id", lambda p: _set(p, S, [*LOC, "service_id"], "svc-x"), "error", "location_service_id", S),
    ("location id reused", lambda p: _set(p, "services/shelter.yaml", [*LOC, "id"], "loc-pantry-1"), "error", "duplicate_location_id", "services/shelter.yaml"),
    ("unknown category", lambda p: _set(p, S, ["categories"], ["groceries"]), "error", "unknown_category", S),
    ("life event category", lambda p: _set(p, "life_events.yaml", [0, "related_categories"], ["nope"]), "error", "unknown_category", "life_events.yaml"),
    ("rules crisis slug", lambda p: _set(p, "matching_rules.yaml", ["crisis_services", "immediate_danger"], ["gone"]), "error", "unknown_service_slug", "matching_rules.yaml"),
    ("rules prevention slug", lambda p: _set(p, "matching_rules.yaml", ["prevention_services", "uninsured"], [{"service": "gone"}]), "error", "unknown_service_slug", "matching_rules.yaml"),
    ("rules estimate slug", lambda p: _set(p, "matching_rules.yaml", ["benefit_estimates", 0, "services"], ["gone"]), "error", "unknown_service_slug", "matching_rules.yaml"),
    ("translation slug", lambda p: _set(p, "service_translations.yaml", ["gone"], {"es": {"description": "x"}}), "error", "unknown_service_slug", "service_translations.yaml"),
    ("indicator typo", lambda p: _set(p, "matching_rules.yaml", ["crisis_services", "suicide"], ["pantry"]), "error", "schema", "matching_rules.yaml"),
    ("risk type typo", lambda p: _set(p, "matching_rules.yaml", ["prevention_services", "hunger"], []), "error", "schema", "matching_rules.yaml"),
    ("prevention both keys", lambda p: _set(p, "matching_rules.yaml", ["prevention_services", "food_insecurity", 0, "text"], "x"), "error", "schema", "matching_rules.yaml"),
    ("unread rules key", lambda p: _set(p, "matching_rules.yaml", ["need_keywords"], {"groceries": ["food"]}), "error", "schema", "matching_rules.yaml"),
    ("estimate out of range", lambda p: _set(p, "matching_rules.yaml", ["benefit_estimates", 0, "monthly_value"], 9999), "error", "schema", "matching_rules.yaml"),
    ("crisis service inactive", lambda p: _set(p, "services/shelter.yaml", ["status"], "inactive"), "error", "crisis_service_not_active", "matching_rules.yaml"),
    ("two primary locations", _second_primary, "error", "primary_location", S),
    ("no primary location", lambda p: _set(p, S, [*LOC, "is_primary"], False), "warning", "primary_location", S),
    ("hours shorthand", lambda p: _set(p, S, [*LOC, "hours", "monday"], "M-F 9-5"), "warning", "hours_unparseable", S),
    ("hours two ranges", lambda p: _set(p, S, [*LOC, "hours", "monday"], "8 AM – 12 PM, 1 PM – 5 PM"), "warning", "hours_unparseable", S),
    ("hours 24/7", lambda p: _set(p, S, [*LOC, "hours", "monday"], "24/7"), "warning", "hours_unparseable", S),
    ("zero coordinates", lambda p: _set(p, S, [*LOC, "longitude"], 0), "error", "zero_coordinates", S),
    ("outside bbox", lambda p: _set(p, S, [*LOC, "latitude"], 45.0), "warning", "outside_bbox", S),
    ("bbox order", lambda p: _set(p, "pack.yaml", ["bbox"], [-99, 39, -101, 41]), "error", "bbox_order", "pack.yaml"),
    ("zip not covered", lambda p: _set(p, S, [*LOC, "zip_code"], "00009"), "warning", "zip_not_covered", "zip_centroids.yaml"),
    ("too many categories", lambda p: (p["categories.yaml"].extend({"id": f"cat-{c}", "name": c, "slug": c} for c in ("legal", "senior", "veterans", "utilities")), _set(p, S, ["categories"], ["food", "housing", "legal", "senior", "veterans", "utilities"])), "warning", "too_many_categories", S),
    ("over the match cap", _many_services, "error", "match_cap", "services/"),
    ("verified in future", lambda p: _set(p, S, ["last_verified_date"], (date.today() + timedelta(days=3)).isoformat()), "error", "date_in_future", S),
    ("html in description", lambda p: _set(p, S, ["description"], "Call <a href='x'>here</a>"), "warning", "markup_in_text", S),
    ("markdown link", lambda p: _set(p, S, ["how_to_apply"], "Apply [online](https://evil.example)"), "warning", "markup_in_text", S),
    ("unverified", lambda p: _set(p, S, ["verified_by"], _DEL), "warning", "unverified", S),
    ("category unknown to engine", lambda p: p["categories.yaml"].append({"id": "cat-x", "name": "X", "slug": "maternal_health"}), "warning", "category_unknown_to_engine", "categories.yaml"),
    ("category slug hyphen", lambda p: _set(p, "categories.yaml", [0, "slug"], "food-help"), "error", "schema", "categories.yaml"),
    ("duplicate category slug", lambda p: _set(p, "categories.yaml", [1, "slug"], "food"), "error", "duplicate_slug", "categories.yaml"),
    ("duplicate zip", lambda p: p["zip_centroids.yaml"].append({"zip": "00001", "latitude": 1, "longitude": 1}), "error", "duplicate_zip", "zip_centroids.yaml"),
    ("unquoted zip", lambda p: _set(p, "zip_centroids.yaml", [0, "zip"], 1), "error", "schema", "zip_centroids.yaml"),
    ("persona key vs id", lambda p: _set(p, "personas.yaml", ["p-one", "id"], "p-two"), "error", "persona_id_mismatch", "personas.yaml"),
    ("persona profile typo", lambda p: _set(p, "personas.yaml", ["p-one", "seed_profile", "veteran"], True), "error", "schema", "personas.yaml"),
    ("crisis topic typo", lambda p: _set(p, "crisis_resources.yaml", [0, "crisis_topic"], "suicide"), "error", "schema", "crisis_resources.yaml"),
    ("pack version", lambda p: _set(p, "pack.yaml", ["schema_version"], 2), "error", "schema", "pack.yaml"),
    ("required file missing", lambda p: p.pop("crisis_resources.yaml"), "error", "missing_file", "crisis_resources.yaml"),
]


@pytest.mark.parametrize("mutate,severity,code,file", [c[1:] for c in CASES], ids=[c[0] for c in CASES])
def test_rule(mutate, severity, code, file):
    pack = good_pack()
    mutate(pack)
    result = pv.validate_pack(pack)
    assert (code, file) in codes(result, severity), result[severity + "s"]
    if severity == "warning":
        assert result["errors"] == []


def test_city_config_category_colors():
    result = pv.validate_pack(good_pack(), city_config={"serviceGuide": {"categoryColors": {"food": "#000000", "nope": "#000000"}}})
    assert [(i["code"], i["path"]) for i in result["errors"]] == [("unknown_category", "serviceGuide/categoryColors/nope")]


def test_optional_files_may_be_absent():
    pack = good_pack()
    for name in ("pack.yaml", "zip_centroids.yaml", "matching_rules.yaml", "service_translations.yaml", "personas.yaml", "admin_demo.yaml"):
        pack.pop(name)
    pack.pop("services/shelter.yaml")
    assert pv.validate_pack(pack)["errors"] == []


def test_strict_promotes_unverified():
    pack = good_pack()
    del pack[S]["verified_by"]
    assert pv.validate_pack(pack)["errors"] == []
    assert [i["code"] for i in pv.validate_pack(pack, strict=True)["errors"]] == ["unverified"]


def test_loader_check_backs_up_the_schema(monkeypatch):
    """A record the schema lets through but the loader refuses is an error."""
    entry = next(e for e in pv.contract()["files"] if e["path"].startswith("services/"))
    monkeypatch.setitem(entry, "validator", Draft202012Validator({}))
    pack = good_pack()
    pack[S]["cost_type"] = "priceless"
    result = pv.validate_pack(pack)
    assert ("loader_rejects", S) in codes(result, "error")


def test_schema_and_loader_agree_on_unread_rule_keys():
    """need_keywords is rejected by both (MatchingRules is extra="forbid")."""
    with pytest.raises(Exception):
        catalog_loader.MatchingRules.model_validate({"need_keywords": {}})


# ── Directory mode and CLI ───────────────────────────────────────────

def write_pack(root: Path, pack: dict) -> Path:
    for name, data in pack.items():
        path = root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(yaml.safe_dump(data, sort_keys=False, allow_unicode=True), encoding="utf-8")
    return root


def test_directory_matches_in_memory(tmp_path):
    result = pv.validate_pack(write_pack(tmp_path, good_pack()))
    assert result["errors"] == [] and result["warnings"] == []
    assert result["counts"] == pv.validate_pack(good_pack())["counts"]


def test_directory_problems(tmp_path):
    root = write_pack(tmp_path, good_pack())
    (root / "life_events.yaml").write_text("")  # the loader reads an empty file as []
    (root / "zip_centroids.yaml").write_text("- zip: [unclosed\n")
    (root / "services" / "notes.yml").write_text("id: x\n")
    (root / "extra.yaml").write_text("a: 1\n")
    (root / "services" / "blank.yaml").write_text("")
    result = pv.validate_pack(root)
    assert codes(result, "error") == {("yaml", "zip_centroids.yaml"), ("schema", "services/blank.yaml")}
    assert {("ignored_file", "services/notes.yml"), ("ignored_file", "extra.yaml")} <= codes(result, "warning")


def test_missing_directory(tmp_path):
    result = pv.validate_pack(tmp_path / "nope")
    assert [i["code"] for i in result["errors"]] == ["missing_file"]


def test_unquoted_dates_are_accepted(tmp_path):
    root = write_pack(tmp_path, good_pack())
    path = root / "services" / "pantry.yaml"
    path.write_text(path.read_text().replace(f"'{YESTERDAY}'", YESTERDAY))
    assert isinstance(yaml.safe_load(path.read_text())["last_verified_date"], date)
    assert pv.validate_pack(root)["errors"] == []


def test_cli_exit_codes_and_json(tmp_path, capsys):
    good = write_pack(tmp_path / "good", good_pack())
    assert pv.main(["--data-dir", str(good)]) == 0
    assert "0 errors" in capsys.readouterr().out

    bad_pack = good_pack()
    bad_pack[S]["categories"] = ["groceries"]
    bad = write_pack(tmp_path / "bad", bad_pack)
    assert pv.main(["--json", "--data-dir", str(bad)]) == 1
    out = json.loads(capsys.readouterr().out)
    assert out["errors"][0] == {
        "file": S, "path": "categories/0", "code": "unknown_category",
        "message": "unknown category 'groceries' (not a slug in categories.yaml)", "severity": "error",
    }


def test_cli_city_config_relative_to_config_dir(capsys):
    assert pv.main(["--data-dir", str(DEFAULT_DATA_DIR), "--city-config", "presets/austin-travis-tx.json"]) == 0
    assert pv.main(["--data-dir", str(DEFAULT_DATA_DIR), "--city-config", "presets/nope.json"]) == 1
    assert "not found" in capsys.readouterr().err

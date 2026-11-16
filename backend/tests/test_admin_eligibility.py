"""Admin eligibility API (issue #20 a): the console shows the rules the
engine actually evaluates, and the profile tester returns the same verdict
as resident matching. Every test that writes reloads the pack afterwards."""

from __future__ import annotations

import io
import zipfile

import pytest
import yaml

from app.config import get_settings
from app.models import EligibilityGate, ResidentProfile
from app.services import catalog, catalog_loader
from app.services.eligibility import describe_gates
from app.services.matching import match_services
from app.services.pack_validator import validate_pack

BASE = "/api/v1/admin"
AUTH = {"X-Admin-Token": "test-token"}
_MATCHED = {"crisis_direct", "matched", "check_eligibility"}


@pytest.fixture
def token():
    settings = get_settings()
    old = settings.admin_api_token
    settings.admin_api_token = "test-token"
    yield
    settings.admin_api_token = old


@pytest.fixture
def reload_pack():
    yield
    catalog_loader.reload_all()
    catalog.load_seed_data()


def test_payload_lists_every_gate_and_the_gated_austin_services(client):
    body = client.get(f"{BASE}/eligibility").json()
    assert body["edit_mode"] == "in_memory"
    assert {g["id"] for g in body["gates"]} == set(EligibilityGate.__args__)
    gated = {s["slug"] for s in body["services"] if s["eligibility_requires"]}
    assert len(gated) == sum(1 for s in catalog.all_services() if s.eligibility_requires)
    assert len(gated) == 32
    for gate in body["gates"]:
        for slug in gate["services"]:
            svc = catalog.get_service_by_slug(slug)
            assert gate["id"] in svc.eligibility_requires
    assert body["rules_edited"] is False
    assert body["unresolved_slugs"] == []
    assert body["engine"]["source"] == "backend/app/services/matching.py"
    assert body["personas"], "the Austin pack ships personas"
    # Restrictive wording is only flagged on ungated services, never acted on.
    assert all(not s["restrictive_words"] for s in body["services"] if s["eligibility_requires"])


def test_describe_gates_covers_every_gate_with_plain_text():
    gates = describe_gates()
    assert [g["id"] for g in gates] == list(EligibilityGate.__args__)
    for g in gates:
        assert g["label"] and g["satisfied_when"] and g["contradicted_when"]


def test_tester_matches_resident_matching_for_every_persona(client):
    personas = client.get(f"{BASE}/eligibility").json()["personas"]
    for persona in personas:
        resp = client.post(f"{BASE}/eligibility/evaluate", json={"profile": persona["profile"]})
        assert resp.status_code == 200, (persona["id"], resp.text)
        rows = resp.json()["outcomes"]
        tester = [r["slug"] for r in rows if r["outcome"] in _MATCHED]
        engine = [m.service.slug for m in match_services(ResidentProfile.model_validate(persona["profile"]))]
        assert tester == engine, persona["id"]
        assert len(rows) == len(catalog.iter_active_services())


def test_overrides_preview_without_mutating_the_catalog(client):
    before = list(catalog.get_service_by_slug("central-texas-food-bank").eligibility_requires)
    profile = {"immediate_needs": ["food"], "zip_code": "78744", "veteran_status": False}
    plain = client.post(f"{BASE}/eligibility/evaluate", json={"profile": profile}).json()
    gated = client.post(f"{BASE}/eligibility/evaluate", json={
        "profile": profile,
        "overrides": {"services": {"central-texas-food-bank": {"eligibility_requires": ["veteran"]}}},
    }).json()

    def outcome(body):
        return next(r["outcome"] for r in body["outcomes"] if r["slug"] == "central-texas-food-bank")

    assert outcome(plain) in _MATCHED
    assert outcome(gated) == "excluded_by_gate"
    assert catalog.get_service_by_slug("central-texas-food-bank").eligibility_requires == before


def test_unknown_override_slug_and_unknown_profile_key_are_422(client):
    resp = client.post(f"{BASE}/eligibility/evaluate", json={
        "profile": {}, "overrides": {"services": {"no-such-service": {"eligibility_requires": []}}},
    })
    assert resp.status_code == 422
    assert resp.json()["detail"][0]["type"] == "unknown_service_slug"
    resp = client.post(f"{BASE}/eligibility/evaluate", json={"profile": {"ssn": "123"}})
    assert resp.status_code == 422
    resp = client.post(f"{BASE}/eligibility/evaluate", json={
        "profile": {}, "overrides": {"services": {"central-texas-food-bank": {"eligibility_requires": ["rich"]}}},
    })
    assert resp.status_code == 422


def test_impact_reports_lost_services_per_persona(client):
    personas = client.get(f"{BASE}/eligibility").json()["personas"]
    target = None
    for persona in personas:
        rows = client.post(f"{BASE}/eligibility/evaluate", json={"profile": persona["profile"]}).json()["outcomes"]
        hit = next((r for r in rows if r["outcome"] == "matched" and r["gates"] == []), None)
        if hit:
            target = (persona["id"], hit["slug"])
            break
    assert target, "some persona matches an ungated service"
    pid, slug = target
    profile = next(p["profile"] for p in personas if p["id"] == pid)

    def outcome_with(gate: str) -> str:
        rows = client.post(f"{BASE}/eligibility/evaluate", json={
            "profile": profile, "overrides": {"services": {slug: {"eligibility_requires": [gate]}}},
        }).json()["outcomes"]
        return next(r["outcome"] for r in rows if r["slug"] == slug)

    # A gate this persona's profile does not confirm, so the outcome moves.
    gate = next(g for g in ("veteran", "youth", "older_adult", "refugee_or_immigrant")
                if outcome_with(g) != "matched")
    body = client.post(f"{BASE}/eligibility/impact", json={
        "overrides": {"services": {slug: {"eligibility_requires": [gate]}}},
    }).json()
    row = next(p for p in body["personas"] if p["persona_id"] == pid)
    moved = [x["slug"] for x in row["lost"]] + [x["slug"] for x in row["changed"]]
    assert slug in moved


def test_put_matching_rules_needs_token_and_validates_slugs(client, token, reload_pack):
    rules = client.get(f"{BASE}/eligibility").json()["matching_rules"]
    assert client.put(f"{BASE}/matching-rules", json=rules).status_code == 403

    bad = {**rules, "high_heat_zips": ["78744"], "crisis_services": {"suicidal_ideation": ["no-such-service"]}}
    resp = client.put(f"{BASE}/matching-rules", json=bad, headers=AUTH)
    assert resp.status_code == 422, resp.text
    assert catalog_loader.load_matching_rules() == catalog_loader.load_pack_matching_rules()

    resp = client.put(f"{BASE}/matching-rules", json={**rules, "unknown": 1}, headers=AUTH)
    assert resp.status_code == 422

    edited = {**rules, "high_heat_zips": sorted({*rules.get("high_heat_zips", []), "78799"})}
    resp = client.put(f"{BASE}/matching-rules", json=edited, headers=AUTH)
    assert resp.status_code == 200, resp.text
    assert "78799" in catalog_loader.load_matching_rules().high_heat_zips
    assert client.get(f"{BASE}/eligibility").json()["rules_edited"] is True


def test_export_only_mode_refuses_writes_but_exports(client, token, reload_pack, monkeypatch):
    monkeypatch.setenv("ADMIN_EDIT_MODE", "export_only")
    rules = client.get(f"{BASE}/eligibility").json()["matching_rules"]
    assert client.put(f"{BASE}/matching-rules", json=rules, headers=AUTH).status_code == 409
    resp = client.patch(f"{BASE}/services/svc-wic", json={"eligibility_requires": []}, headers=AUTH)
    assert resp.status_code == 409
    resp = client.post(f"{BASE}/pack/export", headers=AUTH, json={
        "overrides": {"services": {"central-texas-food-bank": {"eligibility_requires": ["veteran"]}}},
    })
    assert resp.status_code == 200
    names = zipfile.ZipFile(io.BytesIO(resp.content)).namelist()
    assert "pack/services/central-texas-food-bank.yaml" in names
    assert catalog.get_service_by_slug("central-texas-food-bank").eligibility_requires == []


def _unzip(content: bytes) -> dict:
    files: dict = {}
    with zipfile.ZipFile(io.BytesIO(content)) as zf:
        for name in zf.namelist():
            rel = name.removeprefix("pack/")
            if rel.endswith(".yaml"):
                files[rel] = yaml.safe_load(zf.read(name))
    return files


def test_full_export_after_an_edit_passes_the_pack_validator(client, token, reload_pack):
    resp = client.patch(f"{BASE}/services/svc-wic", json={"eligibility_requires": ["has_children"]},
                        headers=AUTH)
    assert resp.status_code == 200, resp.text
    resp = client.get(f"{BASE}/pack/export", headers=AUTH)
    assert resp.status_code == 200
    assert resp.headers["content-disposition"].startswith("attachment")
    files = _unzip(resp.content)
    assert files["services/austin-public-health-wic.yaml"]["eligibility_requires"] == ["has_children"]
    assert validate_pack(files)["errors"] == []

    changed = _unzip(client.get(f"{BASE}/pack/export?changed_only=true", headers=AUTH).content)
    assert set(changed) == {"services/austin-public-health-wic.yaml"}


def test_export_needs_the_token(client, token):
    assert client.get(f"{BASE}/pack/export").status_code == 403


def test_pack_schemas_lists_the_contract(client):
    body = client.get(f"{BASE}/pack/schemas").json()
    assert any(f["path"] == "matching_rules.yaml" for f in body["files"])
    assert all(f["schema"] in body["schemas"] for f in body["files"])


def test_admin_bodies_are_size_limited(client, token):
    huge = {"profile": {"immediate_needs": ["x" * 300_000]}}
    assert client.post(f"{BASE}/eligibility/evaluate", json=huge).status_code == 413



def test_token_free_preview_rejects_oversized_rule_overrides(client):
    # evaluate needs no token; a huge crisis_services list must be refused, not run.
    slugs = [f"s{i}" for i in range(3000)]
    resp = client.post(f"{BASE}/eligibility/evaluate", json={
        "profile": {"crisis_indicators": ["immediate_danger"]},
        "overrides": {"matching_rules": {"crisis_services": {"immediate_danger": slugs}}},
    })
    assert resp.status_code == 422


def test_token_free_preview_counts_nested_benefit_services(client):
    resp = client.post(f"{BASE}/eligibility/evaluate", json={
        "profile": {},
        "overrides": {"matching_rules": {"benefit_estimates": [
            {"services": [f"s{i}" for i in range(3000)], "label": "x", "monthly_value": 1}
        ]}},
    })
    assert resp.status_code == 422

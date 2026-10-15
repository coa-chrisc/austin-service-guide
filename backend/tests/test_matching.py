"""Regression tests for eligibility gates and application-plan ordering."""

from __future__ import annotations

from typing import get_args

import pytest
import yaml
from pydantic import ValidationError

from app.models import EligibilityGate, ResidentProfile, Service
from app.services import catalog
from app.services.catalog_loader import SERVICES_DIR
from app.services.eligibility import _GATES
from app.services.matching import (
    _CRISIS_SERVICES,
    _SEQUENCE_REASONS,
    _matching_categories,
    match_services,
    recommend_application_order,
)

SAFETY_REASON = _SEQUENCE_REASONS["emergency"]


@pytest.fixture(scope="module", autouse=True)
def _seed_catalog():
    catalog.load_seed_data()


def _profile(**overrides) -> ResidentProfile:
    """The low-income renting family from the bad-match report."""
    base = dict(
        household_size=3,
        zip_code="78744",
        housing_situation="renting",
        employment_status="unemployed",
        income_bracket="$10,000-$20,000",
        insurance_status="uninsured",
        has_children=True,
        veteran_status=False,
        has_disability=False,
        immediate_needs=["housing", "food", "employment", "healthcare"],
        is_refugee_or_immigrant=False,
    )
    base.update(overrides)
    return ResidentProfile(**base)


def _gated(gate: str) -> set[str]:
    return {
        s.slug
        for s in catalog.get_all_services(page=1, page_size=500)["items"]
        if gate in s.eligibility_requires
    }


def test_renting_family_gets_no_gated_mismatches():
    matches = match_services(_profile())
    slugs = {m.service.slug for m in matches}

    for gate in ("veteran", "homeless_or_unstable_housing", "refugee_or_immigrant"):
        assert not slugs & _gated(gate), gate
    for slug in (
        "american-gi-forum",
        "sunrise-homeless-navigation-center",
        "echo-coordinated-entry",
        "refugee-services-of-texas-austin",
    ):
        assert slug not in slugs
    assert {"caritas-of-austin", "austin-public-health-wic"} <= slugs


def test_renting_family_plan_does_not_open_with_emergency():
    profile = _profile()
    matches = match_services(profile)
    plan = recommend_application_order(matches, profile)

    assert plan[0]["category"] != "emergency"
    assert plan[0]["reason"] != SAFETY_REASON
    assert all(item["reason"] != SAFETY_REASON for item in plan)

    target = _matching_categories(profile)
    by_id = {m.service.id: m.service for m in matches}
    for item in plan:
        if item["category"] in _SEQUENCE_REASONS:
            assert item["category"] in set(by_id[item["service_id"]].categories) & target
            assert item["reason"] == _SEQUENCE_REASONS[item["category"]]


def test_renting_family_plan_opens_with_one_service_per_need():
    profile = _profile()
    plan = recommend_application_order(match_services(profile), profile)
    opening = [item["category"] for item in plan[:4]]
    assert opening == ["food", "housing", "healthcare", "employment"]


def test_match_reasoning_is_deterministic_and_priority_ordered():
    first = [m.match_reasoning for m in match_services(_profile())]
    assert first == [m.match_reasoning for m in match_services(_profile())]
    caritas = next(m for m in match_services(_profile()) if m.service.slug == "caritas-of-austin")
    assert "Matches needs: food, housing, employment" in caritas.match_reasoning


def test_narrow_restriction_surfaces_summary_as_eligibility_check():
    profile = _profile(immediate_needs=["childcare"], insurance_status="employer")
    jeremiah = next(m for m in match_services(profile) if m.service.slug == "jeremiah-program-austin")
    assert jeremiah.match_confidence == "low"
    assert "Check eligibility: Single mothers" in jeremiah.match_reasoning
    # Known-childless residents never see it.
    childless = _profile(has_children=False, immediate_needs=["childcare"])
    assert "jeremiah-program-austin" not in {m.service.slug for m in match_services(childless)}


def test_veteran_profile_matches_veterans_service():
    profile = _profile(veteran_status=True, immediate_needs=["employment"])
    slugs = {m.service.slug for m in match_services(profile)}
    assert "american-gi-forum" in slugs


def test_homeless_profile_matches_shelter_and_leads_with_safety():
    profile = _profile(housing_situation="homeless", immediate_needs=["housing", "food"])
    matches = match_services(profile)
    assert "sunrise-homeless-navigation-center" in {m.service.slug for m in matches}

    plan = recommend_application_order(matches, profile)
    assert plan[0]["category"] in ("emergency", "housing")


def test_unknown_veteran_status_keeps_gated_service_low_and_last():
    # Narrow the needs so the 15-match cap leaves room for gated services.
    profile = _profile(
        veteran_status=None,
        has_children=False,
        insurance_status="employer",
        immediate_needs=["employment"],
    )
    matches = match_services(profile)
    veteran_only = _gated("veteran")

    gated_idx = [i for i, m in enumerate(matches) if m.service.slug in veteran_only]
    fit_idx = [i for i, m in enumerate(matches) if not m.service.eligibility_requires]
    assert gated_idx and fit_idx
    assert min(gated_idx) > max(fit_idx)
    for i in gated_idx:
        assert matches[i].match_confidence == "low"
        assert "Check eligibility" in matches[i].match_reasoning

    plan = recommend_application_order(matches, profile)
    plan_slugs = [item["service_slug"] for item in plan]
    first_gated = min(plan_slugs.index(s) for s in veteran_only if s in plan_slugs)
    assert all(s not in veteran_only for s in plan_slugs[:first_gated])
    assert first_gated > 0


def test_crisis_profile_leads_with_safety_reason():
    profile = _profile(crisis_indicators=["domestic_violence"])
    matches = match_services(profile)
    assert matches[0].service.slug == "safe-alliance"
    assert matches[0].match_confidence == "high"

    plan = recommend_application_order(matches, profile)
    assert plan[0]["service_slug"] == "safe-alliance"
    assert plan[0]["category"] == "emergency"
    assert plan[0]["reason"] == SAFETY_REASON
    slugs = [item["service_slug"] for item in plan]
    assert slugs.index("safe-alliance") < slugs.index("echo-coordinated-entry")


def test_crisis_services_bypass_the_match_cap():
    profile = _profile(crisis_indicators=["suicidal_ideation", "domestic_violence"])
    matches = match_services(profile)
    assert [m.service.slug for m in matches[:2]] == ["integral-care", "safe-alliance"]
    assert len(matches) == 15 + 2
    plan = recommend_application_order(matches, profile)
    assert plan[0]["service_slug"] == "integral-care"
    assert plan[0]["reason"] == SAFETY_REASON


def test_crisis_mapping_points_at_real_services():
    for slugs in _CRISIS_SERVICES.values():
        for slug in slugs:
            assert catalog.get_service_by_slug(slug) is not None, slug


def test_every_service_yaml_loads_with_known_gates():
    vocab = set(get_args(EligibilityGate))
    assert vocab == set(_GATES)

    files = sorted(SERVICES_DIR.glob("*.yaml"))
    assert len(files) == 87
    for path in files:
        svc = Service.model_validate(yaml.safe_load(path.read_text(encoding="utf-8")))
        assert set(svc.eligibility_requires) <= vocab, path.name

    # Open-to-anyone services stay ungated.
    assert not catalog.get_service_by_slug("salvation-army-austin").eligibility_requires


def test_unknown_gate_is_rejected():
    with pytest.raises(ValidationError):
        Service(name="x", slug="x", eligibility_requires=["vip"])

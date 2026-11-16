"""Resident-facing matching must not move for the bundled personas.

``fixtures/persona_matches_snapshot.json`` was generated from the matching
engine before the admin eligibility work (issue #20) touched it. Every
persona in the Austin pack, plus the synthetic admin demo residents, must
still get the same matches (slug, confidence, score, reasoning), the same
plan order, the same risk flags and the same benefit estimate.

Regenerate only for an intended matching change:
``python -m tests.test_persona_match_snapshot`` from ``backend/``.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.models import ResidentProfile
from app.services import catalog
from app.services.matching import (
    assess_risks,
    calculate_benefits,
    match_services,
    recommend_application_order,
)
from app.services.personas import _load_personas
from app.services.seed_data import get_demo_residents

SNAPSHOT = Path(__file__).parent / "fixtures" / "persona_matches_snapshot.json"


def _profiles() -> dict[str, ResidentProfile]:
    out = {f"persona:{pid}": p.seed_profile for pid, p in _load_personas().items()}
    out.update({f"resident:{r.id}": r.profile for r in get_demo_residents()})
    return out


def _outcome(profile: ResidentProfile) -> dict:
    matches = match_services(profile)
    return {
        "matches": [
            [m.service.slug, m.match_confidence, m.match_score, m.match_reasoning]
            for m in matches
        ],
        "plan": [
            [p["service_slug"], p["category"], p["reason"]]
            for p in recommend_application_order(matches, profile)
        ],
        "risks": [
            [r.risk_type, r.severity.value, r.prevention_services]
            for r in assess_risks(profile)
        ],
        "benefits": calculate_benefits(profile, matches),
    }


def snapshot() -> dict:
    catalog.load_seed_data()
    return {key: _outcome(profile) for key, profile in sorted(_profiles().items())}


@pytest.fixture(scope="module", autouse=True)
def _seed_catalog():
    catalog.load_seed_data()


def test_snapshot_covers_every_persona():
    expected = json.loads(SNAPSHOT.read_text(encoding="utf-8"))
    assert sorted(expected) == sorted(_profiles())
    assert any(key.startswith("persona:") for key in expected)


@pytest.mark.parametrize("key", sorted(_profiles()))
def test_matching_outcome_is_unchanged(key):
    expected = json.loads(SNAPSHOT.read_text(encoding="utf-8"))[key]
    assert _outcome(_profiles()[key]) == expected


if __name__ == "__main__":
    SNAPSHOT.write_text(json.dumps(snapshot(), indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {SNAPSHOT}")

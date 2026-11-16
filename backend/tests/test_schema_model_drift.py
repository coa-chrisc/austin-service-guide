"""The hand-written pack schemas (config/) and the loader's models must name the
same fields and the same closed vocabularies.

The schemas are the contract and stay stricter than the models on required
fields and patterns; this only stops the two from drifting apart, which has
already happened once (last_verified_date and verified_by were in the schema
but not on Service).
"""

from __future__ import annotations

import dataclasses
import json
import re
import typing
from pathlib import Path

import pytest
from pydantic import BaseModel

from app.models import (
    CostType,
    CrisisResource,
    EligibilityGate,
    LifeEvent,
    ResidentProfile,
    SchoolAgeChild,
    Service,
    ServiceCategory,
    ServiceDocument,
    ServiceLocation,
    ServiceStatus,
)
from app.services.catalog_loader import (
    BenefitEstimate,
    MatchingRules,
    PreventionEntry,
    ServiceTranslation,
    ZipCentroid,
)
from app.services.pack_validator import schema_dir
from app.services.personas import Persona, ScriptedTurn
from app.services.scenarios import check_crisis

BACKEND = Path(__file__).resolve().parents[1]

# In the schema, not yet on a model: the loader drops them. Remove an entry
# here when the field lands on the model (the last test enforces that).
SCHEMA_ONLY: dict[type, set[str]] = {}


def _schema(name: str) -> dict:
    return json.loads((schema_dir() / name).read_text(encoding="utf-8"))


def _node(schema: dict, *path: str) -> dict:
    node = schema
    for key in path:
        node = node[key]
    while "$ref" in node:  # local refs only
        node = _node(schema, *node["$ref"].removeprefix("#/").split("/"))
    return node


SERVICES = _schema("../services.schema.json")
RULES = _schema("matching_rules.schema.json")
PERSONAS = _schema("personas.schema.json")

PAIRS = [
    (Service, SERVICES),
    (ServiceLocation, _node(SERVICES, "$defs", "location")),
    (ServiceDocument, _node(SERVICES, "$defs", "document")),
    (ServiceCategory, _node(_schema("categories.schema.json"), "items")),
    (LifeEvent, _node(_schema("life_events.schema.json"), "items")),
    (CrisisResource, _node(_schema("crisis_resources.schema.json"), "items")),
    (ZipCentroid, _node(_schema("zip_centroids.schema.json"), "items")),
    (MatchingRules, RULES),
    (PreventionEntry, _node(RULES, "$defs", "prevention")),
    (BenefitEstimate, _node(RULES, "properties", "benefit_estimates", "items")),
    (ServiceTranslation, _node(_schema("service_translations.schema.json"), "additionalProperties", "additionalProperties")),
    (ResidentProfile, _node(PERSONAS, "$defs", "profile")),
    (SchoolAgeChild, _node(PERSONAS, "$defs", "child")),
    (Persona, _node(PERSONAS, "$defs", "persona")),
    (ScriptedTurn, _node(PERSONAS, "$defs", "persona", "properties", "script", "items")),
]


def model_fields(model: type) -> set[str]:
    if isinstance(model, type) and issubclass(model, BaseModel):
        return set(model.model_fields)
    return {f.name for f in dataclasses.fields(model)}


def drift(model: type, schema: dict) -> tuple[set[str], set[str]]:
    """(fields only on the model, properties only in the schema)."""
    on_model = model_fields(model)
    in_schema = set(schema["properties"]) - SCHEMA_ONLY.get(model, set())
    return on_model - in_schema, in_schema - on_model


@pytest.mark.parametrize("model,schema", PAIRS, ids=[m.__name__ for m, _ in PAIRS])
def test_model_and_schema_name_the_same_fields(model, schema):
    assert drift(model, schema) == (set(), set())
    assert schema.get("additionalProperties") is False, "unknown keys must be reported, not dropped"


def test_drift_check_catches_a_field_on_one_side_only():
    class Wider(ServiceDocument):
        new_field: str = ""

    narrower = copy_without(_node(SERVICES, "$defs", "document"), "is_required")
    assert drift(Wider, _node(SERVICES, "$defs", "document")) == ({"new_field"}, set())
    assert drift(ServiceDocument, narrower) == ({"is_required"}, set())


def copy_without(schema: dict, prop: str) -> dict:
    return {**schema, "properties": {k: v for k, v in schema["properties"].items() if k != prop}}


def test_schema_only_fields_are_really_schema_only():
    for model, fields in SCHEMA_ONLY.items():
        assert fields <= set(SERVICES["properties"])
        assert not fields & model_fields(model), "now on the model: drop it from SCHEMA_ONLY"


# ── Closed vocabularies ──────────────────────────────────────────────

def test_vocabularies_match_the_code():
    props = SERVICES["properties"]
    assert set(props["eligibility_requires"]["items"]["enum"]) == set(typing.get_args(EligibilityGate))
    assert set(props["cost_type"]["enum"]) == {c.value for c in CostType}
    assert set(props["status"]["enum"]) == {s.value for s in ServiceStatus}
    topic = _schema("crisis_resources.schema.json")["items"]["properties"]["crisis_topic"]["enum"]
    assert set(topic) - {None} == set(typing.get_args(typing.get_args(CrisisResource.model_fields["crisis_topic"].annotation)[0]))


def test_risk_types_match_the_engine():
    source = (BACKEND / "app" / "services" / "matching.py").read_text(encoding="utf-8")
    raised = set(re.findall(r'risk_type="([a-z_]+)"', source))
    assert set(RULES["properties"]["prevention_services"]["propertyNames"]["enum"]) == raised


def test_crisis_indicators_cover_what_the_intake_sets():
    detected = {check_crisis(t) for t in ("I want to die", "he hurts me", "I am in danger")}
    indicators = set(RULES["properties"]["crisis_services"]["properties"])
    assert detected <= indicators
    assert indicators == set(PERSONAS["$defs"]["profile"]["properties"]["crisis_indicators"]["items"]["enum"])

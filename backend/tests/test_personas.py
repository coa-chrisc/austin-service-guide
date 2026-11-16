"""Demo personas: launcher metadata, stored script, and plans that keep the
promise each scripted conversation ends with."""

from __future__ import annotations

import pytest

from app.services.personas import get_persona

# Slugs the closing assistant line of each persona promises. Variants share
# their base persona's seed and closing line, so they share the expectation.
_HEAT = {
    "heat-relief-ac-assistance",      # "help for the AC"
    "austin-energy-bill-assistance",  # "catching up on that electric bill"
    "volunteer-healthcare-clinic",    # "a free clinic for uninsured adults"
    "cooling-center-network",         # "cooling centers ... during heat advisories"
}
_SCHOOLS = {
    "vida-clinic-schools",            # "school-based counseling first"
    "communities-in-schools",
    "integral-care",                  # "a community mental health provider as a backup"
}
_EQUITY = {
    "heat-relief-ac-assistance",      # "help keeping your home cool this summer"
    "family-eldercare-housing",       # "housing help for older adults"
    "community-care-health-centers",  # "a health center with a pharmacy and sliding-scale fees"
    "austin-tenants-council",         # "a tenant-rights group"
}
_REFUGEE = {
    "austin-public-health-wic",       # "WIC, which may help with food for your two-year-old"
    "iact-multifaith-food-pantry",    # "a food pantry that works with refugee families"
    "community-care-health-centers",  # "a health center ... offers services in Arabic"
}
EXPECTED_IN_TOP_5 = {
    "heat-outdoor-worker": _HEAT,
    "heat-outdoor-worker-vi": _HEAT,
    "schools-anxious-student": _SCHOOLS,
    "schools-anxious-student-es": _SCHOOLS,
    "equity-east-austin": _EQUITY,
    "equity-east-austin-zh": _EQUITY,
    "refugee-food": _REFUGEE,
    "refugee-food-ar": _REFUGEE,
}


def _plan_slugs(client, persona_id: str) -> list[str]:
    loaded = client.post("/api/v1/intake/load-persona", json={"persona_id": persona_id})
    assert loaded.status_code == 200
    planned = client.post("/api/v1/intake/plan", json={"state": loaded.json()["state"]})
    assert planned.status_code == 200
    return [item["service_slug"] for item in planned.json()["plan"]["items"]]


def test_every_listed_persona_has_an_expectation(client):
    listed = {p["id"] for p in client.get("/api/v1/intake/personas").json()["personas"]}
    assert listed == set(EXPECTED_IN_TOP_5)


@pytest.mark.parametrize("persona_id", sorted(EXPECTED_IN_TOP_5))
def test_closing_promise_is_in_the_plan_top_5(client, persona_id):
    top5 = _plan_slugs(client, persona_id)[:5]
    missing = EXPECTED_IN_TOP_5[persona_id] - set(top5)
    assert not missing, f"{persona_id}: {sorted(missing)} not in top 5 {top5}"


def test_personas_list_summary_and_shows(client):
    personas = client.get("/api/v1/intake/personas").json()["personas"]
    for p in personas:
        assert p["summary"].strip(), p["id"]
        assert 2 <= len(p["shows"]) <= 3, p["id"]


def test_translated_variants_pair_with_a_base_persona(client):
    """The launcher groups "<base>-<language>" ids under their base card."""
    personas = client.get("/api/v1/intake/personas").json()["personas"]
    ids = {p["id"] for p in personas}
    variants = [p for p in personas if p["language"] != "en"]
    assert variants
    for p in variants:
        suffix = f"-{p['language']}"
        assert p["id"].endswith(suffix), p["id"]
        assert p["id"][: -len(suffix)] in ids, p["id"]


def test_every_risk_type_has_an_english_label():
    import inspect
    import re

    from app.services import matching
    from app.services.i18n import RISK_FLAGS_I18N, risk_flag_label

    emitted = set(re.findall(r'risk_type="([a-z_]+)"', inspect.getsource(matching.assess_risks)))
    assert emitted
    assert emitted <= set(RISK_FLAGS_I18N["en"])
    # Untranslated languages fall back to the English label.
    assert risk_flag_label("homelessness", "vi") == RISK_FLAGS_I18N["en"]["homelessness"]["label"]


@pytest.mark.parametrize("persona_id", ["heat-outdoor-worker", "heat-outdoor-worker-vi"])
def test_results_send_a_label_for_every_risk_flag(client, persona_id):
    state = client.post("/api/v1/intake/load-persona", json={"persona_id": persona_id}).json()["state"]
    flags = client.post("/api/v1/intake/results", json={"state": state}).json()["risk_flags"]
    assert flags
    for flag in flags:
        assert flag["label"] and flag["label"] != flag["risk_type"]


def test_loaded_persona_stores_the_scripted_conversation(client):
    persona = get_persona("heat-outdoor-worker")
    assert persona is not None
    res = client.post("/api/v1/intake/load-persona", json={"persona_id": persona.id})
    conversation = res.json()["state"]["conversation"]
    assert [m["role"] for m in conversation] == ["user", *[t.role for t in persona.script]]
    assert conversation[-1]["content"] == persona.script[-1].content
    # Completed: follow-up messages are refused, so the scripted step
    # counter never runs on the stored script turns.
    follow_up = client.post(
        "/api/v1/intake/message",
        json={"state": res.json()["state"], "message": "hello"},
    )
    assert follow_up.status_code == 400


def test_persona_plan_uses_rules_order_without_a_model_call(client, monkeypatch):
    """Demo replays are scripted, so their plan is the deterministic rules
    order, built instantly, even when live AI is on."""
    from app.models import IntakeState
    from app.services.intake_state import session_from_state
    from app.services.plan import rules_plan
    from tests.test_intake import _fake_openai

    calls = _fake_openai(monkeypatch, '{"summary": "x", "items": []}')
    state = client.post(
        "/api/v1/intake/load-persona", json={"persona_id": "heat-outdoor-worker"}
    ).json()["state"]
    planned = client.post("/api/v1/intake/plan", json={"state": state})
    assert planned.status_code == 200
    plan = planned.json()["plan"]
    assert calls == []
    assert plan["ai_generated"] is False
    expected = rules_plan(session_from_state(IntakeState.model_validate(state)))
    assert [i["service_id"] for i in plan["items"]] == [i.service_id for i in expected.items]


def test_live_intake_plan_uses_the_plan_reasoning_effort(client, monkeypatch):
    """A non-persona intake still gets the model plan, at its own effort."""
    from app.config import get_settings
    from tests.test_intake import _fake_openai

    calls = _fake_openai(monkeypatch, '{"summary": "x", "items": []}')
    monkeypatch.setattr(get_settings(), "openai_plan_reasoning_effort", "low")
    state = client.post(
        "/api/v1/intake/load-persona", json={"persona_id": "heat-outdoor-worker"}
    ).json()["state"]
    state["entry_source"] = ""
    planned = client.post("/api/v1/intake/plan", json={"state": state})
    assert planned.status_code == 200
    assert len(calls) == 1
    assert calls[0]["reasoning"] == {"effort": "low"}

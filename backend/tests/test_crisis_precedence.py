"""Crisis handling takes precedence everywhere a crisis can surface.

Covers the keyword interrupt in scripted mode (all languages the city
config offers), the model reporting a crisis through a tool, the raw-audio
voice reply, and the plan leading with crisis-direct services whether the
model or the rules engine ordered it.
"""

from __future__ import annotations

import asyncio
import json

import pytest

from tests.test_intake import Intake, _fake_openai
from tests.test_stateless_intake import _complete
from tests.test_voice_privacy import _post_transcript, _realtime_state

NATIONAL = ("9-1-1", "988", "1-800-799-7233")


def _session(state: dict):
    from app.models import IntakeState
    from app.services.intake_state import session_from_state

    return session_from_state(IntakeState.model_validate(state))


def _completed_crisis_state(client, indicators: list[str], drop_slugs: list[str]) -> dict:
    """A completed intake whose profile has ``indicators`` and whose matches
    leave out the services in ``drop_slugs`` (a client can send any list)."""
    from app.services import catalog

    state = dict(_complete(client).state)
    state["profile"] = {**state["profile"], "crisis_indicators": indicators}
    dropped = {catalog.get_service_by_slug(s).id for s in drop_slugs}
    state["matched_service_ids"] = [i for i in state["matched_service_ids"] if i not in dropped]
    state["plan"] = None
    return state


# ── Scripted mode: the keyword interrupt ─────────────────────────────

@pytest.mark.parametrize(
    "text",
    [
        "I want to kill myself",
        "my husband beats me",
        "I'm not safe at home",
        "Quiero suicidarme",
        "Mi esposo me pega",
        "Je veux mourir",
        "Tôi muốn chết",
        "我想死",
        "죽고 싶어요",
        "أريد أن أموت",
        "मैं आत्महत्या करना चाहता हूँ",
    ],
)
def test_crisis_statement_interrupts_the_scripted_intake(client, text):
    intake = Intake(client)
    res = intake.say_raw(text)
    assert res.status_code == 200
    reply = res.json()["response"]
    assert reply["crisis_detected"] is True
    for number in NATIONAL:
        assert number in reply["content"]
    assert intake.profile["crisis_indicators"]


def test_spanish_crisis_gets_a_spanish_reply(client):
    intake = Intake(client)
    content = intake.say("No quiero vivir")
    assert "Si estás en peligro inmediato" in content
    assert "988" in content


@pytest.mark.parametrize(
    "text",
    [
        "We are in danger of losing our apartment",
        "The neighborhood is not safe for the kids",
        "Estoy en peligro de perder mi casa",
    ],
)
def test_ordinary_sentences_do_not_interrupt(client, text):
    intake = Intake(client)
    reply = intake.say_raw(text).json()["response"]
    assert reply["crisis_detected"] is False
    assert intake.profile["crisis_indicators"] == []


def test_immediate_danger_leads_with_911(client):
    intake = Intake(client)
    content = intake.say("I am in danger")
    assert content.startswith("**If you are in immediate danger, call 9-1-1 now.**")
    assert intake.profile["crisis_indicators"] == ["immediate_danger"]


def test_counselor_button_shows_the_lines_again(client):
    intake = Intake(client)
    intake.say("I want to die")
    reply = intake.say_raw("Connect with crisis counselor").json()["response"]
    assert reply["crisis_detected"] is True
    assert "988" in reply["content"]
    # Repeats are not stacked on the profile.
    assert intake.profile["crisis_indicators"] == ["suicidal_ideation"]


# ── The model reports a crisis ───────────────────────────────────────

def test_get_crisis_resources_marks_the_session(client):
    from app.services.tools import dispatch_tool

    session = _session(Intake(client).state)
    _, crisis = dispatch_tool(session, "get_crisis_resources", {"language": "en", "crisis_type": None})
    assert crisis is True
    assert session.extracted_profile.crisis_indicators == ["crisis_reported"]

    session = _session(Intake(client).state)
    dispatch_tool(session, "get_crisis_resources", {"language": "en", "crisis_type": "domestic_violence"})
    assert session.extracted_profile.crisis_indicators == ["domestic_violence"]


def test_extract_profile_crisis_indicators_mark_the_session(client):
    from app.services.tools import dispatch_tool

    session = _session(Intake(client).state)
    _, crisis = dispatch_tool(session, "extract_profile", {"crisis_indicators": ["suicidal_ideation", "made_up"]})
    assert crisis is True
    assert session.extracted_profile.crisis_indicators == ["suicidal_ideation"]

    session = _session(Intake(client).state)
    _, crisis = dispatch_tool(session, "extract_profile", {"zip_code": "78741", "crisis_indicators": None})
    assert crisis is False
    assert session.extracted_profile.crisis_indicators == []


class _Item:
    def __init__(self, **fields):
        self.__dict__.update(fields)

    def model_dump(self, **_):
        return dict(self.__dict__)


def test_live_reply_after_a_crisis_tool_carries_the_lines(client, monkeypatch):
    from app.config import get_settings
    from app.services import ai

    intake = Intake(client)
    outputs = [
        [_Item(type="function_call", name="get_crisis_resources", call_id="c1",
               arguments=json.dumps({"language": "en", "crisis_type": None}))],
        [_Item(type="message", role="assistant", content=[])],
    ]

    class _Response:
        def __init__(self, output, text):
            self.output = output
            self.output_text = text

    class _Responses:
        async def create(self, **_):
            output = outputs.pop(0)
            return _Response(output, "" if output[0].type == "function_call" else "I'm so sorry.")

    class _Client:
        responses = _Responses()

    monkeypatch.setattr(ai, "_openai_client", lambda: _Client())
    settings = get_settings()
    monkeypatch.setattr(settings, "demo_mode", False)
    monkeypatch.setattr(settings, "openai_api_key", "sk-test")

    reply = intake.say_raw("Everything feels hopeless lately").json()["response"]
    assert reply["crisis_detected"] is True
    assert reply["content"].startswith("I'm so sorry.")
    assert "988" in reply["content"] and "1-800-799-7233" in reply["content"]
    assert intake.profile["crisis_indicators"] == ["crisis_reported"]


# ── Raw-audio voice ──────────────────────────────────────────────────

def test_voice_crisis_transcript_returns_a_constrained_crisis_reply(client, monkeypatch):
    state = _realtime_state(client, monkeypatch)
    body = _post_transcript(client, state, "user", "I want to end my life")
    assert body["crisis_detected"] is True
    reply = body["crisis_response"]
    assert reply["tool_choice"] == "none"
    assert reply["metadata"] == {"purpose": "crisis_response"}
    assert "988" in reply["instructions"] and "9-1-1" in reply["instructions"]
    assert body["messages"][-1]["crisis_detected"] is True


def test_voice_crisis_tool_returns_a_constrained_crisis_reply(client, monkeypatch):
    state = _realtime_state(client, monkeypatch)
    res = client.post("/api/v1/intake/realtime/tool", json={
        "state": state, "name": "get_crisis_resources",
        "arguments": {"language": "en", "crisis_type": "suicidal_ideation"}, "call_id": "c1",
    })
    body = res.json()
    assert body["crisis_detected"] is True
    assert body["crisis_response"]["tool_choice"] == "none"
    assert body["crisis_response"]["metadata"] == {"purpose": "crisis_tool_response"}
    assert body["state"]["profile"]["crisis_indicators"] == ["suicidal_ideation"]


def test_ordinary_voice_turn_has_no_crisis_reply(client, monkeypatch):
    state = _realtime_state(client, monkeypatch)
    body = _post_transcript(client, state, "user", "I need help with rent")
    assert body["crisis_detected"] is False
    assert "crisis_response" not in body


# ── The plan leads with crisis services ──────────────────────────────

def test_model_plan_leads_with_crisis_services_it_left_out(client, monkeypatch):
    from app.services.plan import build_application_order

    state = _completed_crisis_state(client, ["domestic_violence"], ["safe-alliance"])
    first = state["matched_service_ids"][0]
    _fake_openai(monkeypatch, json.dumps({
        "summary": "Start with food.", "items": [{"service_id": first, "reason": "You need food."}],
    }))
    session = _session(state)
    plan = asyncio.run(build_application_order(session))
    assert plan.ai_generated is True
    assert plan.items[0].service_slug == "safe-alliance"
    assert plan.items[1].service_id == first
    assert [i.rank for i in plan.items] == list(range(1, len(plan.items) + 1))
    # The added service joins the matches, so the plan survives grounding.
    assert session.matches[0].service.slug == "safe-alliance"


def test_model_plan_moves_a_low_ranked_crisis_service_first(client, monkeypatch):
    from app.services import catalog
    from app.services.plan import build_application_order

    state = _completed_crisis_state(client, ["suicidal_ideation"], [])
    crisis_id = catalog.get_service_by_slug("integral-care").id
    other = next(i for i in state["matched_service_ids"] if i != crisis_id)
    # Matched, but last in the list the client sent.
    state["matched_service_ids"] = [i for i in state["matched_service_ids"] if i != crisis_id] + [crisis_id]
    _fake_openai(monkeypatch, json.dumps({"summary": "x", "items": [
        {"service_id": other, "reason": "First."},
        {"service_id": crisis_id, "reason": "Talk to someone."},
    ]}))
    plan = asyncio.run(build_application_order(_session(state)))
    assert [i.service_id for i in plan.items] == [crisis_id, other]
    assert plan.items[0].reason == "Talk to someone."


def test_rules_plan_leads_with_crisis_services_missing_from_matches(client):
    from app.services.plan import rules_plan

    state = _completed_crisis_state(client, ["suicidal_ideation"], ["integral-care"])
    plan = rules_plan(_session(state))
    assert plan.items[0].service_slug == "integral-care"
    assert len(plan.items) <= 20


def test_reported_crisis_leads_with_every_acute_crisis_service(client):
    from app.services.plan import rules_plan

    state = _completed_crisis_state(client, ["crisis_reported"], [])
    slugs = [i.service_slug for i in rules_plan(_session(state)).items]
    assert slugs[:2] == ["integral-care", "safe-alliance"]


def test_crisis_plan_round_trips_through_the_plan_endpoint(client):
    state = _completed_crisis_state(client, ["domestic_violence"], ["safe-alliance"])
    res = client.post("/api/v1/intake/plan", json={"state": state})
    assert res.status_code == 200, res.text
    new_state = res.json()["state"]
    results = client.post("/api/v1/intake/results", json={"state": new_state}).json()
    assert results["application_order"][0]["service_slug"] == "safe-alliance"
    assert results["profile"]["crisis_indicators"] == ["domestic_violence"]

"""Regression tests for the scripted intake flow and intake endpoints.

The server is stateless: each helper keeps the client-held intake state
and sends it with every request, the way the browser does.
"""

from __future__ import annotations

import pytest

HOUSEHOLD_Q = "how many people are in your household"
ZIP_Q = "What zip code do you live in"


class Intake:
    """Test double for the browser: holds the state between requests."""

    def __init__(self, client, **start):
        self.client = client
        res = client.post("/api/v1/intake/start", json=start)
        assert res.status_code == 200, res.text
        self.state = res.json()["state"]

    def post(self, path, **body):
        res = self.client.post(f"/api/v1/intake/{path}", json={"state": self.state, **body})
        if res.status_code == 200 and "state" in res.json():
            self.state = res.json()["state"]
        return res

    def say_raw(self, text, **extra):
        return self.post("message", message=text, **extra)

    def say(self, text, **extra):
        res = self.say_raw(text, **extra)
        assert res.status_code == 200, res.text
        return res.json()["response"]["content"]

    @property
    def profile(self):
        return self.state["profile"]

    def stored_text(self):
        return repr(self.state)


def _start(client, **body):
    return Intake(client, **body)


def _say(client, intake, text):
    return intake.say(text)


def test_life_event_entry_still_asks_household_size(client):
    sid = _start(client, life_event="healthspan", focus=["smoking_cessation", "nutrition"])
    first = _say(client, sid, "I want to quit smoking")
    assert "hardest" in first  # scenario follow-up
    assert HOUSEHOLD_Q in _say(client, sid, "cost")
    assert ZIP_Q in _say(client, sid, "2 people")
    _say(client, sid, "78744")
    profile = sid.post("results").json()["profile"]
    assert profile["household_size"] == 2
    assert profile["zip_code"] == "78744"
    assert set(profile["immediate_needs"]) >= {"smoking_cessation", "nutrition"}


def test_crisis_turn_does_not_skip_next_scripted_question(client):
    sid = _start(client)
    _say(client, sid, "I want to kill myself")
    assert HOUSEHOLD_Q in _say(client, sid, "Continue finding services")
    assert ZIP_Q in _say(client, sid, "Just me")


def test_message_validation(client):
    sid = _start(client)
    assert sid.say_raw("").status_code == 422
    assert sid.say_raw("x" * 4001).status_code == 422
    # No state at all is a validation error, not a lookup.
    assert client.post("/api/v1/intake/message", json={"message": "hi"}).status_code == 422


def test_completed_intake_refuses_more_messages(client):
    done = _completed_session(client)
    assert done.state["status"] == "completed"
    assert done.say_raw("one more thing").status_code == 400


def test_start_rejects_oversized_focus(client):
    res = client.post("/api/v1/intake/start", json={"focus": ["x"] * 21})
    assert res.status_code == 422


def _completed_session(client):
    sid = _start(client)
    for text in ["food", "2", "78741", "I rent", "Working part-time",
                 "Under $1,000", "No insurance", "None of these"]:
        _say(client, sid, text)
    return sid


def test_share_validates_recipient(client):
    ids = _completed_session(client).state["matched_service_ids"]
    url = "/api/v1/intake/share"

    def share(**body):
        return client.post(url, json={"service_ids": ids, **body})

    assert share(channel="email", recipient="xyz").status_code == 422
    assert share(channel="sms", recipient="hello").status_code == 422
    ok = share(channel="sms", recipient="(512) 555-1234")
    assert ok.status_code == 200 and ok.json()["ok"] is True
    # The recipient is not echoed back.
    assert "5125551234" not in ok.text
    assert share(channel="email", recipient="a@b.org").status_code == 200


def test_realtime_secret_unavailable_without_key(client):
    sid = _start(client)
    res = sid.post("realtime/client-secret")
    assert res.status_code == 400
    assert "sk-" not in res.text


# ── PII redaction at the intake boundaries ──────────────────────────────

SSN = "123-45-6789"
PHONE = "512-555-0199"


def _stored_text(intake):
    return intake.stored_text()


def test_text_message_is_redacted_before_storage(client):
    sid = _start(client)
    res = sid.say_raw(f"I need food. My SSN is {SSN} and my phone is {PHONE}")
    body = res.json()
    assert res.status_code == 200
    assert body["user_message"]["content"] == (
        "I need food. My SSN is [SSN removed] and my phone is [phone removed]"
    )
    assert body["response"]["content"].startswith("For your privacy, I removed")
    assert HOUSEHOLD_Q in body["response"]["content"]  # flow continues normally
    stored = _stored_text(sid)
    assert SSN not in stored and PHONE not in stored


def test_redaction_notice_follows_session_language(client):
    sid = _start(client, language="es")
    res = sid.say_raw(f"Necesito comida, mi teléfono es {PHONE}", language="es")
    assert res.json()["response"]["content"].startswith("Por tu privacidad")


def test_live_model_payload_never_contains_raw_identifiers(client, monkeypatch):
    import openai

    from app.config import get_settings

    calls: list[dict] = []

    class _FakeResponse:
        output_text = "Thanks. How many people are in your household?"
        output: list = []

    class _FakeResponses:
        async def create(self, **kwargs):
            calls.append(kwargs)
            return _FakeResponse()

    class _FakeClient:
        def __init__(self, **_):
            self.responses = _FakeResponses()

    monkeypatch.setattr(openai, "AsyncOpenAI", _FakeClient)
    settings = get_settings()
    monkeypatch.setattr(settings, "demo_mode", False)
    monkeypatch.setattr(settings, "openai_api_key", "sk-test")

    sid = _start(client)
    _say(client, sid, f"ssn {SSN}, call me at {PHONE}, I need rent help")

    assert len(calls) == 2  # greeting + one agent-loop turn
    assert all(call["store"] is False for call in calls)
    assert calls[1]["include"] == ["reasoning.encrypted_content"]
    payload = repr(calls)
    assert SSN not in payload and PHONE not in payload
    assert "[SSN removed]" in payload and "[phone removed]" in payload
    assert "Never ask for, repeat, or store" in calls[1]["instructions"]
    # Only visible conversation text is replayed; nothing from a prior
    # turn's reasoning or tool loop.
    assert [item["role"] for item in calls[1]["input"]] == ["assistant", "user"]


def test_realtime_user_transcript_is_redacted(client):
    sid = _start(client)
    res = sid.post("realtime/transcript", role="user", content=f"my number is {PHONE}")
    body = res.json()
    assert res.status_code == 200
    assert body["messages"][0]["content"] == "my number is [phone removed]"
    assert body["redacted"] == ["phone"]
    assert PHONE not in _stored_text(sid)

    # Assistant turns quote catalog phone numbers on purpose; leave them.
    res = sid.post("realtime/transcript", role="assistant", content="Call 512-972-5000 to apply.")
    assert res.json()["messages"][0]["content"] == "Call 512-972-5000 to apply."
    assert sid.state["conversation"][-1]["content"] == "Call 512-972-5000 to apply."


def test_debug_log_values_are_redacted():
    from app.services.realtime_debug import _sanitize_debug_value

    cleaned = _sanitize_debug_value({"content_preview": f"ssn {SSN}", "args": [PHONE]})
    assert SSN not in repr(cleaned) and PHONE not in repr(cleaned)


def test_realtime_instructions_include_privacy_rules(client, monkeypatch):
    from app.models import IntakeState
    from app.services.intake_state import session_from_state
    from app.services.realtime import build_realtime_session_config

    sid = _start(client)
    config = build_realtime_session_config(
        session_from_state(IntakeState.model_validate(sid.state))
    )
    assert "Voice privacy" in config["instructions"]
    assert config["tracing"] is None


# ── Admin write gate ────────────────────────────────────────────────────

_NEW_SERVICE = {"id": "svc-test-admin-token", "name": "Token Test", "slug": "token-test"}


def test_admin_writes_refused_when_token_unset(client):
    res = client.post("/api/v1/admin/services", json=_NEW_SERVICE)
    assert res.status_code == 403
    assert "ADMIN_API_TOKEN" in res.json()["detail"]
    assert client.delete("/api/v1/admin/services/svc-wic").status_code == 403
    assert client.get("/api/v1/admin/services").status_code == 200  # reads stay open


def test_admin_writes_require_matching_token(client, monkeypatch):
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "admin_api_token", "s3cret")
    url = "/api/v1/admin/services"
    assert client.post(url, json=_NEW_SERVICE).status_code == 403
    assert client.post(url, json=_NEW_SERVICE, headers={"X-Admin-Token": "wrong"}).status_code == 403
    ok = client.post(url, json=_NEW_SERVICE, headers={"X-Admin-Token": "s3cret"})
    assert ok.status_code == 201
    gone = client.delete(f"{url}/{_NEW_SERVICE['id']}", headers={"X-Admin-Token": "s3cret"})
    assert gone.status_code == 200


# ── Scripted flow skips questions already answered ──────────────────────

def test_scripted_flow_skips_known_fields_after_lost_job(client):
    sid = _start(client, life_event="lost_job")
    assert "hit the hardest" in _say(client, sid, "I got laid off last week")
    reply = _say(client, sid, "Rent. We're a family of 3 in 78744 and I rent")
    # Household, zip, housing and employment are all known: go to income.
    assert "monthly income" in reply
    assert "health insurance" in _say(client, sid, "Under $1,000")
    profile = sid.profile
    assert profile["household_size"] == 3
    assert profile["zip_code"] == "78744"
    assert profile["housing_situation"] == "renting"
    assert profile["employment_status"] == "unemployed"
    assert profile["income_bracket"] == "$0-$10,000"


def test_lost_job_opener_does_not_re_ask_stated_housing(client):
    sid = _start(client, life_event="lost_job")
    reply = _say(
        client, sid,
        "I lost my job last month and I'm behind on rent. I rent an apartment in 78744.",
    )
    assert "housing situation" not in reply
    profile = sid.profile
    assert profile["housing_situation"] == "renting"
    assert profile["zip_code"] == "78744"


def test_scripted_flow_still_asks_unknown_fields_in_order(client):
    sid = _start(client)
    assert HOUSEHOLD_Q in _say(client, sid, "I need food, I live in 78702")
    # Zip already given, so the next question is housing, not zip.
    assert "housing situation" in _say(client, sid, "Just me")


# ── Honest greeting (no "confidential" promise) ─────────────────────────


def test_scripted_greeting_discloses_ai_and_never_says_confidential(client):
    from app.services.scripted import DEMO_STEPS

    sid = _start(client)
    greeting = sid.state["conversation"][0]["content"]
    assert greeting == DEMO_STEPS[0]["message"]
    assert "confidential" not in greeting.lower()
    assert "OpenAI" in greeting and "Social Security" in greeting


def test_ai_notice_translations_are_honest():
    from app.services.i18n import AI_NOTICE_I18N, REDACTION_NOTICE_I18N, ai_notice

    assert set(AI_NOTICE_I18N) == set(REDACTION_NOTICE_I18N)
    for text in AI_NOTICE_I18N.values():
        assert "OpenAI" in text and "confidential" not in text.lower()
    assert ai_notice("es-MX") == AI_NOTICE_I18N["es"]
    assert ai_notice("ko") is None


def _fake_openai(monkeypatch, output_text):
    import openai

    from app.config import get_settings

    calls: list[dict] = []

    class _FakeResponse:
        output: list = []

    _FakeResponse.output_text = output_text

    class _FakeResponses:
        async def create(self, **kwargs):
            calls.append(kwargs)
            return _FakeResponse()

    class _FakeClient:
        def __init__(self, **_):
            self.responses = _FakeResponses()

    monkeypatch.setattr(openai, "AsyncOpenAI", _FakeClient)
    settings = get_settings()
    monkeypatch.setattr(settings, "demo_mode", False)
    monkeypatch.setattr(settings, "openai_api_key", "sk-test")
    return calls


def test_live_greeting_prompt_requires_translated_ai_notice(client, monkeypatch):
    from app.services.i18n import AI_NOTICE_I18N

    calls = _fake_openai(monkeypatch, "¡Hola! ¿Qué te trae por aquí hoy?")
    sid = _start(client, language="es")

    prompt = calls[0]["input"][0]["content"]
    assert AI_NOTICE_I18N["es"] in prompt
    assert "confidential" not in prompt.replace("confidential or private", "")
    # The model left the notice out, so the backend appends it.
    greeting = sid.state["conversation"][0]["content"]
    assert greeting.endswith(AI_NOTICE_I18N["es"])


def test_live_greeting_keeps_model_text_when_notice_present(client, monkeypatch):
    text = "Welcome! This guide uses AI (OpenAI) to help. What brings you here?"
    _fake_openai(monkeypatch, text)
    sid = _start(client)
    assert sid.state["conversation"][0]["content"] == text


# ── Housing / children inference never excludes residents who may qualify ─

_HOMELESS_SERVICES = (
    "echo-coordinated-entry",
    "sunrise-homeless-navigation-center",
    "austin-resource-center-for-the-homeless",
    "salvation-army-rathgeber-center",
)


def _session_profile(intake):
    from app.models import ResidentProfile

    return ResidentProfile.model_validate(intake.profile)


def _not_excluded(slug, profile):
    from app.services import catalog
    from app.services.eligibility import unconfirmed_gates

    return unconfirmed_gates(catalog.get_service_by_slug(slug), profile) is not None


def test_eviction_with_nowhere_to_go_keeps_homeless_services(client):
    sid = _start(client)
    _say(client, sid, "I need housing help, I got evicted last week and have nowhere to go")
    _say(client, sid, "3")
    _say(client, sid, "78744")
    profile = _session_profile(sid)
    assert profile.housing_situation == "unstable"
    for slug in _HOMELESS_SERVICES:
        assert _not_excluded(slug, profile), slug


@pytest.mark.parametrize(
    "text",
    ["My landlord won't fix the heat", "I need help with rent", "the lease is up soon"],
)
def test_passing_housing_mention_still_asks_housing_question(client, text):
    sid = _start(client)
    _say(client, sid, text)
    _say(client, sid, "Just me")
    assert "housing situation" in _say(client, sid, "78744")
    assert _session_profile(sid).housing_situation == ""


def test_without_housing_button_is_not_read_as_renting(client):
    sid = _start(client)
    for text in ["food", "Just me", "78741"]:
        _say(client, sid, text)
    _say(client, sid, "Currently without housing")
    assert _session_profile(sid).housing_situation == "homeless"


def test_household_of_two_does_not_rule_out_family_services(client):
    sid = _start(client)
    _say(client, sid, "I need food")
    _say(client, sid, "2")
    profile = _session_profile(sid)
    assert profile.household_size == 2
    assert profile.has_children is None
    assert _not_excluded("head-start-austin", profile)


def test_stated_household_of_two_leaves_has_children_unknown():
    from app.models import IntakeMessage, IntakeSession, MessageRole
    from app.services.scripted import _capture_stated_facts

    session = IntakeSession()
    session.conversation.append(
        IntakeMessage(role=MessageRole.user, content="We're a family of 2 in 78744")
    )
    _capture_stated_facts(session)
    assert session.extracted_profile.household_size == 2
    assert session.extracted_profile.has_children is None


# ── Realtime transcript results always carry the redacted text ──────────

def test_realtime_early_returns_include_redacted_content(client):
    sid = _start(client)
    first = sid.post("realtime/transcript", role="user", content=f"my number is {PHONE}").json()
    assert first["redacted_content"] == "my number is [phone removed]"

    # Duplicate of the stored turn: nothing stored, but still redacted.
    dup = sid.post("realtime/transcript", role="user", content=f"my number is {PHONE}").json()
    assert dup["messages"] == []
    assert dup["redacted"] == ["phone"]
    assert dup["redacted_content"] == "my number is [phone removed]"

    # Completed session: user turns are refused, still redacted.
    done = _completed_session(client)
    res = done.post("realtime/transcript", role="user", content=f"ssn {SSN}").json()
    assert res["messages"] == [] and res["error"] == "session already completed"
    assert res["redacted"] == ["ssn"]
    assert res["redacted_content"] == "ssn [SSN removed]"
    assert SSN not in repr(res)


def test_realtime_assistant_transcript_strips_read_back_identifiers(client):
    sid = _start(client)
    spoken = (
        f"I heard {SSN}, you don't need to share that. Call 512-972-5000, "
        "visit 1000 E 11th St, or email info@caritasofaustin.org."
    )
    body = sid.post("realtime/transcript", role="assistant", content=spoken).json()
    expected = (
        "I heard [SSN removed], you don't need to share that. Call 512-972-5000, "
        "visit 1000 E 11th St, or email info@caritasofaustin.org."
    )
    assert body["messages"][0]["content"] == expected
    assert body["redacted"] == ["ssn"]
    assert SSN not in _stored_text(sid)


# ── Debug log bounds ────────────────────────────────────────────────────

def test_debug_sanitizer_preclips_huge_strings():
    import time

    from app.services.realtime_debug import _sanitize_debug_value

    started = time.perf_counter()
    cleaned = _sanitize_debug_value({"blob": "a" * 1_000_000, f"ssn {SSN}": 1})
    assert time.perf_counter() - started < 1.0
    assert cleaned["blob"].endswith(f"[truncated {1_000_000 - 1000} chars]")
    assert SSN not in repr(cleaned)


def test_debug_event_detail_size_is_bounded(client, monkeypatch):
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "realtime_debug_log_enabled", True)
    monkeypatch.setattr(get_settings(), "realtime_debug_log_path", "/dev/null")
    url = "/api/v1/intake/realtime/debug"
    event = {"trace_id": "trace-1", "event": "x"}
    too_big = client.post(url, json={**event, "detail": {"blob": "a" * 40_000}})
    assert too_big.status_code == 422
    ok = client.post(url, json={**event, "detail": {"blob": "a" * 2_000}})
    assert ok.status_code == 200
    assert client.post(url, json={**event, "trace_id": "../etc"}).status_code == 422


def test_debug_endpoints_hidden_when_log_disabled(client):
    url = "/api/v1/intake/realtime/debug"
    assert client.post(url, json={"trace_id": "t", "event": "x"}).status_code == 404
    assert client.get(f"{url}/t").status_code == 404
    assert client.get(f"{url}/sessions").status_code == 404


# ── No session expiry machinery remains ─────────────────────────────────

def test_health_has_no_session_ttl(client):
    assert "session_ttl_hours" not in client.get("/api/v1/health").json()
    done = _completed_session(client)
    assert "session_ttl_hours" not in done.post("results").json()


@pytest.mark.parametrize(
    "answer, expected",
    [
        ("I own my home", "own_home"),
        ("We own our house", "own_home"),
        ("I live on my own", "other"),
        ("I own a car and live in my car", "homeless"),
    ],
)
def test_housing_answer_needs_a_home_to_mean_own_home(answer, expected):
    from app.services.scripted import _extract_housing

    assert _extract_housing(answer) == expected

"""Voice privacy: raw audio is opt-in per deployment and server-enforced.

The default voice path transcribes on-device in the browser and sends
scrubbed text through POST /message; the server redacts again before any
model call. The OpenAI Realtime (raw-audio) endpoints answer 403 unless the
deployment sets both VOICE_PIPELINE_MODE=realtime_audio and
ALLOW_RAW_AUDIO_STREAM=true (and live AI is on).
"""

from __future__ import annotations

import json

import pytest
from pydantic import ValidationError

from app.config import Settings, get_settings
from app.services.pii import PLACEHOLDERS, redact

RAW_AUDIO_DISABLED = "Raw-audio voice is disabled for this deployment."
REALTIME_PATHS = ("realtime/client-secret", "realtime/tool", "realtime/transcript")


def _start_state(client) -> dict:
    res = client.post("/api/v1/intake/start", json={})
    assert res.status_code == 200, res.text
    return res.json()["state"]


def _set_live_ai(monkeypatch) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "demo_mode", False)
    monkeypatch.setattr(settings, "openai_api_key", "sk-test")


def _set_voice(monkeypatch, mode: str, allow: bool) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "voice_pipeline_mode", mode)
    monkeypatch.setattr(settings, "allow_raw_audio_stream", allow)


# ── 1. Settings defaults ────────────────────────────────────────────────

def test_settings_default_to_intercepted_text(monkeypatch):
    for name in ("VOICE_PIPELINE_MODE", "ALLOW_RAW_AUDIO_STREAM", "OPENAI_API_KEY", "DEMO_MODE"):
        monkeypatch.delenv(name, raising=False)
    settings = Settings(_env_file=None)
    assert settings.voice_pipeline_mode == "intercepted_text"
    assert settings.allow_raw_audio_stream is False
    assert settings.realtime_audio_enabled is False


def test_realtime_audio_needs_both_flags_and_live_ai(monkeypatch):
    for name in ("VOICE_PIPELINE_MODE", "ALLOW_RAW_AUDIO_STREAM", "OPENAI_API_KEY", "DEMO_MODE"):
        monkeypatch.delenv(name, raising=False)
    live = {"openai_api_key": "sk-test", "demo_mode": False}
    assert Settings(_env_file=None, voice_pipeline_mode="realtime_audio",
                    allow_raw_audio_stream=True, **live).realtime_audio_enabled
    assert not Settings(_env_file=None, voice_pipeline_mode="realtime_audio",
                        **live).realtime_audio_enabled
    assert not Settings(_env_file=None, allow_raw_audio_stream=True, **live).realtime_audio_enabled
    assert not Settings(_env_file=None, voice_pipeline_mode="realtime_audio",
                        allow_raw_audio_stream=True).realtime_audio_enabled


def test_unknown_voice_mode_fails_at_startup(monkeypatch):
    monkeypatch.setenv("VOICE_PIPELINE_MODE", "raw")
    with pytest.raises(ValidationError, match="voice_pipeline_mode"):
        Settings(_env_file=None)


# ── 2. GET /voice-config ────────────────────────────────────────────────

@pytest.mark.usefixtures("defense_off")  # exact pre-defense body; defense fields: test_defense_*
def test_voice_config_defaults_to_intercepted_text(client):
    res = client.get("/api/v1/intake/voice-config")
    assert res.status_code == 200
    assert res.json() == {"mode": "intercepted_text", "raw_audio_allowed": False, "live_ai": False}


@pytest.mark.usefixtures("defense_off")  # exact pre-defense body; defense fields: test_defense_*
@pytest.mark.parametrize(
    ("mode", "allow", "live", "expected"),
    [
        ("realtime_audio", True, True, "realtime_audio"),
        ("realtime_audio", False, True, "intercepted_text"),
        ("intercepted_text", True, True, "intercepted_text"),
        ("realtime_audio", True, False, "intercepted_text"),
    ],
)
def test_voice_config_reports_effective_mode(client, monkeypatch, mode, allow, live, expected):
    _set_voice(monkeypatch, mode, allow)
    if live:
        _set_live_ai(monkeypatch)
    res = client.get("/api/v1/intake/voice-config")
    assert res.json() == {"mode": expected, "raw_audio_allowed": allow, "live_ai": live}


# ── 3. Realtime endpoints are refused by default ────────────────────────

class _NoNetwork:
    def __init__(self, *_, **__):
        raise AssertionError("Realtime endpoint reached the network while disabled")


@pytest.mark.parametrize(
    ("mode", "allow"),
    [("intercepted_text", False), ("realtime_audio", False), ("intercepted_text", True)],
)
def test_realtime_endpoints_refused_before_any_work(client, monkeypatch, mode, allow):
    import httpx

    from app.routers import intake

    state = _start_state(client)
    _set_live_ai(monkeypatch)  # even with a key, the flags decide
    _set_voice(monkeypatch, mode, allow)
    monkeypatch.setattr(httpx, "AsyncClient", _NoNetwork)
    monkeypatch.setattr(intake.httpx, "AsyncClient", _NoNetwork)

    def _boom(*_, **__):
        raise AssertionError("Realtime handler ran while disabled")

    monkeypatch.setattr(intake, "build_realtime_session_config", _boom)
    monkeypatch.setattr(intake, "execute_realtime_tool", _boom)
    monkeypatch.setattr(intake, "record_realtime_transcript", _boom)

    bodies = {
        "realtime/client-secret": {"state": state},
        "realtime/tool": {"state": state, "name": "search_services", "arguments": {"query": "food"}},
        "realtime/transcript": {"state": state, "role": "user", "content": "I need food"},
    }
    for path in REALTIME_PATHS:
        for body in (bodies[path], {}):  # {} proves the gate runs before body validation
            res = client.post(f"/api/v1/intake/{path}", json=body)
            assert res.status_code == 403, (path, res.text)
            assert res.json() == {"detail": RAW_AUDIO_DISABLED}


# ── 4. Intercepted text: the model never sees raw PII ───────────────────

FAKE_REPLY = "Thanks. How many people are in your household?"

# Dictated the way on-device speech-to-text tends to write it.
SPOKEN_TURN = (
    "Hi, my name is Maria Lopez. My phone is 512-555-0199, or five one two five five "
    "five zero one nine nine. My social security number is one two three four five six "
    "seven eight nine and my SSN is 123-45-6789. I live at 1204 Main Street, that's "
    "twelve oh four Main Street. I need help with rent."
)
RAW_PII = (
    "Maria", "Lopez", "512-555-0199", "five one two five five five", "zero one nine nine",
    "one two three four five six seven eight nine", "123-45-6789", "1204 Main",
    "twelve oh four",
)


def test_live_model_never_receives_spoken_pii(client, monkeypatch):
    from app.services import ai

    state = _start_state(client)  # scripted greeting; no model call yet
    calls: list[dict] = []

    class _FakeResponse:
        output_text = FAKE_REPLY
        output = [{
            "type": "message",
            "role": "assistant",
            "content": [{"type": "output_text", "text": FAKE_REPLY}],
        }]

    class _FakeResponses:
        async def create(self, **kwargs):
            calls.append(kwargs)
            return _FakeResponse()

    class _FakeClient:
        responses = _FakeResponses()

    monkeypatch.setattr(ai, "_openai_client", lambda: _FakeClient())
    _set_live_ai(monkeypatch)

    res = client.post("/api/v1/intake/message", json={"state": state, "message": SPOKEN_TURN})
    assert res.status_code == 200, res.text
    body = res.json()
    # The live path ran (no silent fallback to the scripted flow).
    assert len(calls) == 1
    assert body["response"]["content"].endswith(FAKE_REPLY)
    assert calls[0]["store"] is False

    sent = json.dumps(calls, default=str)
    returned = res.text
    for raw in RAW_PII:
        assert raw not in sent, raw
        assert raw not in returned, raw
    for kind in ("name", "phone", "ssn", "address"):
        assert PLACEHOLDERS[kind] in sent, kind


# ── 5. Spoken-number rules ──────────────────────────────────────────────

@pytest.mark.parametrize(
    ("text", "expected", "kinds"),
    [
        ("my number is five one two five five five zero one nine nine",
         "my number is [phone removed]", ["phone"]),
        ("you can reach me at 512 five five five 0199",
         "you can reach me at [phone removed]", ["phone"]),
        ("my social security number is one two three four five six seven eight nine",
         "my social security number is [SSN removed]", ["ssn"]),
        ("last four of my social is one two three four",
         "last four of my social is [SSN removed]", ["ssn"]),
        ("I live at twelve oh four Main Street", "I live at [address removed]", ["address"]),
        ("forty five hundred south Congress Avenue apartment two", "[address removed]", ["address"]),
    ],
)
def test_spoken_identifiers_are_redacted(text, expected, kinds):
    result = redact(text)
    assert result.text == expected
    assert result.types == kinds


@pytest.mark.parametrize(
    "text",
    [
        "I have three kids",
        "two adults and one child",
        "about five hundred dollars a month",
        "we've been here two or three months",
        "twenty two years on the street",
        "one long road",
        "my kids are five and seven, and I'm thirty two",
        "one two three four five six",
        "Oh, 2023 2024 were hard",
        "date 1988-03-15",
    ],
)
def test_ordinary_spoken_numbers_survive(text):
    assert redact(text) == (text, [])


def test_spoken_ssn_rule_leaves_assistant_phone_numbers():
    from app.services.pii import ASSISTANT_KINDS

    text = "Social Security: 1 800 772 1213"
    assert redact(text, kinds=ASSISTANT_KINDS) == (text, [])


# ── 6. Realtime session config: speakers-and-mic echo, no prompt leak ───

def _realtime_session(client):
    from app.models import IntakeState
    from app.services.intake_state import session_from_state

    return session_from_state(IntakeState.model_validate(_start_state(client)))


def _sdk_extras(model, path="session") -> list[str]:
    """Field paths the OpenAI SDK model doesn't know (it keeps them as extras)."""
    from pydantic import BaseModel

    found = [f"{path}.{key}" for key in (model.model_extra or {})]
    for name in type(model).model_fields:
        value = getattr(model, name)
        children = value if isinstance(value, list) else [value]
        for i, child in enumerate(children):
            if isinstance(child, BaseModel):
                suffix = f"[{i}]" if isinstance(value, list) else ""
                found += _sdk_extras(child, f"{path}.{name}{suffix}")
    return found


def test_realtime_session_config_matches_openai_schema(client):
    """Every field and enum value is one the OpenAI SDK's Realtime schema knows."""
    from openai.types.realtime import RealtimeSessionCreateRequest

    from app.services.realtime import build_realtime_session_config

    config = build_realtime_session_config(_realtime_session(client))
    model = RealtimeSessionCreateRequest.model_validate(config)
    assert _sdk_extras(model) == []


def test_realtime_defaults_are_current_model_at_low_effort():
    """gpt-realtime-2.1 at low effort, the voice-agent starting point."""
    from typing import Literal, get_args, get_origin

    from openai.types.realtime import RealtimeSessionCreateRequest

    fields = Settings.model_fields
    assert fields["openai_realtime_model"].default == "gpt-realtime-2.1"
    assert fields["openai_realtime_reasoning_effort"].default == "low"
    # The installed SDK lists the id as a known Realtime model, not only as
    # a free-form string.
    model_annotation = RealtimeSessionCreateRequest.model_fields["model"].annotation
    known = {
        value
        for arg in get_args(model_annotation)
        if get_origin(arg) is Literal
        for value in get_args(arg)
    }
    assert "gpt-realtime-2.1" in known


def test_realtime_session_config_uses_configured_model_and_effort(client, monkeypatch):
    from app.services.realtime import build_realtime_session_config

    settings = get_settings()
    monkeypatch.setattr(settings, "openai_realtime_model", "gpt-realtime-2.1")
    monkeypatch.setattr(settings, "openai_realtime_reasoning_effort", "low")
    config = build_realtime_session_config(_realtime_session(client))
    assert config["model"] == "gpt-realtime-2.1"
    assert config["reasoning"] == {"effort": "low"}


def test_realtime_session_config_is_tuned_for_speakers(client):
    from app.services.realtime import build_realtime_session_config

    audio_in = build_realtime_session_config(_realtime_session(client))["audio"]["input"]
    # The transcription model can read its prompt back as the transcript of
    # silence or echo, so there is none.
    assert audio_in["transcription"] == {"model": "gpt-4o-transcribe"}
    assert audio_in["noise_reduction"] == {"type": "far_field"}
    assert audio_in["turn_detection"] == {
        "type": "server_vad",
        "create_response": False,
        "interrupt_response": True,
        "threshold": 0.6,
        "prefix_padding_ms": 300,
        "silence_duration_ms": 700,
    }


@pytest.mark.parametrize("language", ["en", "es", "vi"])
def test_realtime_transcription_language_is_never_pinned(client, language):
    """The resident may answer in any language, so the transcriber detects it.

    A pinned language would force a Spanish-UI resident who speaks English
    (or the reverse) into the wrong transcript, and the echo check and the
    chat would both see it.
    """
    from app.services.realtime import build_realtime_session_config

    session = _realtime_session(client)
    session.language = language
    transcription = build_realtime_session_config(session)["audio"]["input"]["transcription"]
    assert transcription == {"model": "gpt-4o-transcribe"}


def test_realtime_instructions_switch_on_spoken_language_not_accent(client):
    from app.services.realtime import build_realtime_instructions

    text = build_realtime_instructions(_realtime_session(client))
    assert "speaks to you in a different language" in text
    assert "call set_language" in text
    assert "so the screen and the plan follow" in text
    # Accent alone must never switch the language.
    assert "Accent alone is never a reason to switch" in text
    # The model greeted already (startup response); it must not greet again.
    assert "Do not greet again" in text


# ── 6b. Startup greeting: spoken by the voice model, never on the device ─

def test_realtime_startup_response_matches_openai_schema(client):
    """The greeting's response.create body is one the OpenAI SDK knows."""
    from openai.types.realtime import RealtimeResponseCreateParams

    from app.services.realtime import build_realtime_startup_response

    body = build_realtime_startup_response(_realtime_session(client))
    model = RealtimeResponseCreateParams.model_validate(body)
    assert _sdk_extras(model, "response") == []
    assert body["output_modalities"] == ["audio"]
    assert body["tool_choice"] == "none"
    assert body["metadata"] == {"purpose": "startup_greeting"}


def test_realtime_startup_greeting_invites_any_language(client):
    from app.services.realtime import build_realtime_startup_response

    instructions = build_realtime_startup_response(_realtime_session(client))["instructions"]
    assert "in English" in instructions
    assert "English, Spanish, or any other language" in instructions
    assert "just start talking in yours" in instructions
    assert "How can I help you today?" in instructions
    # Short and on its own: no privacy notice or tools in the greeting turn.
    assert "eight seconds" in instructions
    assert "no privacy notice" in instructions


def test_realtime_startup_greeting_uses_the_session_language(client):
    from app.services.realtime import build_realtime_startup_response

    session = _realtime_session(client)
    session.language = "es"
    instructions = build_realtime_startup_response(session)["instructions"]
    assert "in Spanish" in instructions
    assert "translated naturally" in instructions


def test_realtime_startup_greeting_without_named_languages(client, monkeypatch):
    """A city configured for one language still offers any language."""
    import dataclasses

    from app.services import realtime
    from app.services.city import get_city

    monkeypatch.setattr(
        realtime, "get_city", lambda: dataclasses.replace(get_city(), languages=("en",))
    )
    instructions = realtime.build_realtime_startup_response(
        _realtime_session(client)
    )["instructions"]
    assert "You can talk with me in any language" in instructions


class _SecretMinted:
    """httpx.AsyncClient stand-in that returns a minted client secret."""

    sent: list[dict] = []

    def __init__(self, *_, **__):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_):
        return False

    async def post(self, url, *, json=None, **__):
        import httpx

        _SecretMinted.sent.append(json)
        request = httpx.Request("POST", url)
        return httpx.Response(
            200,
            json={"value": "ek_test", "expires_at": 0, "session": {"id": "sess_test"}},
            request=request,
        )


def test_client_secret_returns_the_startup_greeting(client, monkeypatch):
    from app.routers import intake

    state = _start_state(client)
    _set_live_ai(monkeypatch)
    _set_voice(monkeypatch, "realtime_audio", True)
    _SecretMinted.sent = []
    monkeypatch.setattr(intake.httpx, "AsyncClient", _SecretMinted)

    res = client.post(
        "/api/v1/intake/realtime/client-secret",
        json={"state": state, "language": "es"},
    )
    assert res.status_code == 200, res.text
    body = res.json()
    # The browser's language is the starting language for the greeting.
    assert "in Spanish" in body["startup_response"]["instructions"]
    assert body["startup_response"]["metadata"] == {"purpose": "startup_greeting"}
    # The transcriber is not pinned to the starting language.
    sent = _SecretMinted.sent[0]["session"]
    assert "language" not in sent["audio"]["input"]["transcription"]


# ── 7. Transcripts that aren't resident speech are dropped ──────────────

def _post_transcript(client, state: dict, role: str, content: str) -> dict:
    res = client.post(
        "/api/v1/intake/realtime/transcript",
        json={"state": state, "role": role, "content": content},
    )
    assert res.status_code == 200, res.text
    return res.json()


def _realtime_state(client, monkeypatch) -> dict:
    state = _start_state(client)
    _set_live_ai(monkeypatch)
    _set_voice(monkeypatch, "realtime_audio", True)
    return state


ASSISTANT_QUESTION = (
    "Thanks for sharing that. What is your household's total monthly income, "
    "before taxes?"
)


def test_assistant_echo_is_not_stored_as_resident_speech(client, monkeypatch):
    state = _realtime_state(client, monkeypatch)
    state = _post_transcript(client, state, "assistant", ASSISTANT_QUESTION)["state"]
    before = state["conversation"]

    # The mic heard the speakers; the transcriber dropped a word or two.
    echo = "what is your household's total monthly income before taxes"
    body = _post_transcript(client, state, "user", echo)
    assert body["ignored"] == "assistant_echo"
    assert body["messages"] == []
    assert body["crisis_detected"] is False
    assert body["state"]["conversation"] == before


def test_greeting_echo_is_dropped(client, monkeypatch):
    state = _realtime_state(client, monkeypatch)
    greeting = state["conversation"][-1]
    assert greeting["role"] == "assistant"
    body = _post_transcript(client, state, "user", greeting["content"])
    assert body["ignored"] == "assistant_echo"
    assert body["state"]["conversation"] == state["conversation"]


@pytest.mark.parametrize("noise", [".", "...", " - ", "¿?"])
def test_punctuation_only_transcript_is_dropped(client, monkeypatch, noise):
    state = _realtime_state(client, monkeypatch)
    body = _post_transcript(client, state, "user", noise)
    assert body["ignored"] == "empty"
    assert body["messages"] == []
    assert body["state"]["conversation"] == state["conversation"]


@pytest.mark.parametrize(
    "answer",
    [
        "About two thousand a month.",
        "Monthly income?",  # too short to call echo
        "Total monthly income, um, before taxes is about 1800",
        "What is my income? I get about two thousand from my job",
        "78741",
    ],
)
def test_real_answers_are_kept(client, monkeypatch, answer):
    state = _realtime_state(client, monkeypatch)
    state = _post_transcript(client, state, "assistant", ASSISTANT_QUESTION)["state"]
    body = _post_transcript(client, state, "user", answer)
    assert "ignored" not in body
    assert body["messages"][0]["role"] == "user"
    assert body["state"]["conversation"][-1]["content"] == body["messages"][0]["content"]


def test_echo_check_only_looks_at_turns_since_the_resident_spoke(client, monkeypatch):
    state = _realtime_state(client, monkeypatch)
    state = _post_transcript(client, state, "assistant", ASSISTANT_QUESTION)["state"]
    state = _post_transcript(client, state, "user", "about two thousand")["state"]
    # Once the resident has answered, repeating the earlier question is
    # their own turn, not echo.
    body = _post_transcript(
        client, state, "user", "what is your household's total monthly income before taxes"
    )
    assert "ignored" not in body
    assert body["messages"][0]["role"] == "user"


def test_crisis_words_are_never_dropped_as_echo(client, monkeypatch):
    state = _realtime_state(client, monkeypatch)
    spoken = "If you are not safe right now, please call 911."
    state = _post_transcript(client, state, "assistant", spoken)["state"]
    body = _post_transcript(client, state, "user", "if you are not safe right now please call 911")
    assert "ignored" not in body
    assert body["crisis_detected"] is True

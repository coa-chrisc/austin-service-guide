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

def test_voice_config_defaults_to_intercepted_text(client):
    res = client.get("/api/v1/intake/voice-config")
    assert res.status_code == 200
    assert res.json() == {"mode": "intercepted_text", "raw_audio_allowed": False, "live_ai": False}


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

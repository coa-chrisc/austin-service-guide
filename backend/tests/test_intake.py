"""Regression tests for the scripted intake flow and intake endpoints."""

from __future__ import annotations

HOUSEHOLD_Q = "how many people are in your household"
ZIP_Q = "What zip code do you live in"


def _start(client, **body):
    res = client.post("/api/v1/intake/start", json=body)
    assert res.status_code == 200
    return res.json()["session_id"]


def _say(client, sid, text):
    res = client.post(f"/api/v1/intake/{sid}/message", json={"message": text})
    assert res.status_code == 200, res.text
    return res.json()["response"]["content"]


def test_life_event_entry_still_asks_household_size(client):
    sid = _start(client, life_event="healthspan", focus=["smoking_cessation", "nutrition"])
    first = _say(client, sid, "I want to quit smoking")
    assert "hardest" in first  # scenario follow-up
    assert HOUSEHOLD_Q in _say(client, sid, "cost")
    assert ZIP_Q in _say(client, sid, "2 people")
    _say(client, sid, "78744")
    profile = client.get(f"/api/v1/intake/{sid}/results").json()["profile"]
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
    url = f"/api/v1/intake/{sid}/message"
    assert client.post(url, json={"message": ""}).status_code == 422
    assert client.post(url, json={"message": "x" * 4001}).status_code == 422
    assert client.post("/api/v1/intake/nope/message", json={"message": "hi"}).status_code == 404


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
    sid = _completed_session(client)
    url = f"/api/v1/intake/{sid}/share"
    assert client.post(url, json={"channel": "email", "recipient": "xyz"}).status_code == 422
    assert client.post(url, json={"channel": "sms", "recipient": "hello"}).status_code == 422
    ok = client.post(url, json={"channel": "sms", "recipient": "(512) 555-1234"})
    assert ok.status_code == 200 and ok.json()["to"] == "5125551234"
    assert client.post(url, json={"channel": "email", "recipient": "a@b.org"}).status_code == 200


def test_realtime_secret_unavailable_without_key(client):
    sid = _start(client)
    res = client.post(f"/api/v1/intake/{sid}/realtime/client-secret", json={})
    assert res.status_code == 400
    assert "sk-" not in res.text

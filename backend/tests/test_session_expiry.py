"""Intake sessions expire SESSION_TTL_HOURS after they start."""

from __future__ import annotations

from datetime import datetime, timedelta

import pytest

from app.services import ai


def _start(client) -> str:
    res = client.post("/api/v1/intake/start", json={})
    assert res.status_code == 200
    return res.json()["session_id"]


def _completed_session(client) -> str:
    sid = _start(client)
    for text in ["food", "2", "78741", "I rent", "Working part-time",
                 "Under $1,000", "No insurance", "None of these"]:
        res = client.post(f"/api/v1/intake/{sid}/message", json={"message": text})
        assert res.status_code == 200
    return sid


def _advance_clock(monkeypatch, hours: float) -> None:
    later = datetime.utcnow() + timedelta(hours=hours)
    monkeypatch.setattr(ai, "_utcnow", lambda: later)


def _requests(client, sid):
    base = f"/api/v1/intake/{sid}"
    return {
        "message": client.post(f"{base}/message", json={"message": "hello"}),
        "results": client.get(f"{base}/results"),
        "summary": client.get(f"{base}/summary"),
        "share": client.post(
            f"{base}/share", json={"channel": "sms", "recipient": "(512) 555-1234"}
        ),
        "client_secret": client.post(f"{base}/realtime/client-secret", json={}),
        "tool": client.post(f"{base}/realtime/tool", json={"name": "find_matching_services"}),
        "transcript": client.post(
            f"{base}/realtime/transcript", json={"role": "user", "content": "hi"}
        ),
    }


def test_session_still_available_before_ttl(client, monkeypatch):
    sid = _completed_session(client)
    _advance_clock(monkeypatch, 23)
    assert client.get(f"/api/v1/intake/{sid}/results").status_code == 200
    assert client.get(f"/api/v1/intake/{sid}/summary").status_code == 200


def test_expired_session_is_not_found_everywhere(client, monkeypatch):
    sid = _completed_session(client)
    assert ai.get_session(sid) is not None
    _advance_clock(monkeypatch, 24.01)

    responses = _requests(client, sid)

    assert {name: r.status_code for name, r in responses.items()} == {
        name: 404 for name in responses
    }
    assert sid not in ai._sessions
    assert sid not in ai._plan_tasks and sid not in ai._plan_cache


def test_session_ttl_is_configurable(client, monkeypatch):
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "session_ttl_hours", 2)
    sid = _start(client)
    _advance_clock(monkeypatch, 2.5)
    assert ai.get_session(sid) is None


def test_creating_a_session_purges_expired_ones(client, monkeypatch):
    sid = _start(client)
    session = ai._sessions[sid]
    monkeypatch.setattr(session, "created_at", session.created_at - timedelta(hours=25))
    _start(client)
    assert sid not in ai._sessions


def test_expiry_purges_realtime_debug_events(client, monkeypatch, tmp_path):
    from app.config import get_settings

    settings = get_settings()
    monkeypatch.setattr(settings, "realtime_debug_log_enabled", True)
    monkeypatch.setattr(settings, "realtime_debug_log_path", str(tmp_path / "rt.jsonl"))
    sid = _start(client)
    res = client.post(f"/api/v1/intake/{sid}/realtime/debug", json={"event": "mic_on"})
    assert res.status_code == 200
    assert ai._realtime_debug_logs.get(sid)

    _advance_clock(monkeypatch, 25)
    assert ai.get_session(sid) is None
    assert sid not in ai._realtime_debug_logs and sid not in ai._realtime_debug_seq


@pytest.mark.parametrize("channel,recipient", [("sms", "(512) 555-1234"), ("email", "a@b.org")])
def test_share_message_states_link_expiry(client, monkeypatch, channel, recipient):
    from app.routers import intake as intake_router

    sent: dict = {}

    async def _capture(**kwargs):
        sent.update(kwargs)
        return {"ok": True, "demo": True, "channel": channel, "to": "x"}

    monkeypatch.setattr(intake_router, "send_sms", _capture)
    monkeypatch.setattr(intake_router, "send_email", _capture)
    sid = _completed_session(client)
    session = ai.get_session(sid)
    # Force the "more than 8 matches" branch so the SMS carries the results link.
    monkeypatch.setattr(session, "matches", session.matches * 9)

    res = client.post(
        f"/api/v1/intake/{sid}/share", json={"channel": channel, "recipient": recipient}
    )
    assert res.status_code == 200
    body = sent.get("body") or sent.get("text")
    assert f"/results/{sid}" in body
    assert "expires within 24 hours" in body
    if channel == "email":
        assert "expires within 24 hours" in sent["html"]

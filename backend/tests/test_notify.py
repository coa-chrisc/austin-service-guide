"""Provider errors are logged without the response body or recipient."""

from __future__ import annotations

import asyncio
import json
import logging

import httpx
import pytest

from app.config import get_settings
from app.services import notify

PHONE = "+15125550199"
EMAIL = "resident@example.org"


def _mock_provider(monkeypatch, status: int, body: str) -> None:
    real_client = httpx.AsyncClient

    def _factory(**kwargs):
        transport = httpx.MockTransport(lambda request: httpx.Response(status, text=body))
        return real_client(transport=transport, **kwargs)

    monkeypatch.setattr(notify.httpx, "AsyncClient", _factory)


@pytest.fixture
def live_creds(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "twilio_account_sid", "AC123")
    monkeypatch.setattr(settings, "twilio_auth_token", "tok")
    monkeypatch.setattr(settings, "twilio_from_number", "+15125550000")
    monkeypatch.setattr(settings, "sendgrid_api_key", "SG.key")


def test_twilio_error_logs_status_and_code_only(live_creds, monkeypatch, caplog):
    body = json.dumps({
        "code": 21211,
        "message": f"The 'To' number {PHONE} is not a valid phone number.",
        "status": 400,
    })
    _mock_provider(monkeypatch, 400, body)

    with caplog.at_level(logging.ERROR, logger=notify.__name__):
        with pytest.raises(RuntimeError):
            asyncio.run(notify.send_sms(to=PHONE, body="hi"))

    assert "status=400 code=21211" in caplog.text
    assert PHONE not in caplog.text and "not a valid" not in caplog.text


def test_sendgrid_error_logs_status_and_fields_only(live_creds, monkeypatch, caplog):
    body = json.dumps({"errors": [{
        "message": f"Does not contain a valid address: {EMAIL}",
        "field": "personalizations.0.to.0.email",
        "help": None,
    }]})
    _mock_provider(monkeypatch, 400, body)

    with caplog.at_level(logging.ERROR, logger=notify.__name__):
        with pytest.raises(RuntimeError):
            asyncio.run(notify.send_email(to=EMAIL, subject="s", text="t"))

    assert "status=400" in caplog.text
    assert "personalizations.0.to.0.email" in caplog.text
    assert EMAIL not in caplog.text and "valid address" not in caplog.text


def test_non_json_error_body_is_not_logged(live_creds, monkeypatch, caplog):
    _mock_provider(monkeypatch, 502, f"<html>upstream failed for {PHONE}</html>")

    with caplog.at_level(logging.ERROR, logger=notify.__name__):
        with pytest.raises(RuntimeError):
            asyncio.run(notify.send_sms(to=PHONE, body="hi"))

    assert "status=502 code=None" in caplog.text
    assert PHONE not in caplog.text and "upstream" not in caplog.text


def _capture_sendgrid_from(monkeypatch) -> list[dict]:
    sent: list[dict] = []
    real_client = httpx.AsyncClient

    def _handler(request: httpx.Request) -> httpx.Response:
        sent.append(json.loads(request.content)["from"])
        return httpx.Response(202)

    monkeypatch.setattr(
        notify.httpx, "AsyncClient",
        lambda **kwargs: real_client(transport=httpx.MockTransport(_handler), **kwargs),
    )
    return sent


def test_sendgrid_sender_name_defaults_to_city_app_name(live_creds, monkeypatch):
    from app.services.city import get_city

    monkeypatch.setattr(get_settings(), "sendgrid_from_name", "")
    sent = _capture_sendgrid_from(monkeypatch)
    asyncio.run(notify.send_email(to=EMAIL, subject="s", text="t"))
    assert sent[0]["name"] == get_city().app_name


def test_sendgrid_sender_name_env_override_wins(live_creds, monkeypatch):
    monkeypatch.setattr(get_settings(), "sendgrid_from_name", "Custom Sender")
    sent = _capture_sendgrid_from(monkeypatch)
    asyncio.run(notify.send_email(to=EMAIL, subject="s", text="t"))
    assert sent[0]["name"] == "Custom Sender"

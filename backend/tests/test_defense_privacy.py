"""The defense store keeps numbers and keyed hashes, never resident data."""

from __future__ import annotations

from fastapi.testclient import TestClient

from app.config import get_settings
from app.defense import challenge, device, limits
from app.defense.keys import reset_keys
from tests.defense_support import fake_openai, use_store
from tests.test_intake import Intake

MARKER = "Zebra-Marker-4412"
PHONE = "5125550147"
EMAIL = "zebra.marker@example.org"


def test_defense_state_holds_no_resident_text(client, monkeypatch):
    """``client`` runs the app's startup (catalog); ``browser`` has its own cookie jar."""
    from app.main import app
    from app.services import catalog

    settings = get_settings()
    monkeypatch.setattr(settings, "challenge_provider", "pow")
    monkeypatch.setattr(settings, "defense_pow_bits", 6)
    monkeypatch.setattr(settings, "defense_new_token_warmup_seconds", 0)
    reset_keys()
    store, _ = use_store()
    fake_openai(monkeypatch, text=f"Echo {MARKER}", usage={"input_tokens": 50, "output_tokens": 5})

    # No Twilio/SendGrid credentials: the senders stub out, still metered.
    browser = TestClient(app)
    issued = browser.get("/api/v1/defense/challenge").json()
    counter = challenge.solve_pow(issued["nonce"], issued["difficulty"])
    token_body = {k: issued[k] for k in ("nonce", "difficulty", "expires_at", "sig")} | {"counter": str(counter)}
    assert browser.post("/api/v1/defense/token", json=token_body).status_code == 204
    token = device.parse(browser.cookies.get(device.COOKIE_NAME), store.now())

    intake = Intake(browser)
    intake.say(f"My name is {MARKER}, call me at {PHONE} or {EMAIL}")
    intake.say("I need food for 2 people")
    assert intake.post("results").status_code == 200
    sid = catalog.get_all_services(page=1, page_size=1)["items"][0].id
    for channel, to in (("sms", PHONE), ("email", EMAIL)):
        res = browser.post("/api/v1/intake/share", json={"channel": channel, "recipient": to, "service_ids": [sid]})
        assert res.status_code == 200, res.text

    assert any(k.startswith("use:sms:") for k in store.snapshot()["counters"])
    held = repr(store.snapshot()) + repr(limits._fallback_store.snapshot())
    assert any(k.startswith("use:") for k in store.snapshot()["counters"])  # the run was metered
    for secret in (MARKER, MARKER.lower(), PHONE, EMAIL, "testclient", token.id):
        assert secret not in held, secret
    reset_keys()

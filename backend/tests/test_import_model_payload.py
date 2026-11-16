"""Partner import: what the optional model step sends, and when it runs at all (issue #19).

The OpenAI client is replaced with a recorder; no network call is made.
"""

from __future__ import annotations

import json
from types import SimpleNamespace
from typing import Any

import pytest

from app.services.partner_import import model_step
from tests.import_support import FORBIDDEN, import_fixture, import_on  # noqa: F401  (import_on is a fixture)


class Recorder:
    def __init__(self, reply: Any) -> None:
        self.calls: list[dict[str, Any]] = []
        self.reply = reply
        self.responses = SimpleNamespace(create=self.create)

    async def create(self, **kwargs: Any) -> Any:
        self.calls.append(kwargs)
        rows = json.loads(kwargs["input"][0]["content"])["rows"]
        return SimpleNamespace(output_text=json.dumps({"rows": [self.reply(r) for r in rows]}))


def _reply(row: dict) -> dict:
    hours = None
    if row["hours_text"]:
        hours = {d: ("9:00 AM - 5:00 PM" if d in ("monday", "tuesday", "wednesday", "thursday", "friday") else None)
                 for d in model_step.DAYS}
    return {"ref": row["ref"], "hours": hours, "address": None, "categories": ["education"],
            "eligibility_requires": ["not_a_gate", "older_adult"] if "GED" in row["name"] else []}


@pytest.fixture
def live_model(import_on, monkeypatch: pytest.MonkeyPatch) -> Recorder:
    monkeypatch.setattr(import_on, "openai_api_key", "sk-test-not-real")
    monkeypatch.setattr(import_on, "demo_mode", False)
    monkeypatch.setattr(import_on, "import_use_model", True)
    recorder = Recorder(_reply)
    monkeypatch.setattr(model_step, "_openai_client", lambda: recorder)
    return recorder


@pytest.mark.parametrize("name", ["partners.csv", "partners.xlsx", "partners.docx"])
def test_model_request_carries_no_contact_details(client, live_model: Recorder, name: str) -> None:
    body = import_fixture(client, name, use_model=True)
    assert body["model"]["used"] is True
    assert live_model.calls, "the model step did not run"
    sent = json.dumps(live_model.calls)
    for value in FORBIDDEN + ["555-0142", "555-0175", "info@riverbendfood", "classes@northside", name]:
        assert value not in sent, value
    for call in live_model.calls:
        assert call["store"] is False
        assert call["text"]["format"]["strict"] is True
        assert "tools" not in call
        for row in json.loads(call["input"][0]["content"])["rows"]:
            assert set(row) == {"ref", "name", "provider_name", "description", "eligibility", "cost",
                                "category_text", "hours_text", "address_text"}


def test_model_suggestions_are_validated_and_marked(client, live_model: Recorder) -> None:
    body = import_fixture(client, "partners.csv", use_model=True)
    ged = next(d for d in body["drafts"] if d["service"]["name"] == "Adult GED Classes")
    assert ged["service"]["eligibility_requires"] == ["older_adult"]  # the unknown gate is dropped
    assert "eligibility_requires" in ged["suggestions"]
    assert "model_suggested" in {f["code"] for f in ged["flags"]}


def test_resident_identifiers_are_redacted_before_the_model(client, live_model: Recorder) -> None:
    from tests.import_support import default_table, drafts, inspect, proposed_params

    data = (b"Organization,Program,Description\n"
            b"Org A,Pantry,Groceries weekly. Bring ID; example SSN 123-45-6789\n"
            b"Org B,Clinic,Walk-in care\nOrg C,Clinic,x\nOrg D,Clinic,x\nOrg E,Clinic,x\n"
            b"Org F,Clinic,x\nOrg G,Clinic,x\nOrg H,Clinic,x\nOrg I,Clinic,x\nOrg J,Clinic,x\n"
            b"Org K,Clinic,x\nOrg L,Clinic,x\nOrg M,Clinic,x\nOrg N,Clinic,x\nOrg O,Clinic,x\n"
            b"Org P,Clinic,x\nOrg Q,Clinic,x\nOrg R,Clinic,x\nOrg S,Clinic,x\nOrg T,Clinic,x\nOrg U,Clinic,x\n")
    table = default_table(inspect(client, "list.csv", data=data).json())
    res = drafts(client, "list.csv", proposed_params(table, use_model=True), data=data)
    assert res.status_code == 200, res.text
    assert live_model.calls
    assert "123-45-6789" not in json.dumps(live_model.calls)


def test_no_client_is_built_when_the_model_step_is_off(client, import_on, monkeypatch: pytest.MonkeyPatch) -> None:
    def boom() -> None:
        raise AssertionError("the model client must not be constructed")

    monkeypatch.setattr(model_step, "_openai_client", boom)
    monkeypatch.setattr(import_on, "openai_api_key", "sk-test-not-real")
    monkeypatch.setattr(import_on, "demo_mode", False)
    monkeypatch.setattr(import_on, "import_use_model", False)
    body = import_fixture(client, "partners.csv", use_model=True)
    assert body["model"]["used"] is False
    assert "IMPORT_USE_MODEL" in body["model"]["note"]


def test_no_client_is_built_without_live_ai(client, import_on, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(model_step, "_openai_client", lambda: (_ for _ in ()).throw(AssertionError("no client")))
    monkeypatch.setattr(import_on, "import_use_model", True)  # DEMO_MODE stays on in tests
    body = import_fixture(client, "partners.csv", use_model=True)
    assert body["model"]["used"] is False
    assert "live AI" in body["model"]["note"]


def test_large_or_costly_runs_skip_the_model(monkeypatch: pytest.MonkeyPatch) -> None:
    import asyncio

    from app.config import get_settings
    from app.services.partner_import.to_drafts import RowDraft

    monkeypatch.setattr(model_step, "_openai_client", lambda: (_ for _ in ()).throw(AssertionError("no client")))
    rows = [RowDraft(row=i, cells=[], service={"name": f"P{i}", "provider_name": "Org"})
            for i in range(model_step.INLINE_MAX_ROWS + 1)]
    outcome = asyncio.run(model_step.suggest(rows, ["food"], get_settings()))
    assert not outcome.used and "in-request limit" in outcome.note
    settings = get_settings()
    monkeypatch.setattr(settings, "import_max_cost_usd", 0.0)
    outcome = asyncio.run(model_step.suggest(rows[:3], ["food"], settings))
    assert not outcome.used and "IMPORT_MAX_COST_USD" in outcome.note

"""Partner import: off by default, nothing written to disk, logs hold counts only (issue #19)."""

from __future__ import annotations

import logging
import tempfile

import pytest

from app.config import get_settings
from tests.import_support import (  # noqa: F401  (import_on is a fixture)
    FORBIDDEN,
    HEADERS,
    PREFIX,
    TOKEN,
    fixture_bytes,
    import_fixture,
    import_on,
)


@pytest.mark.parametrize("flags", [
    {"import_enabled": False, "job_backend": "inline", "admin_api_token": TOKEN},
    {"import_enabled": True, "job_backend": "off", "admin_api_token": TOKEN},
    {"import_enabled": True, "job_backend": "inline", "admin_api_token": ""},
])
def test_every_route_is_404_unless_fully_enabled(client, monkeypatch: pytest.MonkeyPatch, flags: dict) -> None:
    settings = get_settings()
    for key, value in flags.items():
        monkeypatch.setattr(settings, key, value)
    assert client.get(f"{PREFIX}/config").status_code == 404
    files = {"file": ("partners.csv", fixture_bytes("partners.csv"))}
    for route in ("inspect", "drafts"):
        assert client.post(f"{PREFIX}/{route}", headers=HEADERS, files=files).status_code == 404
    for route in ("validate", "export"):
        assert client.post(f"{PREFIX}/{route}", headers=HEADERS, json={"items": [{}]}).status_code == 404


def test_config_reports_the_limits(client, import_on) -> None:
    body = client.get(f"{PREFIX}/config").json()
    assert body["enabled"] is True
    assert body["accepted"] == [".xlsx", ".csv", ".docx"]
    assert body["max_file_mb"] == 4
    assert body["model_available"] is False  # tests run without live AI


def test_nothing_touches_a_temp_file(client, import_on, monkeypatch: pytest.MonkeyPatch) -> None:
    def refuse(*_args, **_kwargs):
        raise AssertionError("the import must not write the upload to a temporary file")

    for name in ("SpooledTemporaryFile", "NamedTemporaryFile", "TemporaryFile", "mkstemp", "mkdtemp"):
        monkeypatch.setattr(tempfile, name, refuse)
    for name in ("partners.csv", "partners.xlsx", "partners.docx"):
        assert import_fixture(client, name)["drafts"]


def test_logs_carry_no_file_name_or_cell_values(client, import_on, caplog: pytest.LogCaptureFixture) -> None:
    caplog.set_level(logging.DEBUG)
    body = import_fixture(client, "partners.xlsx")
    items = [{"service": d["service"], "provenance": d["provenance"]} for d in body["drafts"]]
    assert client.post(f"{PREFIX}/export", headers=HEADERS, json={"items": items}).status_code == 200
    log_text = caplog.text
    assert "partner import drafts built" in log_text
    assert "partners.xlsx" not in log_text
    for value in FORBIDDEN + ["Riverbend", "Hillside", "555-0142", "1200 E 7th"]:
        assert value not in log_text, value

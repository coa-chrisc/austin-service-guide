"""Shared helpers for the partner-list import tests (fixtures are synthetic)."""

from __future__ import annotations

import io
import json
import zipfile
from pathlib import Path
from typing import Any

import pytest

from app.config import get_settings

FIXTURES = Path(__file__).parent / "fixtures" / "import"
TOKEN = "import-test-token"
HEADERS = {"X-Admin-Token": TOKEN}
PREFIX = "/api/v1/admin/import"

# Values in the fixtures that must never reach a draft, a response or a model request.
CONTACT_NAMES = ["Jordan Fakename", "Avery Madeup", "Sam Notreal", "Casey Imaginary", "Priya Testperson"]
CELL_NUMBERS = ["555-0199", "555-0161", "555-0122", "555-0111", "555-0188"]
PERSONAL_EMAILS = ["avery.madeup@", "casey.i@"]
NOTES_TEXT = ["MOU renewal", "budget code", "Liaison retired", "director's cell", "opened last spring"]
FORBIDDEN = CONTACT_NAMES + CELL_NUMBERS + PERSONAL_EMAILS + NOTES_TEXT


def _fixture_source():
    # The folder is named "import" (a keyword), so load the generator by path.
    import importlib.util

    spec = importlib.util.spec_from_file_location("import_fixture_source", FIXTURES / "make_fixtures.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


_SOURCE = _fixture_source()
FIXTURE_HEADERS: list[str] = _SOURCE.HEADERS
FIXTURE_PARTNERS: list[list[str]] = _SOURCE.PARTNERS


def fixture_bytes(name: str) -> bytes:
    return (FIXTURES / name).read_bytes()


@pytest.fixture
def import_on(monkeypatch: pytest.MonkeyPatch):
    """Turn the feature on for one test (the scripted, no-AI settings stay)."""
    settings = get_settings()
    monkeypatch.setattr(settings, "import_enabled", True)
    monkeypatch.setattr(settings, "job_backend", "inline")
    monkeypatch.setattr(settings, "admin_api_token", TOKEN)
    return settings


def inspect(client, name: str, data: bytes | None = None, **fields: Any):
    payload = data if data is not None else fixture_bytes(name)
    return client.post(f"{PREFIX}/inspect", headers=HEADERS, files={"file": (name, payload)},
                       data={k: str(v) for k, v in fields.items()})


def proposed_params(table: dict[str, Any], **extra: Any) -> dict[str, Any]:
    mapping = {str(c["index"]): (c["field"] if c["action"] == "keep" else "drop") for c in table["columns"]}
    return {"table": table["id"], "header_row": table["header_row"], "mapping": mapping, **extra}


def drafts(client, name: str, params: dict[str, Any], data: bytes | None = None):
    payload = data if data is not None else fixture_bytes(name)
    return client.post(f"{PREFIX}/drafts", headers=HEADERS, files={"file": (name, payload)},
                       data={"params": json.dumps(params)})


def default_table(body: dict[str, Any]) -> dict[str, Any]:
    return next(t for t in body["tables"] if t["id"] == body["default_table"])


def import_fixture(client, name: str, **extra: Any) -> dict[str, Any]:
    """Inspect a fixture, confirm the proposed mapping, return the drafts response body."""
    res = inspect(client, name)
    assert res.status_code == 200, res.text
    out = drafts(client, name, proposed_params(default_table(res.json()), **extra))
    assert out.status_code == 200, out.text
    return out.json()


def rezip(data: bytes, add: dict[str, bytes] | None = None, replace: dict[str, bytes] | None = None,
          compression: int = zipfile.ZIP_DEFLATED) -> bytes:
    """Copy an Office zip, replacing or adding members."""
    add, replace = add or {}, replace or {}
    src = zipfile.ZipFile(io.BytesIO(data))
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression) as out:
        for info in src.infolist():
            out.writestr(info.filename, replace.get(info.filename, src.read(info.filename)))
        for name, body in add.items():
            out.writestr(name, body)
    return buf.getvalue()


def make_xlsx(rows: list[list[Any]], sheets: int = 1) -> bytes:
    import openpyxl

    wb = openpyxl.Workbook(write_only=True)
    for i in range(sheets):
        ws = wb.create_sheet(f"Sheet {i + 1}")
        for row in rows:
            ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()

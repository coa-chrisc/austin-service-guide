"""Partner import: size, row, sheet, column, cell and XML limits (issue #19)."""

from __future__ import annotations

import io
import zipfile

import pytest

from app.services.partner_import import limits as L
from app.services.partner_import.pipeline import parse_upload
from tests.import_support import (  # noqa: F401  (import_on is a fixture)
    HEADERS,
    PREFIX,
    fixture_bytes,
    import_on,
    inspect,
    make_xlsx,
    rezip,
)


def code_of(data: bytes, name: str) -> str:
    with pytest.raises(L.ImportRefused) as exc:
        parse_upload(data, name)
    return exc.value.code


def test_six_thousand_row_csv_is_refused() -> None:
    rows = "Organization,Program\n" + "".join(f"Org {i},Program {i}\n" for i in range(6000))
    assert code_of(rows.encode(), "list.csv") == L.TOO_MANY_ROWS


def test_six_thousand_row_sheet_is_refused() -> None:
    data = make_xlsx([["Organization", "Program"]] + [[f"Org {i}", "P"] for i in range(6000)])
    assert code_of(data, "list.xlsx") == L.TOO_MANY_ROWS


def test_more_than_twenty_sheets_is_refused() -> None:
    assert code_of(make_xlsx([["Organization", "Program"], ["A", "B"]], sheets=21), "list.xlsx") == L.ARCHIVE_LIMITS


def test_long_cells_are_cut_and_counted() -> None:
    data = f"Organization,Program\nOrg,{'x' * 5000}\n".encode()
    parsed = parse_upload(data, "list.csv")
    assert len(parsed.tables[0].rows[1][1][1]) == L.MAX_CELL_CHARS
    assert parsed.summary["truncated_cells"] == 1


def test_columns_past_sixty_are_ignored() -> None:
    header = ",".join(["Organization"] + [f"C{i}" for i in range(80)])
    parsed = parse_upload(f"{header}\nOrg{',x' * 80}\n".encode(), "list.csv")
    assert parsed.tables[0].width == L.MAX_COLUMNS
    assert parsed.summary["ignored_columns"]


def test_too_many_word_tables_is_refused() -> None:
    table = "<w:tbl><w:tr><w:tc><w:p><w:r><w:t>a</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>b</w:t></w:r></w:p></w:tc></w:tr></w:tbl>"
    doc = (
        '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/'
        f'wordprocessingml/2006/main"><w:body>{table * (L.MAX_WORD_TABLES + 1)}</w:body></w:document>'
    ).encode()
    data = rezip(fixture_bytes("partners.docx"), replace={"word/document.xml": doc})
    assert code_of(data, "list.docx") == L.ARCHIVE_LIMITS


def test_xlsx_entity_expansion_does_not_expand() -> None:
    data = make_xlsx([["Organization", "Program"], ["Org", "P"]])
    names = zipfile.ZipFile(io.BytesIO(data)).namelist()
    sheet = next(n for n in names if n.startswith("xl/worksheets/sheet"))
    bomb = (
        '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;&a;&a;">'
        '<!ENTITY c "&b;&b;&b;&b;&b;&b;&b;&b;&b;&b;">]>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'
        '<row r="1"><c r="A1" t="inlineStr"><is><t>&c;</t></is></c><c r="B1" t="inlineStr"><is><t>x</t></is></c></row>'
        "</sheetData></worksheet>"
    ).encode()
    with pytest.raises(L.ImportRefused) as exc:
        parse_upload(rezip(data, replace={sheet: bomb}), "list.xlsx")
    assert "aaaaaaaaaa" not in exc.value.message


def test_parse_deadline_is_enforced(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(L, "PARSE_SECONDS", -1.0)
    monkeypatch.setattr(L.Deadline.__init__, "__defaults__", (-1.0,))
    rows = "Organization,Program\n" + "".join(f"Org {i},P\n" for i in range(500))
    assert code_of(rows.encode(), "list.csv") == L.TOO_LARGE


def test_upload_over_the_body_cap_is_refused_before_parsing(client, import_on) -> None:
    big = b"a,b\n" + b"x" * (L.MAX_BODY_BYTES + 10)
    res = inspect(client, "list.csv", data=big)
    assert res.status_code == 422
    assert res.json()["code"] == L.TOO_LARGE


def test_import_max_rows_caps_drafts(client, import_on, monkeypatch: pytest.MonkeyPatch) -> None:
    from tests.import_support import default_table, drafts, proposed_params

    monkeypatch.setattr(import_on, "import_max_rows", 3)
    body = inspect(client, "partners.csv").json()
    res = drafts(client, "partners.csv", proposed_params(default_table(body)))
    assert res.status_code == 422
    assert res.json()["code"] == L.TOO_MANY_ROWS


def test_json_routes_have_their_own_cap(client, import_on) -> None:
    res = client.post(f"{PREFIX}/validate", headers={**HEADERS, "Content-Type": "application/json"},
                      content=b'{"items": [' + b" " * (L.MAX_JSON_BODY_BYTES + 1) + b"]}")
    assert res.status_code == 422
    assert res.json()["code"] == L.TOO_LARGE

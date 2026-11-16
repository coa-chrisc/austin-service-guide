"""Partner import: CSV, XLSX and DOCX parsing into plain text tables (issue #19)."""

from __future__ import annotations

import io
import zipfile

from app.services.partner_import.mapping import guess_header_row, headers_for
from app.services.partner_import.pipeline import parse_upload

from tests.import_support import FIXTURE_HEADERS as HEADERS, FIXTURE_PARTNERS as PARTNERS, fixture_bytes, make_xlsx, rezip


def body_rows(parsed) -> list[list[str]]:
    table = parsed.tables[0]
    start = guess_header_row(table)
    return [cells for _, cells in table.rows[start:]]


def test_three_formats_read_the_same_rows() -> None:
    for name in ("partners.csv", "partners.xlsx", "partners.docx"):
        parsed = parse_upload(fixture_bytes(name), name)
        table = parsed.tables[0]
        assert headers_for(table, guess_header_row(table)) == HEADERS, name
        assert body_rows(parsed) == [[c for c in row] for row in PARTNERS], name


def test_xlsx_merged_title_hidden_rows_sheets_and_comments() -> None:
    parsed = parse_upload(fixture_bytes("partners.xlsx"), "partners.xlsx")
    assert [t.name for t in parsed.tables] == ["Partners"]  # the hidden sheet is skipped
    table = parsed.tables[0]
    assert guess_header_row(table) == 2  # not the title merged across the header
    assert table.width == len(HEADERS)  # no phantom empty columns
    assert parsed.summary["hidden_sheets"] == 1
    assert parsed.summary["hidden_rows"] == 1
    assert parsed.summary["comments"] == 1
    assert all("Hidden Partner Org" not in cells for _, cells in table.rows)


def test_csv_with_bom_semicolons_and_blank_rows() -> None:
    text = "﻿\r\n;;\r\nOrganization;Program;Main Phone\r\nOrg A;Pantry;512-555-0100\r\n"
    parsed = parse_upload(text.encode("utf-8"), "list.csv")
    table = parsed.tables[0]
    assert headers_for(table, guess_header_row(table)) == ["Organization", "Program", "Main Phone"]
    assert table.rows[-1][1] == ["Org A", "Pantry", "512-555-0100"]


def test_cp1252_csv() -> None:
    data = "Organization,Program\r\nCaf\xe9 Comunidad,Despensa – Food\r\n".encode("cp1252")
    parsed = parse_upload(data, "list.csv")
    assert parsed.tables[0].rows[1][1] == ["Café Comunidad", "Despensa – Food"]


def test_formula_cells_are_never_evaluated() -> None:
    import openpyxl

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(["Organization", "Website", "Total"])
    ws.append(["Org A", '=HYPERLINK("http://evil.example","click")', "=1+1"])
    buf = io.BytesIO()
    wb.save(buf)  # openpyxl stores formulas with no cached value
    parsed = parse_upload(buf.getvalue(), "list.xlsx")
    assert parsed.tables[0].rows[1][1] == ["Org A"]  # formulas read as empty, never as text or results


def test_error_values_read_as_empty() -> None:
    data = make_xlsx([["Organization", "Phone"], ["Org A", "#N/A"]])
    assert parse_upload(data, "list.xlsx").tables[0].rows[1][1] == ["Org A"]


def _docx(body: str) -> bytes:
    base = fixture_bytes("partners.docx")
    doc = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
        f"{body}</w:body></w:document>"
    ).encode()
    return rezip(base, replace={"word/document.xml": doc})


def _tc(text: str, props: str = "") -> str:
    return f"<w:tc><w:tcPr>{props}</w:tcPr><w:p><w:r><w:t>{text}</w:t></w:r></w:p></w:tc>"


def test_docx_spans_vertical_merges_and_hidden_text() -> None:
    rows = (
        "<w:tr>" + _tc("Organization") + _tc("Program") + _tc("Phone") + "</w:tr>"
        "<w:tr>" + _tc("Org A", '<w:vMerge w:val="restart"/>') + _tc("Pantry") + _tc("512-555-0100") + "</w:tr>"
        "<w:tr>" + _tc("", "<w:vMerge/>") + _tc("Clinic") + _tc("512-555-0101") + "</w:tr>"
        '<w:tr>' + _tc("Org B", '<w:gridSpan w:val="2"/>') + _tc("512-555-0102") + "</w:tr>"
        "<w:tr>" + _tc("Org C") + "<w:tc><w:p><w:r><w:rPr><w:vanish/></w:rPr><w:t>secret</w:t></w:r>"
        "<w:r><w:t>Shown</w:t></w:r></w:p></w:tc>" + _tc("512-555-0103") + "</w:tr>"
    )
    parsed = parse_upload(_docx(f"<w:tbl>{rows}</w:tbl>"), "list.docx")
    cells = [c for _, c in parsed.tables[0].rows]
    assert cells[2] == ["Org A", "Clinic", "512-555-0101"]
    assert cells[3] == ["Org B", "", "512-555-0102"]
    assert cells[4] == ["Org C", "Shown", "512-555-0103"]


def test_docx_entity_declarations_are_refused_without_expansion() -> None:
    from app.services.partner_import import limits as L
    import pytest

    bomb = (
        '<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY lol "lol"><!ENTITY lol2 "&lol;&lol;&lol;&lol;">]>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>'
        "<w:tbl><w:tr><w:tc><w:p><w:r><w:t>&lol2;</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>"
    ).encode()
    data = rezip(fixture_bytes("partners.docx"), replace={"word/document.xml": bomb})
    with pytest.raises(L.ImportRefused):
        parse_upload(data, "list.docx")


def test_fixture_zip_is_well_formed() -> None:
    assert zipfile.ZipFile(io.BytesIO(fixture_bytes("partners.docx"))).testzip() is None

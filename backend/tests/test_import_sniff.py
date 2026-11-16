"""Partner import: file type by name and content, macros and zip bombs (issue #19)."""

from __future__ import annotations

import pytest

from app.services.partner_import import limits as L
from app.services.partner_import.sniff import sniff
from tests.import_support import fixture_bytes, rezip

OLE = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1" + b"\x00" * 600


def code_of(data: bytes, name: str) -> str:
    with pytest.raises(L.ImportRefused) as exc:
        sniff(data, name)
    return exc.value.code


@pytest.mark.parametrize("name", ["list.xlsx", "list.docx", "list.csv"])
def test_accepts_real_files(name: str) -> None:
    fixture = {"list.xlsx": "partners.xlsx", "list.docx": "partners.docx", "list.csv": "partners.csv"}[name]
    result = sniff(fixture_bytes(fixture), name)
    assert result.kind == name.rsplit(".", 1)[1]


@pytest.mark.parametrize("name,code", [
    ("list.xlsm", L.MACRO_CONTENT), ("list.docm", L.MACRO_CONTENT), ("list.xls", L.UNSUPPORTED_TYPE),
    ("list.doc", L.UNSUPPORTED_TYPE), ("list.xlsb", L.UNSUPPORTED_TYPE), ("list.ods", L.UNSUPPORTED_TYPE),
    ("list.txt", L.UNSUPPORTED_TYPE), ("list", L.UNSUPPORTED_TYPE),
])
def test_refuses_by_extension(name: str, code: str) -> None:
    assert code_of(fixture_bytes("partners.xlsx"), name) == code


def test_renamed_xls_is_refused_by_content() -> None:
    assert code_of(OLE, "list.xlsx") == L.UNSUPPORTED_TYPE
    assert code_of(OLE, "list.csv") == L.UNSUPPORTED_TYPE


def test_workbook_with_vba_project_is_refused() -> None:
    data = rezip(fixture_bytes("partners.xlsx"), add={"xl/vbaProject.bin": b"\x00" * 64})
    assert code_of(data, "list.xlsx") == L.MACRO_CONTENT


def test_macro_enabled_content_type_is_refused() -> None:
    data = fixture_bytes("partners.xlsx")
    import zipfile, io  # noqa: E401

    types = zipfile.ZipFile(io.BytesIO(data)).read("[Content_Types].xml").replace(
        b"spreadsheetml.sheet.main+xml", b"ms-excel.sheet.macroEnabled.main+xml")
    assert code_of(rezip(data, replace={"[Content_Types].xml": types}), "list.xlsx") == L.MACRO_CONTENT


def test_zip_bomb_member_is_refused() -> None:
    data = rezip(fixture_bytes("partners.xlsx"), add={"xl/media/pad.bin": b"\x00" * (20 * 1024 * 1024)})
    assert len(data) < L.MAX_FILE_BYTES
    assert code_of(data, "list.xlsx") == L.ARCHIVE_LIMITS


def test_total_uncompressed_size_is_capped() -> None:
    import zipfile

    from app.services.partner_import.sniff import _check_archive

    # Parts that each pass the ratio check (declared 40:1) but together expand past 50 MB.
    infos = []
    for i in range(6):
        info = zipfile.ZipInfo(f"xl/media/p{i}.bin")
        info.file_size, info.compress_size = 10 * 1024 * 1024, 256 * 1024
        infos.append(info)
    with pytest.raises(L.ImportRefused) as exc:
        _check_archive(infos)
    assert exc.value.code == L.ARCHIVE_LIMITS
    assert "expands" in exc.value.message
    _check_archive(infos[:4])  # 40 MB is fine


def test_too_many_zip_entries_is_refused() -> None:
    parts = {f"xl/x/{i}.xml": b"" for i in range(L.MAX_ZIP_ENTRIES + 1)}
    assert code_of(rezip(fixture_bytes("partners.xlsx"), add=parts), "list.xlsx") == L.ARCHIVE_LIMITS


def test_five_megabyte_file_is_too_large() -> None:
    assert code_of(b"a,b\n" + b"x" * (5 * 1024 * 1024), "list.csv") == L.TOO_LARGE


def test_word_document_named_xlsx_is_refused() -> None:
    assert code_of(fixture_bytes("partners.docx"), "list.xlsx") == L.UNSUPPORTED_TYPE


def test_workbook_named_csv_is_refused() -> None:
    assert code_of(fixture_bytes("partners.xlsx"), "list.csv") == L.UNSUPPORTED_TYPE


def test_binary_csv_is_refused() -> None:
    assert code_of(b"a,b\x00,c\n", "list.csv") == L.UNSUPPORTED_TYPE


def test_empty_file_has_no_table() -> None:
    assert code_of(b"", "list.csv") == L.NO_TABLE_FOUND

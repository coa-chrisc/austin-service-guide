"""Decide what an upload is from its name *and* its bytes, before any parser runs.

Office files are zip archives: the archive is opened in memory and its
directory checked against the entry, size and compression-ratio limits, the
expected main part and any macro project, so a parser never sees a zip bomb,
a renamed macro workbook or a legacy binary format.
"""

from __future__ import annotations

import io
import zipfile
from dataclasses import dataclass, field
from pathlib import PurePosixPath

from app.services.partner_import import limits as L
from app.services.partner_import.tables import require

ACCEPTED = {".csv": "csv", ".xlsx": "xlsx", ".docx": "docx"}
REFUSED = {
    ".xlsm": L.MACRO_CONTENT,
    ".xltm": L.MACRO_CONTENT,
    ".xlam": L.MACRO_CONTENT,
    ".docm": L.MACRO_CONTENT,
    ".dotm": L.MACRO_CONTENT,
    ".xls": L.UNSUPPORTED_TYPE,
    ".xlsb": L.UNSUPPORTED_TYPE,
    ".doc": L.UNSUPPORTED_TYPE,
    ".ods": L.UNSUPPORTED_TYPE,
    ".odt": L.UNSUPPORTED_TYPE,
}
_MAIN_PART = {
    "xlsx": ("xl/workbook.xml", "spreadsheetml.sheet.main+xml"),
    "docx": ("word/document.xml", "wordprocessingml.document.main+xml"),
}
_ZIP_MAGIC = b"PK\x03\x04"
_OLE_MAGIC = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"
# The ratio limit applies to members big enough to matter; tiny XML parts
# legitimately compress well and are covered by the total-size limit.
_RATIO_MIN_BYTES = 256 * 1024
_CONTENT_TYPES_MAX = 1024 * 1024


@dataclass
class Sniffed:
    kind: str
    archive: zipfile.ZipFile | None = None
    text: str | None = None  # decoded CSV text
    summary: dict[str, int] = field(default_factory=dict)


def _refuse_type(message: str) -> L.ImportRefused:
    return L.ImportRefused(L.UNSUPPORTED_TYPE, f"{message} {L.SAVE_AS_HINT}")


def sniff(data: bytes, file_name: str) -> Sniffed:
    ext = PurePosixPath(file_name.lower()).suffix
    if ext in REFUSED:
        code = REFUSED[ext]
        what = "can contain macros" if code == L.MACRO_CONTENT else "is not supported"
        raise L.ImportRefused(code, f"A {ext} file {what}. {L.SAVE_AS_HINT}")
    kind = ACCEPTED.get(ext)
    if kind is None:
        raise _refuse_type("Only .xlsx, .csv and .docx files can be imported.")
    if len(data) > L.MAX_FILE_BYTES:
        raise L.ImportRefused(L.TOO_LARGE, f"The file is over the {L.MAX_FILE_BYTES // (1024 * 1024)} MB limit.")
    if not data:
        raise L.ImportRefused(L.NO_TABLE_FOUND, "The file is empty.")
    if data.startswith(_OLE_MAGIC):
        raise _refuse_type("This is an older binary Office file (.xls or .doc) with a new extension.")

    if kind == "csv":
        if data.startswith(_ZIP_MAGIC):
            raise _refuse_type("This file is a zip archive (perhaps a workbook), not a CSV.")
        return Sniffed(kind, text=_decode_text(data))

    if not data.startswith(_ZIP_MAGIC):
        raise _refuse_type(f"The file is named {ext} but its content is not an Office document.")
    try:
        archive = zipfile.ZipFile(io.BytesIO(data))
        infos = archive.infolist()
    except (zipfile.BadZipFile, zipfile.LargeZipFile, ValueError, EOFError) as exc:
        raise _refuse_type("The file is not a readable Office document.") from exc
    summary = _check_archive(infos)
    _check_parts(archive, kind, ext)
    return Sniffed(kind, archive=archive, summary=summary)


def _decode_text(data: bytes) -> str:
    if b"\x00" in data:
        raise _refuse_type("The file is named .csv but contains binary data.")
    try:
        return data.decode("utf-8-sig")
    except UnicodeDecodeError:
        pass
    try:
        return data.decode("cp1252")
    except UnicodeDecodeError as exc:
        raise _refuse_type("The CSV is not readable text (UTF-8 or Windows-1252).") from exc


def _check_archive(infos: list[zipfile.ZipInfo]) -> dict[str, int]:
    if len(infos) > L.MAX_ZIP_ENTRIES:
        raise L.ImportRefused(L.ARCHIVE_LIMITS, f"The document has more than {L.MAX_ZIP_ENTRIES} internal parts.")
    total = 0
    summary = {"embedded_objects": 0, "external_links": 0}
    for info in infos:
        name = info.filename.lower()
        base = name.rsplit("/", 1)[-1]
        if base in ("vbaproject.bin", "vbaprojectsignature.bin", "vbadata.xml"):
            raise L.ImportRefused(L.MACRO_CONTENT, f"The document contains a macro project. {L.SAVE_AS_HINT}")
        total += info.file_size
        if total > L.MAX_UNCOMPRESSED_BYTES:
            raise L.ImportRefused(
                L.ARCHIVE_LIMITS,
                f"The document expands to more than {L.MAX_UNCOMPRESSED_BYTES // (1024 * 1024)} MB.",
            )
        if info.file_size > _RATIO_MIN_BYTES and info.file_size > L.MAX_COMPRESSION_RATIO * max(info.compress_size, 1):
            raise L.ImportRefused(L.ARCHIVE_LIMITS, "Part of the document is compressed more than 100:1 (a zip bomb).")
        if "/embeddings/" in name or "/activex/" in name:
            summary["embedded_objects"] += 1
        if "/externallinks/" in name:
            summary["external_links"] += 1
    return summary


def _check_parts(archive: zipfile.ZipFile, kind: str, ext: str) -> None:
    ET = require("defusedxml.ElementTree", "defusedxml")
    defused = require("defusedxml", "defusedxml")
    try:
        info = archive.getinfo("[Content_Types].xml")
    except KeyError as exc:
        raise _refuse_type(f"The file is named {ext} but is not an Office document.") from exc
    if info.file_size > _CONTENT_TYPES_MAX:
        raise L.ImportRefused(L.ARCHIVE_LIMITS, "The document's content-type list is too large.")
    try:
        root = ET.fromstring(archive.read(info))
    except (defused.DefusedXmlException, ET.ParseError, zipfile.BadZipFile, ValueError) as exc:
        raise _refuse_type("The document's structure could not be read safely.") from exc
    types = [
        (el.get("ContentType") or "") for el in root.iter()
        if el.tag.endswith("}Override") or el.tag.endswith("}Default")
    ]
    if any("macroenabled" in t.lower() or "vbaproject" in t.lower() for t in types):
        raise L.ImportRefused(L.MACRO_CONTENT, f"The document is macro-enabled. {L.SAVE_AS_HINT}")
    member, main_type = _MAIN_PART[kind]
    if member not in archive.namelist() or not any(t.endswith(main_type) for t in types):
        other = "docx" if kind == "xlsx" else "xlsx"
        if _MAIN_PART[other][0] in archive.namelist():
            raise _refuse_type(f"The file is named {ext} but is a .{other} document. Rename it and try again.")
        raise _refuse_type(f"The file is named {ext} but is not that kind of document.")

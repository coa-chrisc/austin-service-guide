"""Tables from a Word ``.docx`` with stdlib ``zipfile`` and ``defusedxml``.

Only ``word/document.xml`` is read, streamed, and only text inside tables is
kept. Deleted (tracked-change) text, field codes and hidden runs are skipped;
comments, headers, footers and embedded objects are never opened. A cell
spanning several grid columns is padded so columns stay aligned, and a
vertically merged cell repeats the value above it.
"""

from __future__ import annotations

import zipfile

from app.services.partner_import import limits as L
from app.services.partner_import.tables import ParsedTable, cell_text, require

_W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def _int(value: str | None, default: int = 1) -> int:
    try:
        return max(1, min(int(value or default), L.MAX_COLUMNS))
    except ValueError:
        return default


def _cell(tc) -> tuple[str, int, bool]:
    """(text, grid span, continues a vertical merge) for one ``w:tc``."""
    span, continues = 1, False
    props = tc.find(_W + "tcPr")
    if props is not None:
        grid = props.find(_W + "gridSpan")
        if grid is not None:
            span = _int(grid.get(_W + "val"))
        vmerge = props.find(_W + "vMerge")
        if vmerge is not None and vmerge.get(_W + "val") != "restart":
            continues = True
    parts: list[str] = []
    for p in tc.iter(_W + "p"):
        words: list[str] = []
        for run in p.iter(_W + "r"):
            rpr = run.find(_W + "rPr")
            if rpr is not None and rpr.find(_W + "vanish") is not None:
                continue
            for child in run:
                if child.tag == _W + "t":
                    words.append(child.text or "")
                elif child.tag in (_W + "tab", _W + "br", _W + "cr"):
                    words.append(" ")
        parts.append("".join(words))
    return cell_text(" ".join(parts)), span, continues


def parse_docx(archive: zipfile.ZipFile, summary: dict, deadline: L.Deadline) -> list[ParsedTable]:
    ET = require("defusedxml.ElementTree", "defusedxml")
    defused = require("defusedxml", "defusedxml")
    tables: list[ParsedTable] = []
    depth = 0
    body = None
    current: ParsedTable | None = None
    above: list[str] = []
    try:
        summary["comments"] = summary.get("comments", 0) + _count_comments(archive, ET)
        with archive.open("word/document.xml") as src:
            for event, el in ET.iterparse(src, events=("start", "end")):
                tag = el.tag
                if event == "start":
                    if tag == _W + "body":
                        body = el
                    elif tag == _W + "tbl":
                        depth += 1
                        if depth == 1:
                            if len(tables) >= L.MAX_WORD_TABLES:
                                raise L.ImportRefused(L.ARCHIVE_LIMITS, f"The document has more than {L.MAX_WORD_TABLES} tables.")
                            current = ParsedTable(id=f"table-{len(tables) + 1}", name=f"Table {len(tables) + 1}")
                            tables.append(current)
                            above = []
                    continue
                if tag == _W + "tbl":
                    depth -= 1
                elif tag == _W + "tr" and depth == 1 and current is not None:
                    row = _row(el, above, summary)
                    above = row
                    if any(row):
                        current.rows.append((len(current.rows) + 1, row))
                        if len(current.rows) > L.MAX_ROWS + 1:
                            raise L.ImportRefused(L.TOO_MANY_ROWS, f"A table has more than {L.MAX_ROWS:,} rows.")
                    el.clear()
                    if len(current.rows) % 200 == 0:
                        deadline.check()
                if depth == 0 and body is not None and tag in (_W + "p", _W + "tbl", _W + "sdt"):
                    del body[:]
                    deadline.check()
    except KeyError as exc:
        raise L.ImportRefused(L.UNSUPPORTED_TYPE, "The Word document has no main text part.") from exc
    except defused.DefusedXmlException as exc:
        raise L.ImportRefused(L.UNSUPPORTED_TYPE, "The document contains XML features that are not allowed (entity declarations).") from exc
    except ET.ParseError as exc:
        raise L.ImportRefused(L.UNSUPPORTED_TYPE, f"The Word document could not be read. {L.SAVE_AS_HINT}") from exc
    return [t for t in tables if t.rows]


def _row(tr, above: list[str], summary: dict) -> list[str]:
    row: list[str] = []
    for tc in tr.findall(_W + "tc"):
        text, span, continues = _cell(tc)
        col = len(row)
        if continues and not text and col < len(above):
            text = above[col]
        row.append(L.clip_cell(text, summary))
        row.extend([""] * (span - 1))
        if len(row) > L.MAX_COLUMNS:
            summary["ignored_columns"] = max(summary.get("ignored_columns", 0), 1)
            return row[: L.MAX_COLUMNS]
    return row


def _count_comments(archive: zipfile.ZipFile, ET) -> int:
    try:
        src = archive.open("word/comments.xml")
    except KeyError:
        return 0
    count = 0
    with src:
        for _, el in ET.iterparse(src, events=("end",)):
            if el.tag == _W + "comment":
                count += 1
                el.clear()
    return count

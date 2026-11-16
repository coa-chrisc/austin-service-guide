"""XLSX with openpyxl in read-only, cached-values-only mode.

``data_only=True`` returns the value Excel stored when the file was saved, so
a formula is never evaluated; a formula with no stored value reads as empty.
openpyxl parses XML through defusedxml when it is installed (it is a hard
requirement here), so entity-expansion payloads are refused, not expanded.

Read-only worksheets do not expose hidden rows or merged ranges, so one extra
streaming pass over each sheet's XML collects both: hidden rows are skipped
and counted, and a merged range repeats its top-left value across the range.
"""

from __future__ import annotations

import io
import zipfile

from app.services.partner_import import limits as L
from app.services.partner_import.tables import MissingDependency, ParsedTable, cell_text, require

_MAIN = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
_ERRORS = {"#N/A", "#VALUE!", "#REF!", "#DIV/0!", "#NUM!", "#NAME?", "#NULL!", "#SPILL!", "#CALC!", "#GETTING_DATA"}
_MAX_MERGES = 2_000


def parse_xlsx(data: bytes, archive: zipfile.ZipFile, summary: dict, deadline: L.Deadline) -> list[ParsedTable]:
    openpyxl = require("openpyxl", "openpyxl")
    defused = require("defusedxml", "defusedxml")
    if not getattr(openpyxl, "DEFUSEDXML", False) and not getattr(openpyxl, "LXML", False):
        raise MissingDependency("openpyxl is not using defusedxml; reinstall defusedxml before importing workbooks.")

    try:
        wb = openpyxl.load_workbook(
            io.BytesIO(data), read_only=True, data_only=True, keep_links=False, keep_vba=False
        )
    except defused.DefusedXmlException as exc:
        raise L.ImportRefused(L.UNSUPPORTED_TYPE, "The workbook contains XML features that are not allowed (entity declarations).") from exc
    except (L.ImportRefused, MissingDependency):
        raise
    except Exception as exc:  # noqa: BLE001 - hostile input: any reader failure is a refusal
        raise L.ImportRefused(L.UNSUPPORTED_TYPE, f"The workbook could not be read. {L.SAVE_AS_HINT}") from exc

    try:
        if len(wb.sheetnames) > L.MAX_SHEETS:
            raise L.ImportRefused(L.ARCHIVE_LIMITS, f"The workbook has more than {L.MAX_SHEETS} sheets.")
        summary["comments"] = summary.get("comments", 0) + _count_comments(archive, deadline)
        tables: list[ParsedTable] = []
        for index, ws in enumerate(wb.worksheets, start=1):
            deadline.check()
            if getattr(ws, "sheet_state", "visible") != "visible":
                summary["hidden_sheets"] = summary.get("hidden_sheets", 0) + 1
                continue
            table = _read_sheet(ws, index, archive, summary, deadline)
            if table.rows:
                tables.append(table)
        return tables
    except (L.ImportRefused, MissingDependency):
        raise
    except defused.DefusedXmlException as exc:
        raise L.ImportRefused(L.UNSUPPORTED_TYPE, "The workbook contains XML features that are not allowed (entity declarations).") from exc
    except Exception as exc:  # noqa: BLE001
        raise L.ImportRefused(L.UNSUPPORTED_TYPE, f"The workbook could not be read. {L.SAVE_AS_HINT}") from exc
    finally:
        wb.close()


def _read_sheet(ws, index: int, archive: zipfile.ZipFile, summary: dict, deadline: L.Deadline) -> ParsedTable:
    hidden, merges = _sheet_layout(archive, getattr(ws, "_worksheet_path", None), deadline)
    # The <dimension> tag is untrusted; without it rows are read as stored.
    ws.reset_dimensions()
    rows: dict[int, list[str]] = {}
    widest = 0
    for row_no, values in enumerate(ws.iter_rows(min_row=1, max_col=L.MAX_COLUMNS + 1, values_only=True), start=1):
        if row_no % 500 == 0:
            deadline.check()
        if not values or all(v is None for v in values):
            continue
        cells = [_value(v) for v in values]
        while cells and not cells[-1]:
            cells.pop()
        if len(cells) > L.MAX_COLUMNS:
            if any(cells[L.MAX_COLUMNS:]):
                summary["ignored_columns"] = max(summary.get("ignored_columns", 0), 1)
            cells = cells[: L.MAX_COLUMNS]
        if not any(cells):
            continue
        if row_no in hidden:
            summary["hidden_rows"] = summary.get("hidden_rows", 0) + 1
            continue
        rows[row_no] = [L.clip_cell(c, summary) for c in cells]
        widest = max(widest, len(cells))
        if len(rows) > L.MAX_ROWS + 1:
            raise L.ImportRefused(L.TOO_MANY_ROWS, f"A sheet has more than {L.MAX_ROWS:,} rows.")
    _fill_merges(rows, merges)
    return ParsedTable(id=f"sheet-{index}", name=ws.title[:120], rows=[(n, rows[n]) for n in sorted(rows)])


def _value(value) -> str:
    text = cell_text(value)
    return "" if text in _ERRORS else text


def _fill_merges(rows: dict[int, list[str]], merges: list[tuple[int, int, int, int]]) -> None:
    for min_col, min_row, max_col, max_row in merges:
        top = rows.get(min_row)
        if top is None or min_col > len(top):
            continue
        value = top[min_col - 1]
        if not value:
            continue
        for r in range(min_row, max_row + 1):
            row = rows.get(r)
            if row is None:
                continue
            for c in range(min_col, min(max_col, L.MAX_COLUMNS) + 1):
                while len(row) < c:
                    row.append("")
                if not row[c - 1]:
                    row[c - 1] = value


def _sheet_layout(archive: zipfile.ZipFile, path: str | None, deadline: L.Deadline):
    """Hidden row numbers and merged ranges ``(min_col, min_row, max_col, max_row)``."""
    hidden: set[int] = set()
    merges: list[tuple[int, int, int, int]] = []
    if not path:
        return hidden, merges
    ET = require("defusedxml.ElementTree", "defusedxml")
    from openpyxl.utils.cell import range_boundaries

    try:
        src = archive.open(path.lstrip("/"))
    except KeyError:
        return hidden, merges
    with src:
        parent = None
        seen = 0
        for event, el in ET.iterparse(src, events=("start", "end")):
            if event == "start":
                if el.tag == _MAIN + "sheetData":
                    parent = el
                continue
            if el.tag == _MAIN + "row":
                seen += 1
                if el.get("hidden") in ("1", "true") and (el.get("r") or "").isdigit():
                    hidden.add(int(el.get("r")))
                if parent is not None and seen % 1000 == 0:
                    del parent[:]
                    deadline.check()
            elif el.tag == _MAIN + "mergeCell" and len(merges) < _MAX_MERGES:
                try:
                    bounds = range_boundaries(el.get("ref") or "")
                except (ValueError, TypeError):
                    continue
                if all(isinstance(b, int) for b in bounds) and bounds[3] - bounds[1] <= L.MAX_ROWS:
                    merges.append(bounds)
    return hidden, merges


def _count_comments(archive: zipfile.ZipFile, deadline: L.Deadline) -> int:
    ET = require("defusedxml.ElementTree", "defusedxml")
    count = 0
    for name in archive.namelist():
        lower = name.lower()
        if not (lower.startswith("xl/comments") and lower.endswith(".xml")):
            continue
        with archive.open(name) as src:
            for _, el in ET.iterparse(src, events=("end",)):
                if el.tag == _MAIN + "comment":
                    count += 1
                    el.clear()
        deadline.check()
    return count

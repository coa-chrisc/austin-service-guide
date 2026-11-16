"""CSV with the stdlib ``csv`` module: delimiter sniffed, nothing evaluated."""

from __future__ import annotations

import csv
import io
import re

from app.services.partner_import import limits as L
from app.services.partner_import.tables import ParsedTable, cell_text

_DELIMITERS = ",;\t|"
_SNIFF_CHARS = 16 * 1024


class _Excel(csv.excel):
    pass


def _dialect(text: str) -> type[csv.Dialect] | csv.Dialect:
    # Blank and separator-only lines (";;", ",,,") above the table mislead the
    # sniffer, so it only sees lines with some text in them.
    lines = [line for line in text[:_SNIFF_CHARS].splitlines() if re.search(r"\w", line)][:50]
    try:
        return csv.Sniffer().sniff("\n".join(lines), delimiters=_DELIMITERS)
    except csv.Error:
        first = lines[0] if lines else ""
        best = max(_DELIMITERS, key=first.count)
        if first.count(best) == 0:
            return csv.excel
        dialect = type("_Sniffed", (_Excel,), {"delimiter": best})
        return dialect


def parse_csv(text: str, summary: dict, deadline: L.Deadline) -> list[ParsedTable]:
    table = ParsedTable(id="csv", name="CSV")
    reader = csv.reader(io.StringIO(text, newline=""), dialect=_dialect(text))
    data_rows = 0
    try:
        for line_no, cells in enumerate(reader, start=1):
            if line_no % 200 == 0:
                deadline.check()
            if len(cells) > L.MAX_COLUMNS:
                summary["ignored_columns"] = max(summary.get("ignored_columns", 0), len(cells) - L.MAX_COLUMNS)
                cells = cells[: L.MAX_COLUMNS]
            row = [L.clip_cell(cell_text(c), summary) for c in cells]
            if not any(row):
                continue
            data_rows += 1
            if data_rows > L.MAX_ROWS + 1:  # one header row on top of the limit
                raise L.ImportRefused(L.TOO_MANY_ROWS, f"The file has more than {L.MAX_ROWS:,} rows.")
            table.rows.append((line_no, row))
    except csv.Error as exc:
        raise L.ImportRefused(L.NO_TABLE_FOUND, "The CSV could not be read as a table (a field may be too long or badly quoted).") from exc
    return [table] if table.rows else []

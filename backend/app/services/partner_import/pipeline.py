"""The import steps in order: parse an upload, inspect it, build drafts.

``parse_upload`` and ``inspect`` make no model call. ``build_drafts`` is the
job body: it takes the parsed file and the confirmed parameters and returns
the reviewable drafts. Nothing here stores anything; the bytes, the parsed
table and the reduced table live only for the request that carries them.
"""

from __future__ import annotations

from typing import Any

from starlette.concurrency import run_in_threadpool

from app.config import Settings
from app.services import city
from app.services.partner_import import limits as L
from app.services.partner_import.filters import clean_text
from app.services.partner_import.finalize import finalize
from app.services.partner_import.guard import check_file, check_header_row
from app.services.partner_import.mapping import (
    DROP,
    FIELDS,
    classify,
    column_letter,
    data_rows,
    guess_header_row,
    headers_for,
)
from app.services.partner_import.pack_context import get_context
from app.services.partner_import.parse_csv import parse_csv
from app.services.partner_import.parse_docx import parse_docx
from app.services.partner_import.parse_xlsx import parse_xlsx
from app.services.partner_import.sniff import sniff
from app.services.partner_import.tables import ParsedFile, ParsedTable, sanitize_file_name
from app.services.partner_import.to_drafts import build_row, reduce_table

HIDDEN = "[hidden]"
_PREVIEW_CHARS = 200
_SUMMARY_NOTES = {
    "hidden_sheets": "hidden sheet(s) ignored",
    "hidden_rows": "hidden row(s) ignored",
    "comments": "cell comment(s) ignored",
    "truncated_cells": f"cell(s) cut to {L.MAX_CELL_CHARS:,} characters",
    "embedded_objects": "embedded object(s) ignored",
    "external_links": "external link part(s) ignored",
}


def parse_upload(data: bytes, file_name: str) -> ParsedFile:
    """Sniff, parse and guard. Raises ``ImportRefused`` with a safe message."""
    deadline = L.Deadline()
    raw_name = (file_name or "").replace("\\", "/").rsplit("/", 1)[-1]
    sniffed = sniff(data, raw_name)
    summary: dict[str, int] = dict(sniffed.summary)
    try:
        if sniffed.kind == "csv":
            tables = parse_csv(sniffed.text or "", summary, deadline)
        elif sniffed.kind == "xlsx":
            tables = parse_xlsx(data, sniffed.archive, summary, deadline)
        else:
            tables = parse_docx(sniffed.archive, summary, deadline)
    finally:
        if sniffed.archive is not None:
            sniffed.archive.close()
    tables = [t for t in tables if t.rows]
    if not tables:
        raise L.ImportRefused(L.NO_TABLE_FOUND, "No table with data was found in the file.")
    parsed = ParsedFile(kind=sniffed.kind, file_name=sanitize_file_name(raw_name), tables=tables, summary=summary)
    check_file(parsed, deadline)
    return parsed


def _summary_notes(summary: dict[str, int]) -> list[str]:
    notes = [f"{summary[k]:,} {text}" for k, text in _SUMMARY_NOTES.items() if summary.get(k)]
    if summary.get("ignored_columns"):
        notes.append(f"Columns beyond the first {L.MAX_COLUMNS} were ignored.")
    return notes


def _columns(table: ParsedTable, header_row: int) -> list[dict[str, Any]]:
    out = []
    for i, header in enumerate(headers_for(table, header_row)):
        verdict = classify(header)
        out.append({"index": i, "letter": column_letter(i), "header": header, **verdict})
    return out


def _preview(table: ParsedTable, header_row: int, columns: list[dict[str, Any]]) -> list[dict[str, Any]]:
    rows = []
    for row_no, cells in data_rows(table, header_row)[: L.PREVIEW_ROWS]:
        shown = []
        for col, cell in zip(columns, cells):
            if not cell:
                shown.append("")
            elif col["sensitive"]:
                shown.append(HIDDEN)
            else:
                shown.append(clean_text(cell[:_PREVIEW_CHARS], set()))
        rows.append({"row": row_no, "cells": shown})
    return rows


def _check_header_row(table: ParsedTable, header_row: Any) -> int:
    if not isinstance(header_row, int) or isinstance(header_row, bool) or not 1 <= header_row <= min(len(table.rows), L.HEADER_PICK_ROWS):
        raise L.ImportRefused(L.BAD_REQUEST, "The header row must be one of the first rows of the table.")
    return header_row


def inspect(parsed: ParsedFile, table_id: str | None = None, header_row: int | None = None) -> dict[str, Any]:
    """Phase 1: per table the header guess, columns with a proposed mapping, and a masked preview."""
    tables = []
    for table in parsed.tables:
        chosen = header_row if table.id == table_id and header_row is not None else guess_header_row(table)
        chosen = _check_header_row(table, chosen)
        # A client header row never gets a preview, whoever chose it.
        check_header_row(headers_for(table, chosen))
        columns = _columns(table, chosen)
        tables.append({
            "id": table.id,
            "name": table.name,
            "header_row": chosen,
            "header_choices": [
                {"row": i, "source_row": table.rows[i - 1][0]} for i in range(1, min(len(table.rows), L.HEADER_SCAN_ROWS) + 1)
            ],
            "row_count": max(len(table.rows) - chosen, 0),
            "columns": columns,
            "preview": _preview(table, chosen, columns),
        })
    default = max(parsed.tables, key=lambda t: len(t.rows)).id
    return {
        "file_name": parsed.file_name,
        "kind": parsed.kind,
        "tables": tables,
        "default_table": table_id if parsed.table(table_id or "") else default,
        "notes": _summary_notes(parsed.summary),
        "fields": [{"value": k, "label": v} for k, v in FIELDS.items()],
    }


def _mapping(raw: Any, width: int) -> dict[int, str]:
    if not isinstance(raw, dict):
        raise L.ImportRefused(L.BAD_REQUEST, "The column mapping is missing.")
    mapping: dict[int, str] = {}
    for key, value in raw.items():
        try:
            index = int(key)
        except (TypeError, ValueError):
            raise L.ImportRefused(L.BAD_REQUEST, "The column mapping has a bad column index.") from None
        if not 0 <= index < width or (value != DROP and value not in FIELDS):
            raise L.ImportRefused(L.BAD_REQUEST, "The column mapping names an unknown column or field.")
        if value != DROP:
            mapping[index] = value
    if not {"name", "provider_name"} & set(mapping.values()):
        raise L.ImportRefused(L.BAD_REQUEST, "Map a column to the organisation or the service name before building drafts.")
    return mapping


def _rows(parsed: ParsedFile, params: dict[str, Any], settings: Settings) -> dict[str, Any]:
    table = parsed.table(str(params.get("table") or ""))
    if table is None:
        raise L.ImportRefused(L.BAD_REQUEST, "Choose a sheet or table to import.")
    header_row = _check_header_row(table, params.get("header_row"))
    headers = headers_for(table, header_row)
    check_header_row(headers)
    mapping = _mapping(params.get("mapping"), len(headers))

    reduced = reduce_table(table, header_row, mapping)
    max_rows = max(1, min(settings.import_max_rows, L.MAX_ROWS))
    if len(reduced) > max_rows:
        raise L.ImportRefused(
            L.TOO_MANY_ROWS, f"The table has {len(reduced):,} rows; this server imports at most {max_rows:,}."
        )
    ctx = get_context()
    default_state = getattr(city.get_city(), "state", "") or ""
    rows = [r for r in (build_row(row, ctx.categories, default_state) for row in reduced) if r is not None]
    return {"table": table, "header_row": header_row, "headers": headers, "mapping": mapping,
            "reduced": len(reduced), "rows": rows, "ctx": ctx}


async def build_drafts(parsed: ParsedFile, params: dict[str, Any], settings: Settings) -> dict[str, Any]:
    """Phase 2 (the job body): confirmed mapping to drafts. Model step only when asked and allowed."""
    built = await run_in_threadpool(_rows, parsed, params, settings)
    rows, ctx, table = built["rows"], built["ctx"], built["table"]

    model: dict[str, Any] = {"requested": bool(params.get("use_model")), "used": False, "note": ""}
    if model["requested"]:
        if not settings.import_use_model:
            model["note"] = "The model step is turned off on this server (IMPORT_USE_MODEL)."
        elif not settings.use_live_ai:
            model["note"] = "The model step needs live AI (an API key and DEMO_MODE off)."
        elif rows:
            from app.services.partner_import.model_step import suggest

            outcome = await suggest(rows, ctx.category_slugs, settings)
            model.update(used=outcome.used, note=outcome.note, estimated_usd=outcome.estimated_usd)

    provenance = {"source": "upload", "file_name": parsed.file_name, "sheet": table.name}
    result = await run_in_threadpool(finalize, rows, ctx, provenance, params.get("group", True) is not False)
    result.update({
        "file_name": parsed.file_name,
        "table": {"id": table.id, "name": table.name, "header_row": built["header_row"]},
        "mapped_columns": [{"index": i, "header": built["headers"][i], "field": f} for i, f in sorted(built["mapping"].items())],
        "rows_read": built["reduced"],
        "rows_skipped": built["reduced"] - len(rows),
        "notes": _summary_notes(parsed.summary),
        "model": model,
    })
    return result

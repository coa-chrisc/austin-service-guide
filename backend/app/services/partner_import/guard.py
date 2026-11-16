"""Client-record guard: refuse files that look like records about residents.

This tool is for lists of organisations. A file with a row, among those a
user could pick as the header, naming resident identifiers (DOB, SSN, Case #,
Diagnosis, ...) or whose rows carry SSN or
date-of-birth values in more than 5% of rows is refused whole, before any
mapping, model call or draft. The log line records counts only.
"""

from __future__ import annotations

import logging

from app.services.partner_import import limits as L
from app.services.partner_import.mapping import guess_header_row, normalize_header
from app.services.partner_import.tables import ParsedFile
from app.services.pii import redact

log = logging.getLogger(__name__)

_PHRASES = {
    "client", "clients", "client name", "client id", "client #", "client number", "patient", "patient name",
    "patient id", "dob", "d o b", "date of birth", "birth date", "birthdate", "birthday", "ssn", "social security",
    "social security number", "social security #", "ss#", "ss #", "case", "case #", "case number", "case no", "case id",
    "household size", "hh size", "diagnosis", "diagnoses", "medicaid id", "medicaid number", "medicaid #",
    "medicare id", "member id", "mrn", "medical record number", "resident name", "applicant name",
}
_TOKENS = {"ssn", "dob", "diagnosis", "diagnoses", "mrn"}
_CLIENT_NEXT = {"name", "id", "number", "no", "#", "dob", "address", "phone", "first", "last", "birth", "birthday", "age"}
_VALUE_SHARE = 0.05
_PERSON_PREFIX = {"client", "patient", "resident", "applicant"}
# Headers are short. In rows that are neither the first row nor the guessed
# header, longer cells are prose ("Free diagnosis and treatment for ...").
_PROSE_TOKENS = 5


def _label(cell: str, *, short_only: bool = False) -> tuple[str, bool] | None:
    """``(label, exact)`` when the cell reads as a resident-record header.

    The label comes from the rule vocabulary, never from the cell, so a
    refusal message can name it without quoting the file.
    """
    norm = normalize_header(cell)
    if not norm or (short_only and len(norm.split()) > _PROSE_TOKENS):
        return None
    if norm in _PHRASES:
        return norm, True
    tokens = norm.split()
    hit = sorted(set(tokens) & _TOKENS)
    if hit:
        return hit[0], False
    if len(tokens) >= 2 and tokens[0] in _PERSON_PREFIX and tokens[1] in _CLIENT_NEXT:
        return f"{tokens[0]} {tokens[1]}", False
    return None


def _row_labels(cells: list[str], *, header_like: bool) -> list[str]:
    """Labels for one row. A row that is not the first or the guessed header
    counts only with an exact header phrase or two matches, so a data cell
    such as "Client name required" or "SSN 123-45-6789" alone does not."""
    found = [hit for hit in (_label(c, short_only=not header_like) for c in cells) if hit]
    if header_like or any(exact for _, exact in found) or len(found) >= 2:
        return [label for label, _ in found]
    return []


def _refuse(labels: list[str], value_rows: int = 0, total_rows: int = 0) -> None:
    found: list[str] = []
    if labels:
        found.append("columns that name resident details (" + ", ".join(sorted(set(labels))[:5]) + ")")
    if value_rows:
        found.append(f"{value_rows} of {total_rows} rows containing SSN or date-of-birth values")
    raise L.ImportRefused(
        L.LOOKS_LIKE_CLIENT_RECORDS,
        "This file looks like records about residents: it has " + " and ".join(found) + ". "
        "This tool is for lists of organisations only. Nothing from the file was kept.",
    )


def check_file(parsed: ParsedFile, deadline: L.Deadline) -> None:
    """Raise ``looks_like_client_records`` when any table looks like resident records."""
    labels: list[str] = []
    value_rows = 0
    total_rows = 0
    for table in parsed.tables:
        # Every row a user can pick as the header: banner rows above a client
        # header can push the guess onto a data row.
        header_like = {1, guess_header_row(table)}
        for index, (_, cells) in enumerate(table.rows[: L.HEADER_PICK_ROWS], start=1):
            labels.extend(_row_labels(cells, header_like=index in header_like))
        for i, (_, cells) in enumerate(table.rows):
            if i % 500 == 0:
                deadline.check()
            text = " | ".join(c for c in cells if c)
            if not text:
                continue
            total_rows += 1
            if redact(text, kinds=("ssn", "dob")).types:
                value_rows += 1
    too_many_values = total_rows > 0 and value_rows / total_rows > _VALUE_SHARE
    if not labels and not too_many_values:
        return
    log.warning(
        "partner import refused by the client-record guard: %d header match(es), %d of %d rows with SSN/DOB patterns",
        len(labels), value_rows, total_rows,
    )
    _refuse(labels, value_rows if too_many_values else 0, total_rows)


def check_header_row(headers: list[str]) -> None:
    """A header row chosen by the user (inspect or confirm) gets the full header rule."""
    labels = _row_labels(headers, header_like=True)
    if not labels:
        return
    log.warning("partner import refused by the client-record guard: %d header match(es) in the chosen header row", len(labels))
    _refuse(labels)

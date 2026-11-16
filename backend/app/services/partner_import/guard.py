"""Client-record guard: refuse files that look like records about residents.

This tool is for lists of organisations. A file whose headers name resident
identifiers (DOB, SSN, Case #, Diagnosis, ...) or whose rows carry SSN or
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


def _header_hit(header: str) -> bool:
    norm = normalize_header(header)
    if not norm:
        return False
    if norm in _PHRASES:
        return True
    tokens = norm.split()
    if set(tokens) & _TOKENS:
        return True
    return len(tokens) >= 2 and tokens[0] in {"client", "patient", "resident", "applicant"} and tokens[1] in _CLIENT_NEXT


def check_file(parsed: ParsedFile, deadline: L.Deadline) -> None:
    """Raise ``looks_like_client_records`` when any table looks like resident records."""
    header_hits: list[str] = []
    value_rows = 0
    total_rows = 0
    for table in parsed.tables:
        # The first row and the guessed header row: data cells such as
        # "Medicaid accepted" must not trip a header rule.
        for index in {1, guess_header_row(table)}:
            if index <= len(table.rows):
                header_hits.extend(c for c in table.rows[index - 1][1] if _header_hit(c))
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
    if not header_hits and not too_many_values:
        return
    log.warning(
        "partner import refused by the client-record guard: %d header match(es), %d of %d rows with SSN/DOB patterns",
        len(header_hits), value_rows, total_rows,
    )
    found: list[str] = []
    if header_hits:
        names = sorted({h[:40] for h in header_hits})[:5]
        found.append("columns that name resident details (" + ", ".join(names) + ")")
    if too_many_values:
        found.append(f"{value_rows} of {total_rows} rows containing SSN or date-of-birth values")
    raise L.ImportRefused(
        L.LOOKS_LIKE_CLIENT_RECORDS,
        "This file looks like records about residents: it has " + " and ".join(found) + ". "
        "This tool is for lists of organisations only. Nothing from the file was kept.",
    )


def check_header_row(headers: list[str]) -> None:
    """The header row the user chose at confirm time gets the same header rule."""
    hits = [h for h in headers if _header_hit(h)]
    if not hits:
        return
    log.warning("partner import refused by the client-record guard: %d header match(es) in the chosen header row", len(hits))
    names = ", ".join(sorted({h[:40] for h in hits})[:5])
    raise L.ImportRefused(
        L.LOOKS_LIKE_CLIENT_RECORDS,
        f"This file looks like records about residents: it has columns that name resident details ({names}). "
        "This tool is for lists of organisations only. Nothing from the file was kept.",
    )

"""Limits, refusal codes and the parse time budget for partner-list imports."""

from __future__ import annotations

import time

MAX_FILE_BYTES = 4 * 1024 * 1024  # under Vercel's 4.5 MB request cap
# Whole request body: the file plus multipart framing and the small JSON
# fields that travel with it.
MAX_BODY_BYTES = MAX_FILE_BYTES + 256 * 1024
# JSON bodies (validate / merge / export) carry drafts, never the file.
MAX_JSON_BODY_BYTES = 4 * 1024 * 1024

PARSE_SECONDS = 20.0
MAX_ZIP_ENTRIES = 2_000
MAX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024
MAX_COMPRESSION_RATIO = 100
MAX_SHEETS = 20
MAX_ROWS = 5_000
MAX_COLUMNS = 60
MAX_CELL_CHARS = 2_000
MAX_WORD_TABLES = 50
PREVIEW_ROWS = 5
HEADER_SCAN_ROWS = 10
# Rows a user may choose as the header row; the client-record guard checks all of them.
HEADER_PICK_ROWS = HEADER_SCAN_ROWS * 2

# Error codes a refused file can carry (422 {code, message}).
UNSUPPORTED_TYPE = "unsupported_type"
MACRO_CONTENT = "macro_content"
TOO_LARGE = "too_large"
TOO_MANY_ROWS = "too_many_rows"
ARCHIVE_LIMITS = "archive_limits"
LOOKS_LIKE_CLIENT_RECORDS = "looks_like_client_records"
NO_TABLE_FOUND = "no_table_found"
# Not a file refusal: the confirm step's parameters are wrong.
BAD_REQUEST = "bad_request"

SAVE_AS_HINT = "Save the file as .xlsx or .csv (or a Word .docx with a table) and upload it again."


class ImportRefused(Exception):
    """The upload is refused. ``message`` is safe to show: it never quotes cell values."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


class Deadline:
    """Cooperative time budget: parsers call ``check()`` as they go."""

    def __init__(self, seconds: float = PARSE_SECONDS) -> None:
        self.seconds = seconds
        self._end = time.monotonic() + seconds

    def check(self) -> None:
        if time.monotonic() > self._end:
            raise ImportRefused(
                TOO_LARGE,
                f"The file could not be read within {int(self.seconds)} seconds. "
                "Split it into smaller files or remove unused sheets.",
            )


def clip_cell(text: str, summary: dict) -> str:
    """Truncate one cell to ``MAX_CELL_CHARS``, counting truncations in ``summary``."""
    if len(text) > MAX_CELL_CHARS:
        summary["truncated_cells"] = summary.get("truncated_cells", 0) + 1
        return text[:MAX_CELL_CHARS]
    return text

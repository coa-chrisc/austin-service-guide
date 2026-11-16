"""Plain data shapes shared by the parsers, the matcher and the draft builder."""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any


class MissingDependency(RuntimeError):
    """An optional parser library is not installed on this server."""


def require(module: str, package: str) -> Any:
    """Import an optional parser dependency or fail with a message naming it."""
    import importlib

    try:
        return importlib.import_module(module)
    except ImportError as exc:  # pragma: no cover - exercised only on a bare install
        raise MissingDependency(
            f"Reading this file type needs the {package!r} package, which is not installed "
            f"on this server. Install it (pip install {package}) or upload a .csv file."
        ) from exc


@dataclass
class ParsedTable:
    """One sheet or Word table: rows of stripped text, with their source row numbers."""

    id: str
    name: str
    rows: list[tuple[int, list[str]]] = field(default_factory=list)

    @property
    def width(self) -> int:
        return max((len(cells) for _, cells in self.rows), default=0)


@dataclass
class ParsedFile:
    kind: str  # csv | xlsx | docx
    file_name: str
    tables: list[ParsedTable]
    summary: dict[str, int] = field(default_factory=dict)

    def table(self, table_id: str) -> ParsedTable | None:
        return next((t for t in self.tables if t.id == table_id), None)


_CONTROL_RE = re.compile(r"[\x00-\x1f\x7f-\x9f]")


def sanitize_file_name(name: str | None) -> str:
    """Basename only, control characters removed, at most 120 characters."""
    raw = (name or "").replace("\\", "/").rsplit("/", 1)[-1]
    clean = _CONTROL_RE.sub("", raw).strip()
    return clean[:120] or "upload"


def cell_text(value: Any) -> str:
    """A parsed cell value as display text. Integral floats lose their ``.0``."""
    if value is None:
        return ""
    if isinstance(value, bool):
        return "TRUE" if value else "FALSE"
    if isinstance(value, float):
        if value.is_integer() and abs(value) < 1e15:
            return str(int(value))
        return repr(value)
    if hasattr(value, "isoformat"):
        text = value.isoformat()
        return text[:-9] if text.endswith("T00:00:00") else text
    return " ".join(str(value).split())

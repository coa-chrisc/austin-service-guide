"""Read-only view of the active data pack that drafts are built and checked against.

Drafts are validated with the pack's own ``categories.yaml``, ``zip_centroids.yaml``
and ``pack.yaml``, and deduplicated against its ``services/*.yaml`` files as
they are on disk (the files an export would sit next to), not the in-memory
catalog, which may hold demo edits.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit

import yaml

from app.services import data_pack


def _load(path: Path) -> Any:
    with path.open(encoding="utf-8") as fh:
        return yaml.safe_load(fh)


def phone_key(text: Any) -> str:
    digits = re.sub(r"\D", "", str(text or ""))
    return digits[-10:] if len(digits) >= 10 else ""


def web_key(url: Any) -> tuple[str, str]:
    """(host without www., first path segment) of a URL, lowercased."""
    try:
        parts = urlsplit(str(url or "").strip().lower())
    except ValueError:
        return "", ""
    host = (parts.hostname or "").removeprefix("www.")
    segment = parts.path.strip("/").split("/", 1)[0]
    return host, segment


def name_key(text: Any) -> str:
    return " ".join(re.findall(r"[a-z0-9]+", str(text or "").lower()))


@dataclass
class PackContext:
    root: Path
    categories: list[dict] = field(default_factory=list)
    zip_centroids: list[dict] | None = None
    manifest: dict | None = None
    services: dict[str, dict] = field(default_factory=dict)  # slug -> raw record

    @property
    def category_slugs(self) -> list[str]:
        return [c["slug"] for c in self.categories if isinstance(c, dict) and isinstance(c.get("slug"), str)]

    @property
    def zip_points(self) -> dict[str, tuple[float, float]]:
        out: dict[str, tuple[float, float]] = {}
        for z in self.zip_centroids or []:
            if isinstance(z, dict) and isinstance(z.get("latitude"), (int, float)) and isinstance(z.get("longitude"), (int, float)):
                out[str(z.get("zip"))] = (float(z["latitude"]), float(z["longitude"]))
        return out

    def validation_files(self) -> dict[str, Any]:
        files: dict[str, Any] = {
            "categories.yaml": self.categories,
            "life_events.yaml": [],
            "crisis_resources.yaml": [],
        }
        if self.zip_centroids is not None:
            files["zip_centroids.yaml"] = self.zip_centroids
        if self.manifest is not None:
            files["pack.yaml"] = self.manifest
        return files


def _signature(root: Path) -> tuple:
    entries = []
    for path in [root / "categories.yaml", root / "zip_centroids.yaml", root / "pack.yaml", *sorted((root / "services").glob("*.yaml"))]:
        try:
            entries.append((path.name, path.stat().st_mtime_ns))
        except OSError:
            continue
    return tuple(entries)


@lru_cache(maxsize=2)
def _load_context(root: Path, signature: tuple) -> PackContext:
    ctx = PackContext(root=root)
    cats = _load(root / "categories.yaml")
    ctx.categories = cats if isinstance(cats, list) else []
    if (root / "zip_centroids.yaml").is_file():
        z = _load(root / "zip_centroids.yaml")
        ctx.zip_centroids = z if isinstance(z, list) else []
    if (root / "pack.yaml").is_file():
        m = _load(root / "pack.yaml")
        ctx.manifest = m if isinstance(m, dict) else None
    for path in sorted((root / "services").glob("*.yaml")):
        try:
            record = _load(path)
        except (OSError, yaml.YAMLError):
            continue
        if isinstance(record, dict):
            ctx.services[path.stem] = record
    return ctx


def get_context() -> PackContext:
    root = data_pack.data_dir()
    return _load_context(root, _signature(root))

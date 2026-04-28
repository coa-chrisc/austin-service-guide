"""Load the service catalog from YAML files under ``app/data/``.

Layout:

  app/data/
    categories.yaml          # list of ServiceCategory dicts
    life_events.yaml         # list of LifeEvent dicts
    crisis_resources.yaml    # list of CrisisResource dicts
    services/<slug>.yaml     # one Service per file (slug = filename stem)

Edit any file and restart the backend to pick up changes — no codegen step.
Pydantic validates each record on load; bad files raise loudly at startup.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

import yaml

from app.models import (
    CrisisResource,
    LifeEvent,
    Service,
    ServiceCategory,
)

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
SERVICES_DIR = DATA_DIR / "services"


def _read_yaml(path: Path):
    if not path.exists():
        raise FileNotFoundError(f"Catalog file missing: {path}")
    with path.open(encoding="utf-8") as fh:
        return yaml.safe_load(fh)


@lru_cache(maxsize=1)
def load_categories() -> list[ServiceCategory]:
    raw = _read_yaml(DATA_DIR / "categories.yaml") or []
    return [ServiceCategory.model_validate(d) for d in raw]


@lru_cache(maxsize=1)
def load_services() -> list[Service]:
    if not SERVICES_DIR.exists():
        raise FileNotFoundError(f"Services dir missing: {SERVICES_DIR}")
    services: list[Service] = []
    for path in sorted(SERVICES_DIR.glob("*.yaml")):
        data = _read_yaml(path)
        if not data:
            continue
        try:
            services.append(Service.model_validate(data))
        except Exception as exc:  # noqa: BLE001 — surface the offending file
            raise ValueError(f"Invalid service file {path.name}: {exc}") from exc
    return services


@lru_cache(maxsize=1)
def load_life_events() -> list[LifeEvent]:
    raw = _read_yaml(DATA_DIR / "life_events.yaml") or []
    return [LifeEvent.model_validate(d) for d in raw]


@lru_cache(maxsize=1)
def load_crisis_resources() -> list[CrisisResource]:
    raw = _read_yaml(DATA_DIR / "crisis_resources.yaml") or []
    return [CrisisResource.model_validate(d) for d in raw]


def reload_all() -> None:
    """Drop cached YAML so the next access re-reads from disk."""
    load_categories.cache_clear()
    load_services.cache_clear()
    load_life_events.cache_clear()
    load_crisis_resources.cache_clear()


# Module-level lists for legacy import sites (``from app.services.seed_data
# import SERVICES`` etc.).  These are evaluated lazily by re-exporting the
# loader functions; concrete lists are computed on first access.

def __getattr__(name: str):
    if name == "CATEGORIES":
        return load_categories()
    if name == "SERVICES":
        return load_services()
    if name == "LIFE_EVENTS":
        return load_life_events()
    if name == "CRISIS_RESOURCES":
        return load_crisis_resources()
    raise AttributeError(name)

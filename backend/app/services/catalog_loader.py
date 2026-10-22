"""Load the service catalog and local rules from the data pack.

The pack directory comes from ``data_pack.data_dir()`` (``CITY_DATA_DIR``,
default ``app/data``, the Austin reference pack). Layout:

  categories.yaml            # list of ServiceCategory dicts        (required)
  services/<slug>.yaml       # one Service per file                 (required)
  life_events.yaml           # list of LifeEvent dicts              (required)
  crisis_resources.yaml      # list of CrisisResource dicts         (required)
  zip_centroids.yaml         # list of ZipCentroid dicts            (optional)
  matching_rules.yaml        # MatchingRules mapping                (optional)
  service_translations.yaml  # slug -> language -> ServiceTranslation (optional)

Edit any file and restart the backend to pick up changes — no codegen step.
Pydantic validates each record on load; bad files raise loudly at startup.
See ``app/data/README.md`` for every field.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

import yaml
from pydantic import BaseModel, ConfigDict, Field, TypeAdapter, model_validator

from app.models import (
    CrisisResource,
    LifeEvent,
    Service,
    ServiceCategory,
)
from app.services import data_pack
from app.services.data_pack import read_yaml


# ── Schemas for the pack's rule files ────────────────────────────────

class ZipCentroid(BaseModel):
    """Approximate center of one ZIP code, for "services near ZIP" searches."""

    model_config = ConfigDict(extra="forbid")

    zip: str
    latitude: float
    longitude: float
    featured: bool = False  # offered as a quick reply in the scripted intake


class PreventionEntry(BaseModel):
    """One "prevention services" line on a risk flag."""

    model_config = ConfigDict(extra="forbid")

    service: str | None = None  # catalog slug; rendered as that service's name
    text: str | None = None     # display text for an organization not in the catalog

    @model_validator(mode="after")
    def _exactly_one(self) -> "PreventionEntry":
        if (self.service is None) == (self.text is None):
            raise ValueError("set exactly one of 'service' or 'text'")
        return self


class BenefitEstimate(BaseModel):
    """Estimated monthly value of a benefit program, shown on the results."""

    model_config = ConfigDict(extra="forbid")

    services: list[str]                  # catalog slugs this estimate applies to
    label: str
    monthly_value: float
    per_household_member: bool = False   # multiply by household size
    only_if_uninsured: bool = False


class MatchingRules(BaseModel):
    """Local matching rules. Every key is optional; a missing key skips its rule."""

    model_config = ConfigDict(extra="forbid")

    # ZIPs with elevated heat vulnerability (feeds the heat-vulnerable rule).
    high_heat_zips: list[str] = Field(default_factory=list)
    # Crisis indicator -> catalog slugs that always match and lead the plan.
    crisis_services: dict[str, list[str]] = Field(default_factory=dict)
    # Risk flag type -> prevention services listed on that flag.
    prevention_services: dict[str, list[PreventionEntry]] = Field(default_factory=dict)
    # First matching estimate wins; unlisted free services get a small default.
    benefit_estimates: list[BenefitEstimate] = Field(default_factory=list)


class ServiceTranslation(BaseModel):
    model_config = ConfigDict(extra="forbid")

    description: str


_TRANSLATIONS = TypeAdapter(dict[str, dict[str, ServiceTranslation]])


# ── Loaders ──────────────────────────────────────────────────────────

def services_dir() -> Path:
    return data_pack.data_dir() / "services"


def _read_yaml(path: Path):
    with path.open(encoding="utf-8") as fh:
        return yaml.safe_load(fh)


@lru_cache(maxsize=1)
def load_categories() -> list[ServiceCategory]:
    raw = read_yaml("categories.yaml") or []
    return [ServiceCategory.model_validate(d) for d in raw]


@lru_cache(maxsize=1)
def load_services() -> list[Service]:
    root = services_dir()
    if not root.is_dir():
        raise data_pack.DataPackError(f"[data-pack] services dir missing: {root}")
    services: list[Service] = []
    for path in sorted(root.glob("*.yaml")):
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
    raw = read_yaml("life_events.yaml") or []
    return [LifeEvent.model_validate(d) for d in raw]


@lru_cache(maxsize=1)
def load_crisis_resources() -> list[CrisisResource]:
    raw = read_yaml("crisis_resources.yaml") or []
    return [CrisisResource.model_validate(d) for d in raw]


@lru_cache(maxsize=1)
def load_zip_centroids() -> dict[str, ZipCentroid]:
    """ZIP -> centroid, in file order. Empty when the pack has no file."""
    raw = read_yaml("zip_centroids.yaml", required=False) or []
    rows = [ZipCentroid.model_validate(d) for d in raw]
    return {row.zip: row for row in rows}


@lru_cache(maxsize=1)
def load_matching_rules() -> MatchingRules:
    raw = read_yaml("matching_rules.yaml", required=False) or {}
    return MatchingRules.model_validate(raw)


@lru_cache(maxsize=1)
def load_service_translations() -> dict[str, dict[str, ServiceTranslation]]:
    raw = read_yaml("service_translations.yaml", required=False) or {}
    return _TRANSLATIONS.validate_python(raw)


# National lines the code always shows; a pack line with the same number is
# not repeated as a "local" line.
NATIONAL_CRISIS_PHONES = frozenset({"911", "9-1-1", "988", "1-800-799-7233"})


def local_crisis_lines(topic: str) -> list[CrisisResource]:
    """The pack's local crisis lines for ``topic``, in file order."""
    return [
        r for r in load_crisis_resources()
        if r.crisis_topic == topic and r.phone not in NATIONAL_CRISIS_PHONES
    ]


def reload_all() -> None:
    """Drop cached YAML (and the resolved pack directory) so the next access
    re-reads from disk, honoring a changed ``CITY_DATA_DIR``."""
    data_pack.data_dir.cache_clear()
    load_categories.cache_clear()
    load_services.cache_clear()
    load_life_events.cache_clear()
    load_crisis_resources.cache_clear()
    load_zip_centroids.cache_clear()
    load_matching_rules.cache_clear()
    load_service_translations.cache_clear()


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
    if name == "DATA_DIR":
        return data_pack.data_dir()
    if name == "SERVICES_DIR":
        return services_dir()
    raise AttributeError(name)

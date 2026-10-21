"""City identity for the backend, read from the same config the frontend builds from.

Only identity lines use this (the scripted greeting and the agency/app sentence
in the system prompt). The catalog, personas, crisis resources and the rest of
the prompt stay Austin-specific.

Resolution (first match wins):
  1. CITY_CONFIG   path under config/, e.g. ``presets/my-city.json``
  2. CITY_PRESET   preset id, shorthand for ``presets/<id>.json``
  3. ``city.config.json``
config/ is found via CITY_CONFIG_DIR, then ``<app parent>/config`` (the Docker
image layout, /app/config), then ``<repo root>/config``.

A missing, unreadable or malformed config raises CityConfigError. There is no
silent fallback: quietly greeting residents as another city would be worse
than refusing to start.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Mapping

_HERE = Path(__file__).resolve()
_PREFIX = "[city-config]"


class CityConfigError(RuntimeError):
    """The city config could not be found or is not usable."""


@dataclass(frozen=True)
class CityIdentity:
    app_name: str
    agency_name: str
    agency_short_name: str
    agency_parent: str
    region_name: str
    city_name: str
    state: str
    phone311: str


def _config_dir(env: Mapping[str, str]) -> Path:
    explicit = (env.get("CITY_CONFIG_DIR") or "").strip()
    candidates = [Path(explicit)] if explicit else [_HERE.parents[2] / "config", _HERE.parents[3] / "config"]
    for c in candidates:
        if (c / "city.config.json").is_file():
            return c.resolve()
    raise CityConfigError(f"{_PREFIX} config/ directory with city.config.json not found (tried: {', '.join(map(str, candidates))}).")


def _config_path(env: Mapping[str, str], config_dir: Path) -> Path:
    config_var = (env.get("CITY_CONFIG") or "").strip()
    preset_var = (env.get("CITY_PRESET") or "").strip()
    if config_var:
        rel = config_var
    elif preset_var:
        rel = f"presets/{preset_var}.json"
    else:
        rel = "city.config.json"
    path = (config_dir / rel).resolve()
    if config_dir not in path.parents or path.suffix != ".json" or not path.is_file():
        raise CityConfigError(f"{_PREFIX} {rel!r} is not a .json file under {config_dir}.")
    return path


def _text(data: object, *keys: str) -> str:
    cur = data
    for k in keys:
        cur = cur.get(k) if isinstance(cur, dict) else None
    if not isinstance(cur, str) or not cur.strip():
        raise CityConfigError(f"{_PREFIX} {'.'.join(keys)} must be a non-empty string.")
    return cur.strip()


def load_city(env: Mapping[str, str] | None = None) -> CityIdentity:
    """Read and check the identity fields. Raises CityConfigError on any problem."""
    env = os.environ if env is None else env
    path = _config_path(env, _config_dir(env))
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as exc:
        raise CityConfigError(f"{_PREFIX} cannot read {path.name}: {exc}") from exc
    if not isinstance(data, dict):
        raise CityConfigError(f"{_PREFIX} {path.name} must be a JSON object.")
    contact = (data.get("serviceGuide") or {}).get("contact") or {}
    phone = contact.get("phone311") if isinstance(contact, dict) else None
    return CityIdentity(
        app_name=_text(data, "appName"),
        agency_name=_text(data, "agency", "name"),
        agency_short_name=_text(data, "agency", "shortName"),
        agency_parent=_text(data, "agency", "parent"),
        region_name=_text(data, "region", "name"),
        city_name=_text(data, "region", "cityName"),
        state=_text(data, "region", "state"),
        phone311=phone if isinstance(phone, str) and phone.strip() else "311",
    )


@lru_cache(maxsize=1)
def get_city() -> CityIdentity:
    """Identity for this process, loaded once from the environment."""
    return load_city()

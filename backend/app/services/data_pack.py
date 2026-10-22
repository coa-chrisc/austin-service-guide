"""Where this deployment's local data lives (the "data pack").

The data pack is a directory of YAML files describing one place: the service
catalog, categories, life events, crisis lines, ZIP centroids, matching rules,
demo personas and admin demo data. The city config says who the deployment is;
the data pack says what is there.

Resolution:
  CITY_DATA_DIR  unset  -> ``app/data`` (the Austin reference pack)
                 absolute path -> used as-is
                 relative path -> resolved under the config/ directory, e.g.
                 ``data/my-city`` -> ``config/data/my-city`` (the Docker image
                 copies config/, so a pack placed there ships with it)

A pack must contain ``categories.yaml``; a missing directory or file fails
loudly rather than serving another city's data.
"""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Any, Mapping

import yaml

from app.services.city import CityConfigError, config_dir

DEFAULT_DATA_DIR = Path(__file__).resolve().parent.parent / "data"
_PREFIX = "[data-pack]"


class DataPackError(RuntimeError):
    """The data pack directory or one of its files is missing or unreadable."""


def resolve_data_dir(env: Mapping[str, str] | None = None) -> Path:
    env = os.environ if env is None else env
    raw = (env.get("CITY_DATA_DIR") or "").strip()
    if not raw:
        path = DEFAULT_DATA_DIR
    elif Path(raw).is_absolute():
        path = Path(raw)
    else:
        try:
            path = config_dir(env) / raw
        except CityConfigError as exc:
            raise DataPackError(f"{_PREFIX} cannot resolve CITY_DATA_DIR={raw!r}: {exc}") from exc
    path = path.resolve()
    if not (path / "categories.yaml").is_file():
        raise DataPackError(f"{_PREFIX} {path} is not a data pack (no categories.yaml).")
    return path


@lru_cache(maxsize=1)
def data_dir() -> Path:
    """The data pack for this process, resolved once from the environment."""
    return resolve_data_dir()


def read_yaml(name: str, *, required: bool = True) -> Any:
    """Parse ``<data pack>/<name>``. Missing + not required -> None."""
    path = data_dir() / name
    if not path.is_file():
        if required:
            raise DataPackError(f"{_PREFIX} missing {name} in {data_dir()}.")
        return None
    with path.open(encoding="utf-8") as fh:
        return yaml.safe_load(fh)

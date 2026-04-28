"""One-shot: read CATEGORIES / SERVICES / LIFE_EVENTS / CRISIS_RESOURCES
from seed_data.py and write them out as YAML under backend/app/data/.

Run once:  python -m scripts.dump_catalog_to_yaml
"""

from __future__ import annotations

import sys
from pathlib import Path

# Run from backend/ so `app.*` imports resolve.
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

import yaml  # noqa: E402

from app.services.seed_data import (  # noqa: E402
    CATEGORIES,
    CRISIS_RESOURCES,
    LIFE_EVENTS,
    SERVICES,
)


DATA_DIR = ROOT / "app" / "data"
SERVICES_DIR = DATA_DIR / "services"
DATA_DIR.mkdir(parents=True, exist_ok=True)
SERVICES_DIR.mkdir(parents=True, exist_ok=True)


def _dump(obj, path: Path) -> None:
    path.write_text(
        yaml.safe_dump(
            obj,
            sort_keys=False,
            allow_unicode=True,
            width=100,
            default_flow_style=False,
        ),
        encoding="utf-8",
    )


def _scrub(d):
    """Drop keys that are None or empty list/dict so YAML stays clean."""
    if isinstance(d, dict):
        return {k: _scrub(v) for k, v in d.items() if v not in (None, [], {})}
    if isinstance(d, list):
        return [_scrub(v) for v in d]
    return d


def main() -> None:
    # Per-service YAML files
    for svc in SERVICES:
        data = _scrub(svc.model_dump(mode="json"))
        path = SERVICES_DIR / f"{svc.slug}.yaml"
        _dump(data, path)
    print(f"Wrote {len(SERVICES)} service files to {SERVICES_DIR}")

    # Bundled lookups
    _dump(
        [_scrub(c.model_dump(mode="json")) for c in CATEGORIES],
        DATA_DIR / "categories.yaml",
    )
    print(f"Wrote {len(CATEGORIES)} categories")

    _dump(
        [_scrub(le.model_dump(mode="json")) for le in LIFE_EVENTS],
        DATA_DIR / "life_events.yaml",
    )
    print(f"Wrote {len(LIFE_EVENTS)} life events")

    _dump(
        [_scrub(cr.model_dump(mode="json")) for cr in CRISIS_RESOURCES],
        DATA_DIR / "crisis_resources.yaml",
    )
    print(f"Wrote {len(CRISIS_RESOURCES)} crisis resources")


if __name__ == "__main__":
    main()

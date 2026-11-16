"""Validate the service catalog YAML against config/services.schema.json.

The services subset of the data-pack validator (app/services/pack_validator.py;
``validate_pack.py`` / ``npm run validate:pack`` check the whole pack): the
schema plus the rules a schema cannot express (unique id/slug, category
references, location service_id, hours, coordinates, ...). Errors exit 1;
warnings exit 0 unless ``--strict`` promotes "unverified" warnings to errors.

Usage::

    python backend/scripts/validate_catalog.py [--strict] [--json] [--data-dir DIR]

``DIR`` must contain ``categories.yaml`` and a ``services/`` folder
(default: the data pack CITY_DATA_DIR selects, as the backend resolves it;
unset means backend/app/data). Runs from any working directory.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from app.services.pack_validator import SERVICES, validate_pack  # noqa: E402

SCHEMA_PATH = ROOT.parent / "config" / "services.schema.json"


def _in_subset(issue: dict) -> bool:
    return issue["file"].startswith(SERVICES) or (
        issue["file"] in ("categories.yaml", "CITY_DATA_DIR") and issue["code"] == "missing_file"
    )


def _line(issue: dict) -> str:
    name = issue["file"].removeprefix(SERVICES) or issue["file"]
    return f"{name}: {issue['path']}: {issue['message']}" if issue["path"] else f"{name}: {issue['message']}"


def validate_catalog(data_dir: Path | str | None = None, strict: bool = False) -> dict:
    """Return {"services", "errors", "warnings", "unverified"} for a catalog dir."""
    result = validate_pack(data_dir, strict=strict)
    return {
        "services": result["counts"]["services"],
        "errors": [_line(i) for i in result["errors"] if _in_subset(i)],
        "warnings": [_line(i) for i in result["warnings"] if _in_subset(i)],
        "unverified": result["unverified"],
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--strict", action="store_true", help="treat unverified services as errors")
    ap.add_argument("--json", action="store_true", help="machine-readable output")
    ap.add_argument("--data-dir", help="catalog data dir (default: the CITY_DATA_DIR data pack, else backend/app/data)")
    args = ap.parse_args(argv)

    result = validate_catalog(args.data_dir, strict=args.strict)
    if args.json:
        print(json.dumps(result, indent=2))
    else:
        for msg in result["errors"]:
            print(f"ERROR   {msg}")
        for msg in result["warnings"]:
            print(f"WARNING {msg}")
        print(
            f"{result['services']} services, {len(result['errors'])} errors, "
            f"{len(result['warnings'])} warnings, {result['unverified']} unverified"
        )
    return 1 if result["errors"] else 0


if __name__ == "__main__":
    sys.exit(main())

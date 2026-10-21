"""Validate the service catalog YAML against config/services.schema.json.

Checks the JSON Schema plus rules a schema cannot express (unique id/slug,
category references, location service_id). Errors exit 1; warnings exit 0
unless ``--strict`` promotes "unverified" warnings to errors.

Usage::

    python backend/scripts/validate_catalog.py [--strict] [--json] [--data-dir DIR]

``DIR`` must contain ``categories.yaml`` and a ``services/`` folder
(default: backend/app/data). Runs from any working directory.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date
from pathlib import Path

import yaml
from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DATA_DIR = ROOT / "app" / "data"
SCHEMA_PATH = ROOT.parent / "config" / "services.schema.json"


def _load_yaml(path: Path):
    with path.open(encoding="utf-8") as fh:
        return yaml.safe_load(fh)


def validate_catalog(data_dir: Path | str | None = None, strict: bool = False) -> dict:
    """Return {"services", "errors", "warnings", "unverified"} for a catalog dir."""
    data_dir = Path(data_dir) if data_dir else DEFAULT_DATA_DIR
    errors: list[str] = []
    warnings: list[str] = []
    unverified = 0

    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    validator = Draft202012Validator(schema, format_checker=Draft202012Validator.FORMAT_CHECKER)

    cats_path = data_dir / "categories.yaml"
    if cats_path.exists():
        category_slugs = {c.get("slug") for c in (_load_yaml(cats_path) or [])}
    else:
        category_slugs = set()
        errors.append(f"categories.yaml: missing at {cats_path}")

    files = sorted((data_dir / "services").glob("*.yaml"))
    ids: dict[str, str] = {}
    slugs: dict[str, str] = {}

    for path in files:
        name = path.name
        try:
            svc = _load_yaml(path)
        except yaml.YAMLError as exc:
            errors.append(f"{name}: invalid YAML: {exc}")
            continue
        if not isinstance(svc, dict):
            errors.append(f"{name}: top level must be a mapping")
            continue
        # YAML parses an unquoted 2026-01-31 as a date object; the schema wants the string.
        if isinstance(svc.get("last_verified_date"), date):
            svc["last_verified_date"] = svc["last_verified_date"].isoformat()

        for err in sorted(validator.iter_errors(svc), key=lambda e: list(e.absolute_path)):
            where = "/".join(str(p) for p in err.absolute_path) or "(root)"
            if err.validator == "anyOf" and not err.absolute_path:
                msg = "no contact phone: set top-level phone or a phone on at least one location"
            else:
                msg = err.message
            errors.append(f"{name}: {where}: {msg}")

        sid, slug = svc.get("id"), svc.get("slug")
        if isinstance(sid, str) and sid:
            if sid in ids:
                errors.append(f"{name}: duplicate id {sid!r} (also in {ids[sid]})")
            ids.setdefault(sid, name)
        if isinstance(slug, str) and slug:
            if slug in slugs:
                errors.append(f"{name}: duplicate slug {slug!r} (also in {slugs[slug]})")
            slugs.setdefault(slug, name)
            if slug != path.stem:
                errors.append(f"{name}: slug {slug!r} does not match file name")

        cats = svc.get("categories")
        for c in cats if isinstance(cats, list) else []:
            if c not in category_slugs:
                errors.append(f"{name}: unknown category {c!r} (not a slug in categories.yaml)")

        if not svc.get("last_verified_date") or not svc.get("verified_by"):
            unverified += 1
            missing = [k for k in ("last_verified_date", "verified_by") if not svc.get(k)]
            (errors if strict else warnings).append(
                f"{name}: unverified (missing {', '.join(missing)})"
            )
        if not svc.get("website_url"):
            warnings.append(f"{name}: empty website_url")

        locs = svc.get("locations")
        for i, loc in enumerate(locs if isinstance(locs, list) else []):
            if not isinstance(loc, dict):
                continue
            label = f"{name}: locations[{i}]"
            if loc.get("service_id") != sid:
                errors.append(
                    f"{label}: service_id {loc.get('service_id')!r} does not match parent id {sid!r}"
                )
            if not loc.get("hours"):
                warnings.append(f"{label}: missing hours")
            if loc.get("hours_verified") is False:
                warnings.append(f"{label}: hours_verified is false")

    return {
        "services": len(files),
        "errors": errors,
        "warnings": warnings,
        "unverified": unverified,
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--strict", action="store_true", help="treat unverified services as errors")
    ap.add_argument("--json", action="store_true", help="machine-readable output")
    ap.add_argument("--data-dir", help="catalog data dir (default: backend/app/data)")
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

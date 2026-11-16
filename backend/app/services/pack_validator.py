"""Validate a data pack against the data-pack contract (config/schemas/).

The contract is the JSON Schemas listed in ``config/schemas/index.json`` plus
the cross-file rules below that a schema cannot express. docs/DATA_PACK.md
documents both. ``validate_pack`` takes a pack directory or an in-memory pack
(``{"categories.yaml": [...], "services/<slug>.yaml": {...}, ...}``, already
parsed) and returns::

    {"source": str, "errors": [issue], "warnings": [issue],
     "unverified": int, "counts": {...}}

where each issue is ``{"file", "path", "code", "message", "severity"}``.
A pack with no errors loads: every record that passes its schema is also run
through the loader's own Pydantic models (code ``loader_rejects`` otherwise).

Nothing in the server calls this yet; it is tooling. CLI::

    python -m app.services.pack_validator [--strict] [--json] [--data-dir DIR] [--city-config FILE]

(``backend/scripts/validate_pack.py`` and ``npm run validate:pack`` wrap it.)
Exit 1 when there are errors. ``--strict`` turns "unverified" warnings into
errors.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import date, datetime
from functools import lru_cache
from pathlib import Path
from typing import Any, Mapping

import yaml
from jsonschema import Draft202012Validator

_HERE = Path(__file__).resolve()
SERVICES = "services/"
MAX_CATEGORIES_PER_SERVICE = 5
_MSG_LIMIT = 300

# Values hours._parse_range reads as "closed" on purpose (anything else it
# cannot parse also reads as closed, which is what the warning is for).
_CLOSED_WORDS = {"", "closed", "n/a", "by appointment", "appointment only"}
_HTML_TAG = re.compile(r"</?[A-Za-z][A-Za-z0-9-]*(\s[^<>]*)?/?>")
_MD_LINK = re.compile(r"\[[^\]\n]*\]\([^)\s]*\)")
_NOT_PROSE = {"id", "slug", "service_id", "website_url", "url", "email", "phone", "zip_code"}


# ── Contract ─────────────────────────────────────────────────────────

def schema_dir() -> Path:
    """config/schemas/ in the repo (backend/app/...) or the image (/app/app/...)."""
    for root in (_HERE.parents[2], _HERE.parents[3]):
        path = root / "config" / "schemas"
        if (path / "index.json").is_file():
            return path
    raise FileNotFoundError("config/schemas/index.json not found next to the backend")


@lru_cache(maxsize=1)
def contract() -> dict[str, Any]:
    """The schema index, each entry with its compiled ``validator``."""
    index = json.loads((schema_dir() / "index.json").read_text(encoding="utf-8"))
    for entry in index["files"]:
        schema = json.loads((schema_dir() / entry["schema"]).read_text(encoding="utf-8"))
        entry["validator"] = Draft202012Validator(
            schema, format_checker=Draft202012Validator.FORMAT_CHECKER
        )
    return index


def _entry_for(name: str) -> dict[str, Any] | None:
    key = "services/<slug>.yaml" if name.startswith(SERVICES) else name
    return next((e for e in contract()["files"] if e["path"] == key), None)


# ── Reporting ────────────────────────────────────────────────────────

class _Report:
    def __init__(self, strict: bool) -> None:
        self.strict = strict
        self.errors: list[dict[str, str]] = []
        self.warnings: list[dict[str, str]] = []
        self.unverified = 0

    def add(self, severity: str, file: str, path: str, code: str, message: str) -> None:
        if severity == "warning" and code == "unverified" and self.strict:
            severity = "error"
        if len(message) > _MSG_LIMIT:
            message = message[: _MSG_LIMIT - 3] + "..."
        issue = {"file": file, "path": path, "code": code, "message": message, "severity": severity}
        (self.errors if severity == "error" else self.warnings).append(issue)

    def error(self, file: str, path: str, code: str, message: str) -> None:
        self.add("error", file, path, code, message)

    def warn(self, file: str, path: str, code: str, message: str) -> None:
        self.add("warning", file, path, code, message)


def format_issue(issue: Mapping[str, str]) -> str:
    where = f"{issue['file']}: {issue['path']}" if issue["path"] else issue["file"]
    return f"{where}: {issue['message']} [{issue['code']}]"


# ── Loading ──────────────────────────────────────────────────────────

_UNREADABLE = object()


def _read_dir(root: Path, report: _Report) -> tuple[dict[str, Any], bool]:
    """Parse every file the contract names. Returns (files, has_services_dir)."""
    files: dict[str, Any] = {}
    known = {e["path"] for e in contract()["files"]}
    for path in sorted(root.iterdir()):
        if path.is_file() and path.suffix in (".yaml", ".yml"):
            if path.name in known:
                files[path.name] = _parse(path, path.name, report)
            else:
                report.warn(path.name, "", "ignored_file", "not a pack file; the loader never reads it")
    services = root / "services"
    if services.is_dir():
        for path in sorted(services.iterdir()):
            name = SERVICES + path.name
            if path.suffix == ".yaml" and path.is_file():
                files[name] = _parse(path, name, report)
            elif path.is_file() and not path.name.startswith("."):
                report.warn(name, "", "ignored_file", "the loader reads only services/*.yaml")
    return files, services.is_dir()


def _parse(path: Path, name: str, report: _Report) -> Any:
    try:
        with path.open(encoding="utf-8") as fh:
            return yaml.safe_load(fh)
    except (yaml.YAMLError, UnicodeDecodeError) as exc:
        report.error(name, "", "yaml", f"invalid YAML: {exc}")
        return _UNREADABLE


def _jsonable(value: Any) -> Any:
    """YAML turns unquoted 2026-01-31 into a date; the schemas want strings."""
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, dict):
        return {k: _jsonable(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_jsonable(v) for v in value]
    return value


# ── Schema + loader checks ───────────────────────────────────────────

def _schema_check(name: str, data: Any, report: _Report) -> bool:
    entry = _entry_for(name)
    ok = True
    errors = entry["validator"].iter_errors(_jsonable(data))
    for err in sorted(errors, key=lambda e: [f"{p:06d}" if isinstance(p, int) else str(p) for p in e.absolute_path]):
        ok = False
        message = err.message
        if err.validator in ("anyOf", "oneOf") and isinstance(err.schema, dict) and err.schema.get("x-message"):
            message = err.schema["x-message"]
        report.error(name, "/".join(str(p) for p in err.absolute_path), "schema", message)
    return ok


def _loader_check(name: str, data: Any) -> None:
    """Run the loader's own models (catalog_loader / personas) over the data."""
    from pydantic import TypeAdapter

    from app.models import CrisisResource, LifeEvent, ResidentProfile, Service, ServiceCategory
    from app.services.catalog_loader import MatchingRules, ServiceTranslation, ZipCentroid
    from app.services.personas import ScriptedTurn

    per_item = {
        "categories.yaml": ServiceCategory,
        "life_events.yaml": LifeEvent,
        "crisis_resources.yaml": CrisisResource,
        "zip_centroids.yaml": ZipCentroid,
    }
    if name.startswith(SERVICES):
        Service.model_validate(data)
    elif name in per_item:
        for item in data:
            per_item[name].model_validate(item)
    elif name == "matching_rules.yaml":
        MatchingRules.model_validate(data)
    elif name == "service_translations.yaml":
        TypeAdapter(dict[str, dict[str, ServiceTranslation]]).validate_python(data)
    elif name == "personas.yaml":
        for entry in data.values():
            ResidentProfile(**entry["seed_profile"])
            for turn in entry.get("script") or []:
                ScriptedTurn(**turn)


# ── Cross-file checks ────────────────────────────────────────────────

def _dicts(value: Any) -> list[dict]:
    return [v for v in value if isinstance(v, dict)] if isinstance(value, list) else []


def _strings(value: Any, path: str = ""):
    """(path, text) for every prose string inside a record."""
    if isinstance(value, str):
        yield path, value
    elif isinstance(value, dict):
        for k, v in value.items():
            if k not in _NOT_PROSE:
                yield from _strings(v, f"{path}/{k}" if path else str(k))
    elif isinstance(value, list):
        for i, v in enumerate(value):
            yield from _strings(v, f"{path}/{i}" if path else str(i))


def _check_markup(name: str, record: Any, report: _Report, prefix: str = "") -> None:
    for path, text in _strings(record, prefix):
        if _HTML_TAG.search(text) or _MD_LINK.search(text):
            report.warn(name, path, "markup_in_text", "contains an HTML tag or Markdown link; text fields are plain text")


def _as_date(value: Any) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    try:
        return date.fromisoformat(value) if isinstance(value, str) else None
    except ValueError:
        return None


def _hours_ok(text: str) -> bool:
    from app.services.hours import _parse_range

    return _parse_range(text) is not None or text.strip().lower() in _CLOSED_WORDS


def _unique(name: str, records: list[dict], key: str, report: _Report) -> None:
    seen: dict[Any, int] = {}
    for i, rec in enumerate(records):
        value = rec.get(key)
        if isinstance(value, str) and value:
            if value in seen:
                report.error(name, f"{i}/{key}", f"duplicate_{key}", f"duplicate {key} {value!r} (also at index {seen[value]})")
            seen.setdefault(value, i)


def _check_services(files: dict[str, Any], categories: set[str], bbox: list | None, report: _Report) -> None:
    ids: dict[str, str] = {}
    slugs: dict[str, str] = {}
    loc_ids: dict[str, str] = {}
    today = date.today()
    for name, svc in files.items():
        if not name.startswith(SERVICES) or not isinstance(svc, dict):
            continue
        sid, slug = svc.get("id"), svc.get("slug")
        if isinstance(sid, str) and sid:
            if sid in ids:
                report.error(name, "id", "duplicate_id", f"duplicate id {sid!r} (also in {ids[sid]})")
            ids.setdefault(sid, name)
        if isinstance(slug, str) and slug:
            if slug in slugs:
                report.error(name, "slug", "duplicate_slug", f"duplicate slug {slug!r} (also in {slugs[slug]})")
            slugs.setdefault(slug, name)
            if slug != Path(name).stem:
                report.error(name, "slug", "slug_file_mismatch", f"slug {slug!r} does not match file name")
        cats = svc.get("categories") if isinstance(svc.get("categories"), list) else []
        for i, c in enumerate(cats):
            if c not in categories:
                report.error(name, f"categories/{i}", "unknown_category", f"unknown category {c!r} (not a slug in categories.yaml)")
        if len(cats) > MAX_CATEGORIES_PER_SERVICE:
            report.warn(name, "categories", "too_many_categories", f"{len(cats)} categories; keep to {MAX_CATEGORIES_PER_SERVICE} or fewer so the service is not matched for everything")

        missing = [k for k in ("last_verified_date", "verified_by") if not svc.get(k)]
        if missing:
            report.unverified += 1
            report.warn(name, "", "unverified", f"unverified (missing {', '.join(missing)})")
        verified = _as_date(svc.get("last_verified_date"))
        if verified and verified > today:
            report.error(name, "last_verified_date", "date_in_future", f"last_verified_date {verified} is in the future")
        for i, src in enumerate(_dicts(svc.get("sources"))):
            retrieved = _as_date(src.get("retrieved_at"))
            if retrieved and retrieved > today:
                report.error(name, f"sources/{i}/retrieved_at", "date_in_future", f"retrieved_at {retrieved} is in the future")
        if not svc.get("website_url"):
            report.warn(name, "website_url", "empty_website_url", "empty website_url")

        locations = _dicts(svc.get("locations"))
        for i, loc in enumerate(locations):
            where = f"locations/{i}"
            if loc.get("service_id") != sid:
                report.error(name, f"{where}/service_id", "location_service_id",
                             f"service_id {loc.get('service_id')!r} does not match parent id {sid!r}")
            lid = loc.get("id")
            if isinstance(lid, str) and lid:
                if lid in loc_ids:
                    report.error(name, f"{where}/id", "duplicate_location_id", f"duplicate location id {lid!r} (also in {loc_ids[lid]})")
                loc_ids.setdefault(lid, name)
            hours = loc.get("hours")
            if not hours:
                report.warn(name, f"{where}/hours", "missing_hours", "missing hours")
            elif isinstance(hours, dict):
                for day, text in hours.items():
                    if isinstance(text, str) and not _hours_ok(text):
                        report.warn(name, f"{where}/hours/{day}", "hours_unparseable",
                                    f"{text!r} is not a format hours.py understands, so it reads as closed")
            if loc.get("hours_verified") is False:
                report.warn(name, f"{where}/hours_verified", "hours_unverified", "hours_verified is false")
            lat, lng = loc.get("latitude"), loc.get("longitude")
            if isinstance(lat, (int, float)) and isinstance(lng, (int, float)):
                if lat == 0 or lng == 0:
                    report.error(name, where, "zero_coordinates", "latitude/longitude is 0: the map and radius search skip this location")
                elif bbox and not (bbox[0] <= lng <= bbox[2] and bbox[1] <= lat <= bbox[3]):
                    report.warn(name, where, "outside_bbox", f"({lat}, {lng}) is outside the pack.yaml bbox")
        primaries = sum(1 for loc in locations if loc.get("is_primary") is True)
        if primaries > 1:
            report.error(name, "locations", "primary_location", f"{primaries} locations have is_primary: true; at most one may")
        elif locations and primaries == 0:
            report.warn(name, "locations", "primary_location", "no location has is_primary: true")
        _check_markup(name, svc, report)


def _check_categories(files: dict[str, Any], report: _Report) -> set[str]:
    from app.services.matching import _SEQUENCE_PRIORITY

    cats = _dicts(files.get("categories.yaml"))
    _unique("categories.yaml", cats, "id", report)
    _unique("categories.yaml", cats, "slug", report)
    for i, cat in enumerate(cats):
        slug = cat.get("slug")
        if isinstance(slug, str) and slug not in _SEQUENCE_PRIORITY:
            report.warn("categories.yaml", f"{i}/slug", "category_unknown_to_engine",
                        f"the engine has no rules for {slug!r}: it matches only when a resident's stated need is the slug "
                        "itself or appears in a service's name or description, and it gets plan priority 0 with the generic plan reason")
        _check_markup("categories.yaml", cat, report, str(i))
    return {c["slug"] for c in cats if isinstance(c.get("slug"), str)}


def _check_life_events(files: dict[str, Any], categories: set[str], report: _Report) -> None:
    name = "life_events.yaml"
    events = _dicts(files.get(name))
    _unique(name, events, "id", report)
    _unique(name, events, "slug", report)
    for i, event in enumerate(events):
        related = event.get("related_categories")
        for j, c in enumerate(related if isinstance(related, list) else []):
            if c not in categories:
                report.error(name, f"{i}/related_categories/{j}", "unknown_category", f"unknown category {c!r}")
        _check_markup(name, event, report, str(i))


def _check_rules(files: dict[str, Any], services: dict[str, dict], report: _Report) -> None:
    name = "matching_rules.yaml"
    rules = files.get(name)
    if not isinstance(rules, dict):
        return

    def known(slug: Any, path: str) -> bool:
        if isinstance(slug, str) and slug not in services:
            report.error(name, path, "unknown_service_slug", f"no service with slug {slug!r}")
            return False
        return isinstance(slug, str)

    crisis = rules.get("crisis_services")
    for indicator, slugs in (crisis.items() if isinstance(crisis, dict) else []):
        for i, slug in enumerate(slugs if isinstance(slugs, list) else []):
            path = f"crisis_services/{indicator}/{i}"
            if known(slug, path) and services[slug].get("status") != "active":
                report.error(name, path, "crisis_service_not_active",
                             f"crisis-direct service {slug!r} has status {services[slug].get('status')!r}; it must be active")
    prevention = rules.get("prevention_services")
    for risk, entries in (prevention.items() if isinstance(prevention, dict) else []):
        for i, entry in enumerate(_dicts(entries)):
            if "service" in entry:
                known(entry["service"], f"prevention_services/{risk}/{i}/service")
    for i, est in enumerate(_dicts(rules.get("benefit_estimates"))):
        for j, slug in enumerate(est.get("services") if isinstance(est.get("services"), list) else []):
            known(slug, f"benefit_estimates/{i}/services/{j}")
    _check_markup(name, {k: v for k, v in rules.items() if k != "high_heat_zips"}, report)


def _check_other_files(files: dict[str, Any], services: dict[str, dict], report: _Report) -> None:
    translations = files.get("service_translations.yaml")
    if isinstance(translations, dict):
        for slug, langs in translations.items():
            if slug not in services:
                report.error("service_translations.yaml", str(slug), "unknown_service_slug", f"no service with slug {slug!r}")
            _check_markup("service_translations.yaml", langs, report, str(slug))
    personas = files.get("personas.yaml")
    if isinstance(personas, dict):
        for key, entry in personas.items():
            if isinstance(entry, dict) and entry.get("id") != key:
                report.error("personas.yaml", f"{key}/id", "persona_id_mismatch", f"id {entry.get('id')!r} must equal its key {key!r}")
    name = "crisis_resources.yaml"
    for i, line in enumerate(_dicts(files.get(name))):
        _check_markup(name, line, report, str(i))
    centroids = _dicts(files.get("zip_centroids.yaml"))
    _unique("zip_centroids.yaml", centroids, "zip", report)
    if "zip_centroids.yaml" in files:
        covered = {c.get("zip") for c in centroids}
        uses: dict[str, list[str]] = {}
        for svc_name, svc in files.items():
            if svc_name.startswith(SERVICES) and isinstance(svc, dict):
                for loc in _dicts(svc.get("locations")):
                    z = str(loc.get("zip_code") or "")[:5]
                    if z and z not in covered:
                        uses.setdefault(z, []).append(svc_name)
        for z, names in sorted(uses.items()):
            report.warn("zip_centroids.yaml", "", "zip_not_covered",
                        f"ZIP {z} (used by {len(names)} location(s), e.g. {names[0]}) has no centroid, "
                        "so a search near it is not radius-filtered")


def _check_city_config(config: Mapping[str, Any], label: str, categories: set[str], report: _Report) -> None:
    colors = (config.get("serviceGuide") or {}).get("categoryColors") or {}
    for slug in colors:
        if slug not in categories:
            report.error(label, f"serviceGuide/categoryColors/{slug}", "unknown_category",
                         f"unknown category {slug!r} (not a slug in categories.yaml)")


# ── Entry point ──────────────────────────────────────────────────────

def validate_pack(
    source: Path | str | Mapping[str, Any] | None = None,
    *,
    strict: bool = False,
    city_config: Path | str | Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    """Validate a pack directory (default: the one CITY_DATA_DIR selects) or an
    in-memory ``{relative path: parsed YAML}`` pack. ``city_config`` (a path or
    a parsed config) adds the categoryColors check."""
    report = _Report(strict)
    if isinstance(source, Mapping):
        files, has_services, label = dict(source), True, "(in memory)"
    else:
        if source is None:
            from app.services.data_pack import DataPackError, resolve_data_dir

            try:
                source = resolve_data_dir()
            except DataPackError as exc:
                report.error("CITY_DATA_DIR", "", "missing_file", str(exc))
                return _result("CITY_DATA_DIR", report, {})
        root = Path(source)
        label = str(root)
        if not root.is_dir():
            report.error(label, "", "missing_file", "pack directory not found")
            return _result(label, report, {})
        files, has_services = _read_dir(root, report)

    for entry in contract()["files"]:
        path = entry["path"]
        if path.startswith(SERVICES):
            if not has_services:
                report.error(SERVICES, "", "missing_file", "required services/ folder is missing")
        elif path not in files and entry["required"]:
            report.error(path, "", "missing_file", "required file is missing")
        elif files.get(path) is None and path in files:
            files[path] = [] if entry["shape"] == "list" else {}  # the loader reads an empty file as empty

    for name in list(files):
        data = files[name]
        if data is _UNREADABLE:
            files[name] = None
            continue
        if _entry_for(name) is None:
            report.warn(name, "", "ignored_file", "not a pack file; the loader never reads it")
            continue
        if name.startswith(SERVICES) and not isinstance(data, dict):
            report.error(name, "", "schema", "top level must be a mapping (one service per file)")
            files[name] = None
            continue
        if _schema_check(name, data, report) and name not in ("pack.yaml", "admin_demo.yaml"):
            try:
                _loader_check(name, data)
            except Exception as exc:  # noqa: BLE001 — any loader failure is the finding
                report.error(name, "", "loader_rejects", f"passes the schema but the loader rejects it: {exc}")

    manifest = files.get("pack.yaml") if isinstance(files.get("pack.yaml"), dict) else {}
    bbox = manifest.get("bbox")
    if not (isinstance(bbox, list) and len(bbox) == 4 and all(isinstance(v, (int, float)) for v in bbox)):
        bbox = None
    elif bbox[0] >= bbox[2] or bbox[1] >= bbox[3]:
        report.error("pack.yaml", "bbox", "bbox_order", "bbox must be [west, south, east, north] with west < east and south < north")
        bbox = None

    categories = _check_categories(files, report)
    services = {
        svc["slug"]: svc for name, svc in files.items()
        if name.startswith(SERVICES) and isinstance(svc, dict) and isinstance(svc.get("slug"), str)
    }
    _check_services(files, categories, bbox, report)
    _check_life_events(files, categories, report)
    _check_rules(files, services, report)
    _check_other_files(files, services, report)
    if city_config is not None:
        if isinstance(city_config, Mapping):
            config, config_label = city_config, "city config"
        else:
            config_label = Path(city_config).name
            config = json.loads(Path(city_config).read_text(encoding="utf-8"))
        _check_city_config(config, config_label, categories, report)
    return _result(label, report, files)


def _result(label: str, report: _Report, files: dict[str, Any]) -> dict[str, Any]:
    svcs = [s for n, s in files.items() if n.startswith(SERVICES) and isinstance(s, dict)]

    def size(name: str) -> int:
        value = files.get(name)
        return len(value) if isinstance(value, (list, dict)) else 0

    counts = {
        "services": len([n for n in files if n.startswith(SERVICES)]),
        "active": sum(1 for s in svcs if s.get("status") == "active"),
        "seasonal": sum(1 for s in svcs if s.get("status") == "seasonal"),
        "inactive": sum(1 for s in svcs if s.get("status") == "inactive"),
        "gated": sum(1 for s in svcs if s.get("eligibility_requires")),
        "locations": sum(len(_dicts(s.get("locations"))) for s in svcs),
        "categories": size("categories.yaml"),
        "life_events": size("life_events.yaml"),
        "crisis_resources": size("crisis_resources.yaml"),
        "zip_centroids": size("zip_centroids.yaml"),
        "translated_services": size("service_translations.yaml"),
        "personas": size("personas.yaml"),
    }
    return {
        "source": label,
        "errors": report.errors,
        "warnings": report.warnings,
        "unverified": report.unverified,
        "counts": counts,
    }


def _active_city_config() -> Path:
    """The city config this process would load (CITY_CONFIG / CITY_PRESET)."""
    from app.services.city import _config_path, config_dir

    return _config_path(os.environ, config_dir(os.environ))


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Validate a data pack against config/schemas/ and the cross-file rules.")
    ap.add_argument("--strict", action="store_true", help="treat unverified services as errors")
    ap.add_argument("--json", action="store_true", help="machine-readable output")
    ap.add_argument("--data-dir", help="pack directory (default: the CITY_DATA_DIR pack, else backend/app/data)")
    ap.add_argument("--city-config", help="city config to check categoryColors against (path, or relative to config/); "
                                          "default: the active config when --data-dir is not given")
    args = ap.parse_args(argv)

    city_config: Path | None = None
    try:
        if args.city_config:
            city_config = Path(args.city_config)
            if not city_config.is_file():
                city_config = schema_dir().parent / args.city_config
            if not city_config.is_file():
                raise FileNotFoundError(f"{args.city_config} not found (as given or under config/)")
        elif not args.data_dir:
            city_config = _active_city_config()
    except Exception as exc:  # noqa: BLE001 — CityConfigError, FileNotFoundError
        print(f"ERROR   city config: {exc}", file=sys.stderr)
        return 1

    result = validate_pack(args.data_dir, strict=args.strict, city_config=city_config)
    if args.json:
        print(json.dumps(result, indent=2, ensure_ascii=False))
    else:
        for issue in result["errors"]:
            print(f"ERROR   {format_issue(issue)}")
        for issue in result["warnings"]:
            print(f"WARNING {format_issue(issue)}")
        print(
            f"{result['source']}: {result['counts']['services']} services, {len(result['errors'])} errors, "
            f"{len(result['warnings'])} warnings, {result['unverified']} unverified"
        )
    return 1 if result["errors"] else 0


if __name__ == "__main__":
    sys.exit(main())

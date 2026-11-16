"""Accepted drafts to a downloadable zip of pack YAML, built in memory.

The export never writes to the data pack. Each accepted draft becomes
``services/<slug>.yaml`` in schema key order with no verification fields
(an uploaded list is a claim by its owner, not verification). A draft merged
into an existing service keeps that service's ``id`` and ``slug``, fills only
its empty fields, unions its categories and languages and appends locations
it does not already have. The zip also holds ``review-issues.csv`` (cells that
could run as spreadsheet formulas are prefixed with a quote) and a README.
Nothing is exported while any draft has a validation error.
"""

from __future__ import annotations

import csv
import io
import json
import re
import zipfile
from copy import deepcopy
from typing import Any

import yaml

from app.services.partner_import.finalize import validate_services
from app.services.partner_import.pack_context import PackContext
from app.services.partner_import.tables import sanitize_file_name

SERVICE_KEYS = ("id", "slug", "name", "provider_name", "description", "eligibility_summary", "eligibility_requires",
                "how_to_apply", "cost", "cost_type", "website_url", "phone", "email", "languages_offered",
                "accessibility_features", "status", "categories", "locations", "documents", "provider_type", "sources")
LOCATION_KEYS = ("id", "service_id", "name", "address", "city", "state", "zip_code", "latitude", "longitude",
                 "phone", "is_primary", "hours")
# Dropped on export: staff set these after checking an entry themselves.
VERIFICATION_KEYS = ("last_verified_date", "verified_by", "hours_verified")
_UNION_KEYS = ("categories", "languages_offered", "accessibility_features", "eligibility_requires")
_SLUG_RE = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")
_FORMULA_LEAD = ("=", "+", "-", "@", "\t", "\r")
MAX_ITEMS = 2000


class ExportInvalid(Exception):
    """Some drafts cannot be exported; ``problems`` lists them per slug."""

    def __init__(self, problems: list[dict[str, Any]]) -> None:
        super().__init__("drafts have validation errors")
        self.problems = problems


def csv_safe(value: Any) -> str:
    text = "" if value is None else str(value)
    return "'" + text if text.startswith(_FORMULA_LEAD) else text


def _ordered(record: dict[str, Any], keys: tuple[str, ...]) -> dict[str, Any]:
    out = {k: record[k] for k in keys if k in record}
    out.update({k: v for k, v in record.items() if k not in out and k not in VERIFICATION_KEYS})
    return out


def clean_service(service: dict[str, Any]) -> dict[str, Any]:
    """Schema key order, verification fields removed (also on locations)."""
    svc = _ordered(deepcopy(service), SERVICE_KEYS)
    for key in VERIFICATION_KEYS:
        svc.pop(key, None)
    if isinstance(svc.get("locations"), list):
        svc["locations"] = [
            {k: v for k, v in _ordered(loc, LOCATION_KEYS).items() if k not in VERIFICATION_KEYS}
            if isinstance(loc, dict) else loc
            for loc in svc["locations"]
        ]
    return svc


def _location_key(loc: dict[str, Any]) -> tuple[str, str]:
    street = " ".join(re.findall(r"[a-z0-9]+", str(loc.get("address", "")).lower()))
    return street, str(loc.get("zip_code", ""))[:5]


def merge_into(existing: dict[str, Any], incoming: dict[str, Any]) -> dict[str, Any]:
    """The existing record with the draft's facts added where it has none."""
    merged = deepcopy(existing)
    for key, value in incoming.items():
        if key in ("id", "slug", "locations", "status") or key in VERIFICATION_KEYS:
            continue
        if key in _UNION_KEYS and isinstance(value, list):
            current = merged.get(key) if isinstance(merged.get(key), list) else []
            merged[key] = list(dict.fromkeys([*current, *value]))
        elif merged.get(key) in (None, "", []) and value not in (None, "", []):
            merged[key] = deepcopy(value)
    current_locs = [loc for loc in merged.get("locations") or [] if isinstance(loc, dict)]
    known = {_location_key(loc) for loc in current_locs}
    ids = {loc.get("id") for loc in current_locs}
    added = 0
    for loc in incoming.get("locations") or []:
        if not isinstance(loc, dict) or _location_key(loc) in known:
            continue
        known.add(_location_key(loc))
        added += 1
        new_id = f"loc-{merged['slug']}-import-{added}"
        while new_id in ids:
            added += 1
            new_id = f"loc-{merged['slug']}-import-{added}"
        ids.add(new_id)
        current_locs.append({**deepcopy(loc), "id": new_id, "service_id": merged["id"], "is_primary": not current_locs})
    if current_locs:
        merged["locations"] = current_locs
    # The merged entry now carries unverified facts, so it is unverified as a whole.
    return clean_service(merged)


def _header(item: dict[str, Any]) -> str:
    prov = item.get("provenance") if isinstance(item.get("provenance"), dict) else {}
    name = sanitize_file_name(str(prov.get("file_name") or ""))
    sheet = sanitize_file_name(str(prov.get("sheet") or ""))[:60]
    rows = ", ".join(str(int(r)) for r in (prov.get("rows") or [])[:20] if isinstance(r, int) and not isinstance(r, bool))
    action = f"merged into the existing entry {item['merge_into']}" if item.get("merge_into") else "new entry"
    return (f"# Draft from a partner-list import ({action}). Source: {name}, {sheet}, rows {rows or '?'}.\n"
            "# Unverified: an uploaded list is a claim by its owner. Check every field with the provider.\n")


def check(items: list[dict[str, Any]], ctx: PackContext) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Clean or merge each accepted item and validate: ``(prepared, problems)``."""
    problems: list[dict[str, Any]] = []
    existing_ids = {str(s.get("id")) for s in ctx.services.values()}
    prepared: list[dict[str, Any]] = []
    seen: set[str] = set()
    for i, item in enumerate(items[:MAX_ITEMS]):
        service = item.get("service")
        target = item.get("merge_into")
        if not isinstance(service, dict):
            problems.append({"index": i, "slug": None, "errors": [{"path": "", "code": "bad_item", "message": "Missing service."}]})
            continue
        if target:
            if target not in ctx.services:
                problems.append({"index": i, "slug": target, "errors": [{"path": "slug", "code": "merge_target_missing",
                                 "message": f"No service with slug {target!r} in the pack."}]})
                continue
            record = merge_into(ctx.services[target], service)
        else:
            record = clean_service(service)
            slug, sid = record.get("slug"), record.get("id")
            if slug in ctx.services or sid in existing_ids:
                problems.append({"index": i, "slug": slug, "errors": [{"path": "slug", "code": "exists_in_pack",
                                 "message": "The pack already has this slug or id. Merge into it or rename the draft."}]})
                continue
        slug = record.get("slug")
        if not isinstance(slug, str) or not _SLUG_RE.match(slug):
            problems.append({"index": i, "slug": None, "errors": [{"path": "slug", "code": "bad_slug",
                             "message": "Slug must be lowercase words joined by hyphens."}]})
            continue
        if slug in seen:
            problems.append({"index": i, "slug": slug, "errors": [{"path": "slug", "code": "duplicate_slug",
                             "message": "Two accepted drafts write the same file."}]})
            continue
        seen.add(slug)
        prepared.append({**item, "index": i, "record": record})
    if prepared:
        results, _pack_issues = validate_services([p["record"] for p in prepared], ctx)
        for p, result in zip(prepared, results):
            p["warnings"] = result["warnings"]
            if result["errors"]:
                problems.append({"index": p["index"], "slug": result["slug"], "errors": result["errors"]})
    return prepared, problems


def prepare(items: list[dict[str, Any]], ctx: PackContext) -> list[dict[str, Any]]:
    """``check``, raising ``ExportInvalid`` when anything would not pass ``validate_pack``."""
    if len(items) > MAX_ITEMS:
        raise ExportInvalid([{"index": None, "slug": None, "errors": [
            {"path": "", "code": "too_many_items", "message": f"Export at most {MAX_ITEMS} drafts at a time."}]}])
    prepared, problems = check(items, ctx)
    if problems:
        raise ExportInvalid(problems)
    return prepared


def _issues_csv(prepared: list[dict[str, Any]]) -> str:
    buf = io.StringIO()
    writer = csv.writer(buf, lineterminator="\r\n")
    writer.writerow(["slug", "name", "action", "kind", "code", "message", "source_file", "sheet", "rows"])
    for p in prepared:
        record, prov = p["record"], p.get("provenance") if isinstance(p.get("provenance"), dict) else {}
        action = f"merge into {p['merge_into']}" if p.get("merge_into") else "new"
        rows = " ".join(str(r) for r in (prov.get("rows") or [])[:50] if isinstance(r, int))
        base = [record.get("slug"), record.get("name"), action]
        tail = [sanitize_file_name(str(prov.get("file_name") or "")), str(prov.get("sheet") or "")[:60], rows]
        notes = [("flag", f.get("code"), f.get("message")) for f in p.get("flags") or [] if isinstance(f, dict)]
        notes += [("warning", w.get("code"), w.get("message")) for w in p.get("warnings") or []]
        notes += [("suggestion", path, "Proposed by the import, not stated in the list. Check it.")
                  for path in p.get("suggestions") or [] if isinstance(path, str)]
        for kind, code, message in notes or [("note", "", "No open issues.")]:
            writer.writerow([csv_safe(v) for v in (*base, kind, code, message, *tail)])
    return buf.getvalue()


_README = """Partner-list import: draft catalog entries

These files are drafts for staff review. They were built from an uploaded
partner list and are unverified. Before copying a file into the data pack's
services/ folder:

1. Check every field with the provider (phone, address, hours, eligibility).
2. Replace any placeholder eligibility text and confirm the categories.
3. Fill in coordinates where review-issues.csv says they are approximate
   (ZIP-code centre) or missing.
4. Run `npm run validate:pack` from frontend/ and fix what it reports.
5. Record your own verification (last_verified_date, verified_by) only after
   you have checked the entry yourself.

Merged entries keep the existing id and slug and replace that service's file.
review-issues.csv lists each entry's flags, warnings and suggested fields.
"""


def build_zip(prepared: list[dict[str, Any]]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for p in prepared:
            record = p["record"]
            body = yaml.safe_dump(json.loads(json.dumps(record)), sort_keys=False, allow_unicode=True, width=110)
            zf.writestr(f"services/{record['slug']}.yaml", _header(p) + body)
        zf.writestr("review-issues.csv", "﻿" + _issues_csv(prepared))
        zf.writestr("README.txt", _README)
    return buf.getvalue()

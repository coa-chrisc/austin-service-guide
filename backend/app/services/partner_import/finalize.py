"""Per-row drafts to reviewable draft services.

Coordinates (stated, or the ZIP centre from the pack, flagged), grouping of
rows that share a provider and differ only by location, unique slugs and ids,
duplicate checks against the pack and within the file, and ``validate_pack``
on every candidate. Nothing here is written anywhere.
"""

from __future__ import annotations

import json
import re
from collections import Counter
from copy import deepcopy
from typing import Any

from app.services.pack_validator import validate_pack
from app.services.partner_import.pack_context import PackContext, name_key, phone_key, web_key
from app.services.partner_import.to_drafts import FLAG_MESSAGES, RowDraft

# Expected for every import: entries are unverified until staff check them.
HIDDEN_CODES = {"unverified", "hours_unverified"}
_LOCATION_KEYS = ("name", "address", "city", "state", "zip_code", "latitude", "longitude", "hours")
_SLUG_MAX = 60


def slugify(text: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return slug[:_SLUG_MAX].rstrip("-") or "service"


def _place(draft: RowDraft, ctx: PackContext) -> None:
    loc = draft.location
    if loc is None:
        return
    if "latitude" in loc and "longitude" in loc:
        return
    point = ctx.zip_points.get(str(loc.get("zip_code", ""))[:5])
    if point:
        loc["latitude"], loc["longitude"] = point
        draft.flag("approximate_coordinates")
        draft.suggestions.update({"locations/0/latitude", "locations/0/longitude"})
    else:
        draft.flag("needs_coordinates")
    if not all(loc.get(k) for k in ("address", "city", "state", "zip_code")):
        draft.flag("location_incomplete")


def _group_key(draft: RowDraft) -> str:
    return json.dumps(draft.service, sort_keys=True)


class _Slugs:
    def __init__(self, taken: set[str]) -> None:
        self.taken = set(taken)

    def take(self, *candidates: str) -> str:
        for candidate in candidates:
            slug = slugify(candidate)
            if slug not in self.taken:
                self.taken.add(slug)
                return slug
        base = slugify(candidates[0])[: _SLUG_MAX - 4]
        n = 2
        while f"{base}-{n}" in self.taken:
            n += 1
        self.taken.add(f"{base}-{n}")
        return f"{base}-{n}"


def _assemble(members: list[RowDraft], slug: str) -> dict[str, Any]:
    first = members[0]
    service = {"id": f"svc-{slug}", "slug": slug, **deepcopy(first.service)}
    flags: dict[str, str] = {}
    suggestions: set[str] = set()
    locations: list[dict[str, Any]] = []
    seen_locations: set[str] = set()
    for member in members:
        for code, message in member.flags.items():
            flags.setdefault(code, message)
        service_paths = {p for p in member.suggestions if not p.startswith("locations/")}
        suggestions.update(service_paths)
        if member.location is None:
            if len(members) > 1:
                flags.setdefault("duplicate_location", FLAG_MESSAGES["duplicate_location"])
            continue
        key = json.dumps({k: member.location.get(k) for k in ("address", "city", "zip_code", "name")}, sort_keys=True)
        if key in seen_locations:
            flags.setdefault("duplicate_location", FLAG_MESSAGES["duplicate_location"])
            continue
        seen_locations.add(key)
        loc_index = len(locations)
        for path in member.suggestions - service_paths:
            suggestions.add(path.replace("locations/0/", f"locations/{loc_index}/"))
        loc = {"id": f"loc-{slug}-{loc_index + 1}", "service_id": service["id"]}
        loc.update({k: member.location[k] for k in _LOCATION_KEYS if k in member.location})
        loc["is_primary"] = loc_index == 0
        locations.append(loc)
    if locations:
        service["locations"] = locations
    return {
        "service": service,
        "flags": [{"code": c, "message": m} for c, m in flags.items()],
        "suggestions": sorted(suggestions),
        "rows": [m.row for m in members],
        "source_rows": [{"row": m.row, "cells": m.cells} for m in members],
    }


def _pack_index(ctx: PackContext) -> tuple[dict, dict, dict, Counter]:
    phones: dict[str, list[str]] = {}
    hosts: dict[tuple[str, str], list[str]] = {}
    names: dict[str, list[str]] = {}
    host_count: Counter = Counter()
    for slug, svc in ctx.services.items():
        nums = {phone_key(svc.get("phone"))} | {phone_key(loc.get("phone")) for loc in svc.get("locations") or [] if isinstance(loc, dict)}
        for num in nums - {""}:
            phones.setdefault(num, []).append(slug)
        host, segment = web_key(svc.get("website_url"))
        if host:
            host_count[host] += 1
            hosts.setdefault((host, segment), []).append(slug)
            if segment:
                hosts.setdefault((host, ""), []).append(slug)
        names.setdefault(name_key(svc.get("name")), []).append(slug)
    return phones, hosts, names, host_count


def _matches(service: dict, phones: dict, hosts: dict, names: dict, host_count: Counter) -> dict[str, set[str]]:
    found: dict[str, set[str]] = {}
    nums = {phone_key(service.get("phone"))} | {phone_key(loc.get("phone")) for loc in service.get("locations", [])}
    for num in nums - {""}:
        for slug in phones.get(num, []):
            found.setdefault(slug, set()).add("phone")
    host, segment = web_key(service.get("website_url"))
    if host:
        # A shared host (a city or umbrella site) only matches on its first path segment too.
        shared = host_count[host] > 2
        key = (host, segment) if shared else (host, "")
        for slug in hosts.get(key, []) if (segment or not shared) else []:
            found.setdefault(slug, set()).add("website")
    for slug in names.get(name_key(service.get("name")), []):
        found.setdefault(slug, set()).add("name")
    return found


def _validate(drafts: list[dict[str, Any]], ctx: PackContext) -> list[dict[str, str]]:
    files = ctx.validation_files()
    for draft in drafts:
        files[f"services/{draft['service']['slug']}.yaml"] = draft["service"]
    report = validate_pack(files)
    by_file: dict[str, dict[str, list]] = {}
    for issue in report["errors"] + report["warnings"]:
        if issue["code"] in HIDDEN_CODES:
            continue
        by_file.setdefault(issue["file"], {"errors": [], "warnings": []})[
            "errors" if issue["severity"] == "error" else "warnings"
        ].append({k: issue[k] for k in ("path", "code", "message")})
    unattributed: list[dict[str, str]] = []
    names = set()
    for draft in drafts:
        name = f"services/{draft['service']['slug']}.yaml"
        names.add(name)
        found = by_file.get(name, {"errors": [], "warnings": []})
        draft["errors"], draft["warnings"] = found["errors"], found["warnings"]
    for file_name, found in by_file.items():
        # Issues in the pack's own files (categories.yaml, ...) are not about the drafts.
        if file_name not in names and file_name.startswith("services/"):
            for issue in found["errors"] + found["warnings"]:
                unattributed.append({"file": file_name, **issue})
    return unattributed


def validate_services(services: list[dict[str, Any]], ctx: PackContext) -> tuple[list[dict[str, Any]], list[dict[str, str]]]:
    """Validate edited drafts sent back by the reviewer: per-service issues plus pack-level ones."""
    drafts = [{"service": s} for s in services]
    pack_issues = _validate(drafts, ctx)
    return [{"slug": d["service"].get("slug"), "errors": d["errors"], "warnings": d["warnings"]} for d in drafts], pack_issues


def finalize(rows: list[RowDraft], ctx: PackContext, provenance: dict[str, str], group: bool = True) -> dict[str, Any]:
    for row in rows:
        _place(row, ctx)
    groups: dict[str, list[RowDraft]] = {}
    order: list[str] = []
    for row in rows:
        key = _group_key(row) if group else f"row-{row.row}"
        if key not in groups:
            groups[key] = []
            order.append(key)
        groups[key].append(row)

    # New ids are svc-<slug>, so a slug is taken when the pack has it as a slug or inside an id.
    slugs = _Slugs(set(ctx.services) | {str(s.get("id", "")).removeprefix("svc-") for s in ctx.services.values()})
    drafts: list[dict[str, Any]] = []
    for key in order:
        members = groups[key]
        svc = members[0].service
        slug = slugs.take(svc["name"], f"{svc['provider_name']} {svc['name']}")
        draft = _assemble(members, slug)
        draft["key"] = f"r{members[0].row}"
        draft["grouped"] = len(members) > 1
        draft["provenance"] = {**provenance, "row": members[0].row, "rows": draft.pop("rows")}
        drafts.append(draft)

    phones, hosts, names, host_count = _pack_index(ctx)
    for draft in drafts:
        found = _matches(draft["service"], phones, hosts, names, host_count)
        draft["duplicates"] = [
            {"slug": slug, "id": ctx.services[slug].get("id"), "name": ctx.services[slug].get("name"), "reasons": sorted(reasons)}
            for slug, reasons in sorted(found.items(), key=lambda kv: -len(kv[1]))[:3]
        ]
    _in_file_duplicates(drafts)
    pack_issues = _validate(drafts, ctx)
    return {"drafts": drafts, "pack_issues": pack_issues}


def _in_file_duplicates(drafts: list[dict[str, Any]]) -> None:
    seen: dict[tuple[str, str], list[str]] = {}
    for draft in drafts:
        svc = draft["service"]
        keys = {("phone", phone_key(svc.get("phone"))), ("website", "/".join(web_key(svc.get("website_url")))),
                ("name", name_key(svc.get("name")))}
        draft["_keys"] = {k for k in keys if k[1] and k[1] != "/"}
        for k in draft["_keys"]:
            seen.setdefault(k, []).append(draft["key"])
    for draft in drafts:
        others = {other for k in draft.pop("_keys") for other in seen[k] if other != draft["key"]}
        draft["duplicate_in_file"] = sorted(others)

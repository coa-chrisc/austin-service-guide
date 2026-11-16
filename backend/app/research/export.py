"""Export accepted drafts as a data pack zip (phase A of #18's export).

The zip is a complete minimal pack that passes ``validate:pack``:
``pack.yaml``, ``categories.yaml`` (copied from the deployment's pack),
empty ``life_events.yaml`` and ``crisis_resources.yaml``, one
``services/<slug>.yaml`` per accepted draft, and ``SOURCES.md`` listing every
URL used. Entries stay unverified: verification fields are stripped even if
someone typed them into a draft.
"""

from __future__ import annotations

import io
import re
import zipfile
from datetime import datetime, timezone
from typing import Any

import yaml

VERIFICATION_FIELDS = ("last_verified_date", "verified_by")
GENERATOR = "catalog-research 0.1.0"


def strip_verification(svc: dict) -> dict:
    svc = {k: v for k, v in svc.items() if k not in VERIFICATION_FIELDS}
    locations = []
    for loc in svc.get("locations") or []:
        loc = dict(loc)
        if loc.get("hours_verified") is True:
            loc.pop("hours_verified")
        locations.append(loc)
    if "locations" in svc:
        svc["locations"] = locations
    return svc


def dump_yaml(data: Any) -> str:
    return yaml.safe_dump(data, sort_keys=False, allow_unicode=True, width=100)


def _pack_id(place: dict) -> str:
    text = "-".join(str(place.get(k) or "") for k in ("city", "county", "state") if place.get(k))
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-") or "research-draft"


def build_export(job: dict, accepted: list[dict], categories_yaml: list[dict]) -> bytes:
    place = job["params"]["place"]
    label = ", ".join(str(place[k]) for k in ("city", "county", "state") if place.get(k))
    manifest = {
        "schema_version": 1,
        "id": _pack_id(place),
        "name": f"{label} (research draft)",
        "region": {k: v for k, v in {"city": place.get("city"), "county": place.get("county"),
                                     "state": place.get("state"), "country": "US"}.items() if v},
        "generated_by": GENERATOR,
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "notes": (f"Accepted drafts from research job {job['id']}. Every entry is UNVERIFIED: staff must confirm "
                  "each one with the provider and record last_verified_date and verified_by before relying on it."),
    }
    buf = io.BytesIO()
    sources: dict[str, dict] = {}
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("pack.yaml", dump_yaml(manifest))
        zf.writestr("categories.yaml", dump_yaml(categories_yaml))
        zf.writestr("life_events.yaml", "[]\n")
        zf.writestr("crisis_resources.yaml", "[]\n")
        for draft in accepted:
            svc = strip_verification(draft["candidate"])
            zf.writestr(f"services/{svc['slug']}.yaml", dump_yaml(svc))
            for src in svc.get("sources") or []:
                entry = sources.setdefault(src["url"], {"title": src.get("title", ""), "services": []})
                entry["services"].append(svc["slug"])
        lines = [
            f"# Sources for {manifest['name']}",
            "",
            f"Research job `{job['id']}`, exported {manifest['generated_at']}. Every URL a draft cited.",
            "Entries are unverified until staff confirm them with the provider.",
            "",
        ]
        for url in sorted(sources):
            entry = sources[url]
            title = f" ({entry['title']})" if entry["title"] else ""
            lines.append(f"- {url}{title}: {', '.join(sorted(set(entry['services'])))}")
        if not sources:
            lines.append("- (no accepted drafts)")
        zf.writestr("SOURCES.md", "\n".join(lines) + "\n")
    return buf.getvalue()

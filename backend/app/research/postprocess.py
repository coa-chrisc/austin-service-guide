"""Turn an evidence-checked candidate into a data-pack service record, and
validate it against the data-pack contract.

Never sets ``last_verified_date``, ``verified_by`` or ``hours_verified:
true``: those are staff actions. Every draft is unverified.
"""

from __future__ import annotations

import re
from typing import Any, Awaitable, Callable

import httpx

from app.research.extract import DAYS, GATES, COST_TYPES, PROVIDER_TYPES

Geocoder = Callable[[str], Awaitable["tuple[float, float, str] | None"]]

_MD = re.compile(r"(\*\*|__|`|^#+\s*|^\s*[-*]\s+)", re.M)
_TAG = re.compile(r"<[^>]{0,200}>")
_MD_LINK = re.compile(r"\[([^\]\n]*)\]\([^)\s]*\)")
_TIME = r"(\d{1,2})(?::(\d{2}))?\s*([ap])\.?\s*m\.?"
_RANGE = re.compile(_TIME + r"\s*(?:-|to|until|through)\s*" + _TIME, re.I)
_ZIP = re.compile(r"\b(\d{5})(?:-\d{4})?\b")
_GENERIC_LOCAL = {"info", "contact", "help", "support", "office", "admin", "hello", "services", "intake",
                  "questions", "inquiries", "main", "general", "team", "frontdesk", "reception", "outreach",
                  "assistance", "referrals", "donate", "volunteer", "media", "press", "foodbank", "pantry"}
LANGUAGES = {"english": "en", "spanish": "es", "español": "es", "vietnamese": "vi", "chinese": "zh",
             "mandarin": "zh", "cantonese": "yue", "arabic": "ar", "korean": "ko", "french": "fr",
             "hindi": "hi", "urdu": "ur", "burmese": "my", "swahili": "sw", "pashto": "ps", "dari": "prs",
             "farsi": "fa", "persian": "fa", "russian": "ru", "tagalog": "tl", "portuguese": "pt",
             "german": "de", "japanese": "ja", "somali": "so", "nepali": "ne", "amharic": "am",
             "american sign language": "ase", "asl": "ase"}
LIMITS = {"name": 200, "provider_name": 200, "description": 1200, "eligibility_summary": 800,
          "how_to_apply": 800, "cost": 200}


def plain(text: Any, limit: int) -> str:
    """Strip HTML and Markdown from a text field and cap its length."""
    s = _MD_LINK.sub(r"\1", str(text or ""))
    s = _TAG.sub(" ", s)
    s = _MD.sub("", s)
    s = " ".join(s.split())
    return s[:limit].rstrip()


def slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug[:60].strip("-") or "service"


def unique_slug(base: str, taken: set[str]) -> str:
    slug, n = base, 2
    while slug in taken:
        slug = f"{base}-{n}"
        n += 1
    return slug


def _fmt(h: str, m: str | None, ap: str) -> str:
    hour = int(h)
    return f"{hour}:{m or '00'} {ap.upper()}M"


def normalize_hours(value: Any) -> str | None:
    text = " ".join(str(value or "").split())
    if not text:
        return None
    low = text.lower()
    if low in ("closed", "n/a"):
        return "Closed"
    if "24" in low and "hour" in low:
        return "24 hours"
    match = _RANGE.search(text)
    if match:
        h1, m1, a1, h2, m2, a2 = match.groups()
        if 1 <= int(h1) <= 12 and 1 <= int(h2) <= 12:
            return f"{_fmt(h1, m1, a1)} - {_fmt(h2, m2, a2)}"
    return text[:60]


def is_personal_email(email: str) -> bool:
    local = email.split("@", 1)[0].lower()
    if local in _GENERIC_LOCAL or any(word in local for word in _GENERIC_LOCAL):
        return False
    return bool(re.fullmatch(r"[a-z]+[._-][a-z]+\d*", local))


def language_codes(values: Any) -> list[str]:
    out: list[str] = []
    for v in values or []:
        key = str(v).strip().lower()
        code = LANGUAGES.get(key) or (key if re.fullmatch(r"[a-z]{2,3}", key) else None)
        if code and code not in out:
            out.append(code)
    return out


async def census_geocoder(address: str) -> tuple[float, float, str] | None:
    """US Census geocoder (free, no key). Fixed host; not user-controlled."""
    params = {"address": address, "benchmark": "Public_AR_Current", "format": "json"}
    try:
        async with httpx.AsyncClient(timeout=15.0, trust_env=False) as client:
            r = await client.get("https://geocoding.geo.census.gov/geocoder/locations/onelineaddress", params=params)
            r.raise_for_status()
            matches = r.json().get("result", {}).get("addressMatches") or []
    except (httpx.HTTPError, ValueError):
        return None
    if not matches:
        return None
    coords = matches[0].get("coordinates") or {}
    zip_match = _ZIP.search(matches[0].get("matchedAddress", ""))
    try:
        return float(coords["y"]), float(coords["x"]), (zip_match.group(1) if zip_match else "")
    except (KeyError, TypeError, ValueError):
        return None


def sources_from(provenance: dict) -> list[dict]:
    by_url: dict[str, dict] = {}
    for field, refs in (provenance.get("fields") or {}).items():
        for ref in refs:
            entry = by_url.setdefault(ref["url"], {
                "url": ref["url"], "title": ref.get("title") or "", "retrieved_at": ref.get("retrieved_at") or "",
                "fields": [], "quote": ref.get("quote", "")[:1000],
            })
            top = field.split(".", 1)[0]
            if top not in entry["fields"]:
                entry["fields"].append(top)
    out = []
    for entry in by_url.values():
        entry = {k: v for k, v in entry.items() if v not in ("", [])}
        out.append(entry)
    return out


async def build_service(
    cand: dict,
    provenance: dict,
    *,
    slug: str,
    categories: set[str],
    geocode: Geocoder | None,
    default_state: str = "",
) -> dict:
    """Pack record from a checked candidate. Mutates ``provenance`` flags."""
    flags = provenance.setdefault("flags", [])
    sid = f"svc-{slug}"
    svc: dict[str, Any] = {"id": sid, "slug": slug}
    for key in ("name", "provider_name"):
        svc[key] = plain(cand.get(key), LIMITS[key]) or plain(cand.get("name"), LIMITS[key])
    for key in ("description", "eligibility_summary", "how_to_apply", "cost"):
        value = plain(cand.get(key), LIMITS[key])
        if value or key == "eligibility_summary":
            svc[key] = value  # eligibility_summary is required: empty is a validator error to fix
    if cand.get("cost_type") in COST_TYPES:
        svc["cost_type"] = cand["cost_type"]
    if cand.get("website_url"):
        svc["website_url"] = str(cand["website_url"]).strip()[:500]
    if cand.get("phone"):
        svc["phone"] = str(cand["phone"]).strip()[:40]
    email = str(cand.get("email") or "").strip()
    if email:
        if is_personal_email(email):
            flags.append({"field": "email", "message": "looks like a personal email; removed (organisation contacts only)"})
            provenance.get("fields", {}).pop("email", None)
        else:
            svc["email"] = email[:200]
    langs = language_codes(cand.get("languages_offered"))
    if langs:
        svc["languages_offered"] = langs
    svc["status"] = "active"
    cats = [c for c in cand.get("categories") or [] if c in categories][:3]
    svc["categories"] = cats
    gates = [g for g in cand.get("eligibility_requires") or [] if g in GATES]
    criteria = {k: v for k, v in (cand.get("extracted_criteria") or {}).items() if v}
    if gates:
        svc["eligibility_requires"] = gates
    if cand.get("provider_type") in PROVIDER_TYPES:
        svc["provider_type"] = cand["provider_type"]

    locations = []
    for i, loc in enumerate(cand.get("locations") or []):
        address = plain(loc.get("address"), 200)
        city = plain(loc.get("city"), 100)
        state = plain(loc.get("state"), 40).upper()
        if not re.fullmatch(r"[A-Z]{2}", state):
            state = default_state.upper()
        zip_match = _ZIP.search(str(loc.get("zip_code") or ""))
        zip_code = zip_match.group(1) if zip_match else ""
        geo = await geocode(f"{address}, {city}, {state} {zip_code}".strip()) if geocode else None
        if geo is None:
            flags.append({"field": f"locations.{i}.address",
                          "message": f"address could not be placed on the map; location left out: {address}, {city} {state} {zip_code}"})
            continue
        lat, lng, geo_zip = geo
        entry: dict[str, Any] = {
            "id": f"loc-{slug}-{len(locations) + 1}",
            "service_id": sid,
            "name": plain(loc.get("name"), 200) or svc["name"],
            "address": address,
            "city": city,
            "state": state if re.fullmatch(r"[A-Z]{2}", state) else "",
            "zip_code": zip_code or geo_zip,
            "latitude": round(lat, 6),
            "longitude": round(lng, 6),
            "is_primary": not locations,
        }
        if loc.get("phone"):
            entry["phone"] = str(loc["phone"]).strip()[:40]
        hours = {d: normalize_hours((loc.get("hours") or {}).get(d)) for d in DAYS}
        hours = {d: v for d, v in hours.items() if v}
        if hours:
            entry["hours"] = hours
        locations.append(entry)
    if locations:
        svc["locations"] = locations
    svc["sources"] = sources_from(provenance)
    if criteria:
        provenance["extracted_criteria"] = criteria
    return svc


def validate_service(svc: dict, categories_yaml: list[dict]) -> dict:
    """Run the data-pack contract over one service in a minimal pack."""
    from app.services.pack_validator import validate_pack

    name = f"services/{svc.get('slug') or 'draft'}.yaml"
    result = validate_pack({
        "categories.yaml": categories_yaml,
        "life_events.yaml": [],
        "crisis_resources.yaml": [],
        name: svc,
    })
    keep = lambda issues: [i for i in issues if i["file"] == name and i["code"] != "unverified"]  # noqa: E731
    return {"errors": keep(result["errors"]), "warnings": keep(result["warnings"])}


def confidence(svc: dict, provenance: dict, model_confidence: Any) -> float:
    supported = provenance.get("fields") or {}
    checks = [
        "name" in supported or bool(svc.get("name")),
        bool(svc.get("phone")) or any(loc.get("phone") for loc in svc.get("locations", [])),
        "eligibility_summary" in supported,
        "description" in supported,
        bool(svc.get("website_url")),
        bool(svc.get("locations")),
    ]
    try:
        model = min(max(float(model_confidence), 0.0), 1.0)
    except (TypeError, ValueError):
        model = 0.5
    return round(model * sum(checks) / len(checks), 3)

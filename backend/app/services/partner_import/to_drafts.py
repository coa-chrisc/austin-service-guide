"""Confirmed mapping to the reduced table, then one draft service per row.

Only mapped columns are read (``reduce_table``); every cell then passes the
value filters for its field before it is used, shown or sent anywhere. The
per-row drafts are grouped, given ids and checked in ``finalize``.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from app.services.partner_import import filters
from app.services.partner_import.hours_text import normalize_hours
from app.services.partner_import.mapping import FIELDS, data_rows, headers_for
from app.services.partner_import.tables import ParsedTable
from app.services.partner_import.vocab import language_codes, state_code

_JOIN = {"description": " ", "eligibility_summary": " ", "how_to_apply": " ", "address": ", ",
         "categories": ", ", "languages_offered": ", ", "hours": "; "}
_MAX_LEN = {"name": 200, "provider_name": 200, "description": 1500, "eligibility_summary": 1000,
            "how_to_apply": 1000, "cost": 200, "location_name": 200, "address": 300, "city": 100}
ELIGIBILITY_PLACEHOLDER = "Not stated in the partner list. Contact the provider to check who qualifies."

FLAG_MESSAGES = {
    "resident_identifier_removed": "A resident identifier (SSN, date of birth, card or ID number) was removed from the text.",
    "contact_name_removed": "A contact-person phrase (\"contact: ...\", \"ask for ...\", \"attn ...\") was removed.",
    "direct_line_removed": "A mobile, direct or fax number was removed.",
    "extension_removed": "A phone extension was removed. Add it back only if it is the program's public line.",
    "extra_phones_dropped": "The phone cell held several numbers; only the main one was kept.",
    "phone_unrecognised": "The phone cell did not hold a recognisable number.",
    "personal_email_removed": "An email that looks personal was removed. Add a role address (info@, intake@) if there is one.",
    "website_unrecognised": "The website cell was not a web address.",
    "eligibility_missing": "The list does not say who qualifies; the eligibility text is a placeholder to replace.",
    "provider_missing": "No organisation was given; the service name was used.",
    "name_missing": "No service name was given; the organisation name was used.",
    "category_missing": "No category could be matched. Choose one.",
    "hours_check": "Hours were read from free text with a guess (AM/PM, extra wording or two ranges in a day). Check them.",
    "hours_unparsed": "The hours text could not be read. Enter the hours by day.",
    "address_unsplit": "The address could not be split into street, city, state and ZIP.",
    "location_incomplete": "The location is missing a street, city, state or ZIP.",
    "approximate_coordinates": "Coordinates are the ZIP code's centre, not the street address.",
    "needs_coordinates": "The location needs a latitude and longitude.",
    "state_assumed": "No state was given; the deployment's state was used.",
    "hours_need_location": "Hours were given but no address, so there is no location to attach them to.",
    "model_suggested": "Fields marked as suggestions were proposed by the model. Check each one.",
    "duplicate_location": "Two rows gave the same service or location; it is listed once.",
}

_ADDRESS_RE = re.compile(
    r"^(?P<street>.+?),\s*(?P<city>[^,]+?),?\s+(?P<state>[A-Za-z]{2}|[A-Za-z][A-Za-z ]+[A-Za-z])\.?,?\s+"
    r"(?P<zip>\d{5}(?:-\d{4})?)\s*(?:,?\s*(?:USA|US|United States))?$"
)
_ZIP_RE = re.compile(r"\b(\d{5}(?:-\d{4})?)\b")
# Extra words for the loose category guess; used only for slugs the pack has,
# and every loose guess is marked as a suggestion for the reviewer.
_HINTS: dict[str, set[str]] = {
    "food": {"pantry", "pantries", "grocery", "groceries", "meal", "meals", "snap", "kitchen"},
    "housing": {"rent", "rental", "eviction", "tenant", "tenants", "shelter", "homeless", "homelessness"},
    "legal": {"legal", "lawyer", "lawyers", "attorney", "eviction", "court"},
    "education": {"ged", "literacy", "esl", "classes", "tutoring", "school"},
    "employment": {"job", "jobs", "career", "workforce", "hiring"},
    "healthcare": {"medical", "dental", "health", "doctor"},
    "mental_health": {"counseling", "counselling", "therapy", "crisis", "mental"},
    "emergency": {"crisis", "hotline", "emergency"},
    "childcare": {"daycare", "preschool", "childcare"},
    "senior": {"seniors", "elderly", "aging", "ageing"},
    "utilities": {"utility", "electric", "energy", "water"},
    "transportation": {"transit", "rides", "ride", "transportation", "bus"},
}


@dataclass
class RowDraft:
    row: int
    cells: list[dict[str, str]]
    service: dict[str, Any]
    location: dict[str, Any] | None = None
    flags: dict[str, str] = field(default_factory=dict)
    suggestions: set[str] = field(default_factory=set)
    hours_text: str = ""
    hours_confident: bool = True
    address_text: str = ""  # set only when code could not split it
    category_text: str = ""

    def flag(self, code: str, message: str | None = None) -> None:
        self.flags.setdefault(code, message or FLAG_MESSAGES.get(code, code))


def reduce_table(table: ParsedTable, header_row: int, mapping: dict[int, str]) -> list[dict[str, Any]]:
    """Mapped columns only: ``[{row, cells: [(header, field, raw)]}]``. Dropped columns never leave here."""
    headers = headers_for(table, header_row)
    keep = sorted((i, f) for i, f in mapping.items() if f in FIELDS and 0 <= i < len(headers))
    reduced = []
    for row_no, cells in data_rows(table, header_row):
        picked = [(headers[i], f, cells[i]) for i, f in keep if cells[i]]
        if picked:
            reduced.append({"row": row_no, "cells": picked})
    return reduced


def _clip(field_name: str, text: str) -> str:
    limit = _MAX_LEN.get(field_name)
    return text[:limit].rstrip() if limit and len(text) > limit else text


def _filtered_values(cells: list[tuple[str, str, str]], flags: set[str]) -> tuple[dict[str, str], list[dict[str, str]]]:
    raw_names = tuple(raw for _, f, raw in cells if f in ("name", "provider_name"))
    parts: dict[str, list[str]] = {}
    shown: list[dict[str, str]] = []
    for header, field_name, raw in cells:
        if field_name == "phone":
            value = filters.pick_phone(raw, flags)
        elif field_name == "email":
            value = filters.pick_email(raw, raw_names, flags)
        elif field_name == "website_url":
            value = filters.clean_website(raw, flags)
        else:
            value = filters.clean_text(raw, flags)
        shown.append({"header": header, "field": field_name, "value": value})
        if value:
            parts.setdefault(field_name, []).append(value)
    values = {}
    for field_name, texts in parts.items():
        joined = _JOIN.get(field_name, " ").join(texts) if field_name in _JOIN else texts[0]
        values[field_name] = _clip(field_name, joined)
    return values, shown


def split_address(text: str) -> dict[str, str] | None:
    m = _ADDRESS_RE.match(text.strip())
    if not m:
        return None
    state = state_code(m.group("state"))
    if not state:
        return None
    return {"address": m.group("street").strip(), "city": m.group("city").strip(), "state": state, "zip_code": m.group("zip")}


def match_categories(text: str, categories: list[dict], *, loose: bool) -> list[str]:
    """Category slugs named in ``text``: exact slug or name, or (``loose``) a word of either."""
    out: list[str] = []
    lowered = text.lower()
    words = set(re.findall(r"[a-z]+", lowered))
    for part in re.split(r"\s*(?:,|;|/|\|)\s*", lowered):
        part = part.strip()
        for cat in categories:
            slug, name = str(cat.get("slug", "")), str(cat.get("name", "")).lower()
            if part and part in (slug, slug.replace("_", " "), name) and slug not in out:
                out.append(slug)
    if out or not loose:
        return out
    for cat in categories:
        slug = str(cat.get("slug", ""))
        cat_words = {w for w in re.findall(r"[a-z]+", f"{slug.replace('_', ' ')} {cat.get('name', '')}".lower()) if len(w) >= 4}
        if (cat_words | _HINTS.get(slug, set())) & words and slug not in out:
            out.append(slug)
    return out[:2]


def _cost_type(cost: str) -> str:
    low = cost.lower()
    if re.search(r"\bfree\b|no cost|no charge|\$0\b", low):
        return "free"
    if "sliding" in low or "income-based" in low or "income based" in low:
        return "sliding_scale"
    if any(w in low for w in ("insurance", "medicaid", "medicare", "chip")):
        return "insurance"
    if "$" in low or "fee" in low:
        return "flat_fee" if re.search(r"\$\d", low) and "vary" not in low and "varies" not in low else "varies"
    return "varies"


def _float(text: str, low: float, high: float) -> float | None:
    try:
        value = float(text.strip())
    except (ValueError, AttributeError):
        return None
    return value if low <= value <= high and value != 0 else None


def build_row(row: dict[str, Any], categories: list[dict], default_state: str) -> RowDraft | None:
    flags: set[str] = set()
    values, shown = _filtered_values(row["cells"], flags)
    name, provider = values.get("name", ""), values.get("provider_name", "")
    if not name and not provider:
        return None
    draft = RowDraft(row=row["row"], cells=shown, service={})
    for code in sorted(flags):
        draft.flag(code)
    svc = draft.service
    svc["name"] = name or provider
    svc["provider_name"] = provider or name
    if not name:
        draft.flag("name_missing")
    if not provider:
        draft.flag("provider_missing")
        draft.suggestions.add("provider_name")
    for key in ("description",):
        if values.get(key):
            svc[key] = values[key]
    if values.get("eligibility_summary"):
        svc["eligibility_summary"] = values["eligibility_summary"]
    else:
        svc["eligibility_summary"] = ELIGIBILITY_PLACEHOLDER
        draft.flag("eligibility_missing")
        draft.suggestions.add("eligibility_summary")
    if values.get("how_to_apply"):
        svc["how_to_apply"] = values["how_to_apply"]
    if values.get("cost"):
        svc["cost"] = values["cost"]
        svc["cost_type"] = _cost_type(values["cost"])
        draft.suggestions.add("cost_type")
    for key in ("website_url", "phone", "email"):
        if values.get(key):
            svc[key] = values[key]
    if values.get("languages_offered"):
        codes, unknown = language_codes(values["languages_offered"])
        if codes:
            svc["languages_offered"] = codes
        if unknown:
            draft.flag("language_unrecognised", "Languages not recognised (add their codes by hand): " + ", ".join(unknown[:5]))
    svc["status"] = "active"

    draft.category_text = values.get("categories", "")
    cats = match_categories(draft.category_text, categories, loose=False) if draft.category_text else []
    if not cats:
        cats = match_categories(" ".join([draft.category_text, svc["name"], svc["provider_name"], svc.get("description", "")]),
                                categories, loose=True)
        if cats:
            draft.suggestions.add("categories")
    if cats:
        svc["categories"] = cats
    else:
        draft.flag("category_missing")

    _build_location(draft, values, default_state)
    return draft


def _build_location(draft: RowDraft, values: dict[str, str], default_state: str) -> None:
    hours_text = values.get("hours", "")
    if not any(values.get(k) for k in ("address", "city", "zip_code", "location_name", "latitude")):
        if hours_text:
            draft.hours_text = hours_text
            draft.flag("hours_need_location")
        return
    loc: dict[str, Any] = {"name": values.get("location_name") or draft.service["provider_name"]}
    street, city = values.get("address", ""), values.get("city", "")
    state, zip_code = state_code(values.get("state", "")), values.get("zip_code", "")
    zip_match = _ZIP_RE.search(zip_code)
    zip_code = zip_match.group(1) if zip_match else (zip_code.zfill(5) if zip_code.isdigit() and len(zip_code) == 4 else "")
    if street and not (city and zip_code):
        parts = split_address(street)
        if parts:
            street, city = parts["address"], city or parts["city"]
            state, zip_code = state or parts["state"], zip_code or parts["zip_code"]
        else:
            draft.address_text = street
            draft.flag("address_unsplit")
    if not state and (city or zip_code) and default_state:
        state = default_state
        draft.flag("state_assumed")
        draft.suggestions.add("locations/0/state")
    for key, value in (("address", street), ("city", city), ("state", state), ("zip_code", zip_code)):
        if value:
            loc[key] = _clip(key, value)
    lat = _float(values.get("latitude", ""), -90, 90)
    lng = _float(values.get("longitude", ""), -180, 180)
    if lat is not None and lng is not None:
        loc["latitude"], loc["longitude"] = lat, lng
    if hours_text:
        draft.hours_text = hours_text
        result = normalize_hours(hours_text)
        if result.hours:
            loc["hours"] = result.hours
            draft.hours_confident = result.confident
            if not result.confident:
                draft.flag("hours_check")
                draft.suggestions.add("locations/0/hours")
        else:
            draft.hours_confident = False
            draft.flag("hours_unparsed")
    draft.location = loc

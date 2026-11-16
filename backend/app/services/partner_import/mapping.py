"""Deterministic column matcher: header text to catalog field, or drop with a reason.

Order of rules: the client-record guard (``guard.py``) runs first; then exact
header phrases; then the drop rules (contact people, titles, direct lines,
personal emails, notes, internal fields); then single-word keep rules. A
header nothing recognises is dropped by default and the user must choose a
field to include it.
"""

from __future__ import annotations

import re
from typing import Any

from app.services.partner_import import limits as L
from app.services.partner_import.tables import ParsedTable

# Catalog fields a column can map to, with the label staff see.
FIELDS: dict[str, str] = {
    "provider_name": "Organisation",
    "name": "Service or program name",
    "description": "Description",
    "eligibility_summary": "Who it serves (eligibility)",
    "how_to_apply": "How to apply",
    "cost": "Cost or fees",
    "phone": "Main phone",
    "website_url": "Website",
    "email": "Public email",
    "languages_offered": "Languages",
    "categories": "Category",
    "location_name": "Site name",
    "address": "Street address (or full address)",
    "city": "City",
    "state": "State",
    "zip_code": "ZIP code",
    "hours": "Hours",
    "latitude": "Latitude",
    "longitude": "Longitude",
}
DROP = "drop"

_EXACT: dict[str, str] = {
    "organization": "provider_name", "organisation": "provider_name", "organization name": "provider_name",
    "organisation name": "provider_name", "agency": "provider_name", "agency name": "provider_name",
    "partner": "provider_name", "partner name": "provider_name", "partner organization": "provider_name",
    "provider": "provider_name", "provider name": "provider_name", "org": "provider_name", "org name": "provider_name",
    "program": "name", "programme": "name", "program name": "name", "programme name": "name",
    "service": "name", "service name": "name", "program title": "name", "service title": "name",
    "phone": "phone", "main phone": "phone", "main line": "phone", "main number": "phone",
    "phone number": "phone", "telephone": "phone", "office phone": "phone", "hotline": "phone",
    "website": "website_url", "web site": "website_url", "url": "website_url", "web": "website_url",
    "web address": "website_url", "homepage": "website_url",
    "email": "email", "e mail": "email", "email address": "email", "general email": "email",
    "address": "address", "street address": "address", "street": "address", "address 1": "address",
    "address line 1": "address", "location": "address", "physical address": "address",
    "city": "city", "town": "city", "state": "state", "zip": "zip_code", "zip code": "zip_code",
    "zipcode": "zip_code", "postal code": "zip_code", "postcode": "zip_code",
    "hours": "hours", "hours of operation": "hours", "opening hours": "hours", "open hours": "hours",
    "schedule": "hours", "days and hours": "hours", "service hours": "hours",
    "eligibility": "eligibility_summary", "who we serve": "eligibility_summary",
    "who is eligible": "eligibility_summary", "population served": "eligibility_summary",
    "target population": "eligibility_summary", "eligibility requirements": "eligibility_summary",
    "cost": "cost", "fees": "cost", "fee": "cost", "cost fees": "cost", "cost and fees": "cost", "price": "cost",
    "language": "languages_offered", "languages": "languages_offered", "languages spoken": "languages_offered",
    "languages offered": "languages_offered",
    "category": "categories", "categories": "categories", "type": "categories", "service type": "categories",
    "program type": "categories", "service category": "categories",
    "description": "description", "services offered": "description", "services provided": "description",
    "what we do": "description", "about": "description", "summary": "description",
    "program description": "description", "service description": "description",
    "how to apply": "how_to_apply", "how to access": "how_to_apply", "intake process": "how_to_apply",
    "referral process": "how_to_apply", "how to get help": "how_to_apply",
    "site": "location_name", "site name": "location_name", "location name": "location_name", "branch": "location_name",
    "latitude": "latitude", "lat": "latitude", "longitude": "longitude", "lng": "longitude", "lon": "longitude",
}

# Ambiguous headers that would otherwise hit a keep word ("Service Area" is
# not a service name; "Name" may be a person).
_UNKNOWN_EXACT = {"name", "service area", "area", "county", "district", "region", "status", "id", "number"}

_PERSON = {
    "contact", "poc", "liaison", "director", "manager", "coordinator", "staff", "representative", "rep",
    "supervisor", "caseworker", "person", "attn", "attention", "lead", "officer", "ceo", "president",
}
_EMAIL = {"email", "mail"}
_PHONE = {"phone", "telephone", "tel", "line", "number", "cell", "mobile"}

# (test on token set and header text, reason). First match wins.
_DROP_RULES: list[tuple[Any, str]] = [
    (lambda t, h: bool(t & _EMAIL) and bool(t & (_PERSON | {"personal", "direct", "work"})),
     "Personal or direct email of a staff member."),
    (lambda t, h: bool(t & {"cell", "mobile", "cellphone", "pager", "direct", "ext", "extension", "personal"}),
     "Mobile, direct line or extension, usually one person's."),
    (lambda t, h: bool(t & _PHONE) and bool(t & _PERSON), "Direct line of a staff member."),
    (lambda t, h: "case manager" in h or "point of contact" in h or bool(t & _PERSON),
     "Names a contact person."),
    (lambda t, h: bool(t & {"title", "position", "role", "job"}), "Job title of a staff member."),
    (lambda t, h: bool(t & {"notes", "note", "comments", "comment", "remarks", "memo"}),
     "Notes and comments are often about people and are not catalog content."),
    (lambda t, h: bool(t & {"mou", "contract", "budget", "invoice", "funding", "grant", "amount", "owner",
                            "assigned", "vendor", "ein", "renewal", "agreement", "expiration", "expires"})
     or "last contacted" in h or "date contacted" in h or "follow up" in h,
     "Internal administrative field."),
]

# Single-word keep rules, most specific field first.
_KEEP_TOKENS: list[tuple[set[str], str]] = [
    ({"latitude", "lat"}, "latitude"),
    ({"longitude", "lng", "lon"}, "longitude"),
    ({"phone", "telephone", "tel", "hotline"}, "phone"),
    ({"email"}, "email"),
    ({"website", "url", "homepage"}, "website_url"),
    ({"zip", "zipcode", "postal", "postcode"}, "zip_code"),
    ({"city", "town"}, "city"),
    ({"state"}, "state"),
    ({"address", "street", "addr"}, "address"),
    ({"hours", "schedule"}, "hours"),
    ({"eligibility", "eligible", "serve", "serves", "served", "population", "criteria", "requirements"}, "eligibility_summary"),
    ({"cost", "costs", "fee", "fees", "price", "charge"}, "cost"),
    ({"language", "languages"}, "languages_offered"),
    ({"category", "categories", "type", "sector"}, "categories"),
    ({"description", "about", "summary", "overview", "details", "offerings", "mission"}, "description"),
    ({"apply", "application", "intake", "referral", "enroll", "enrollment"}, "how_to_apply"),
    ({"site", "branch", "campus"}, "location_name"),
    ({"organization", "organisation", "agency", "partner", "provider", "org", "nonprofit"}, "provider_name"),
    ({"program", "programme", "service"}, "name"),
]

_NORM_RE = re.compile(r"[^a-z0-9#]+")


def normalize_header(header: str) -> str:
    return _NORM_RE.sub(" ", header.lower().replace("&", " and ").replace("e-mail", "email")).strip()


def classify(header: str) -> dict[str, Any]:
    """``{action, field, reason, sensitive}`` for one header (guard not included)."""
    norm = normalize_header(header)
    if not norm:
        return {"action": DROP, "field": None, "sensitive": False,
                "reason": "No header. Choose a field to include this column."}
    if norm in _UNKNOWN_EXACT:
        return {"action": DROP, "field": None, "sensitive": False,
                "reason": "Ambiguous header, so dropped by default. Choose a field to include it."}
    if norm in _EXACT:
        field = _EXACT[norm]
        return {"action": "keep", "field": field, "sensitive": False, "reason": f"Header matches {FIELDS[field]}."}
    tokens = set(norm.split())
    for test, reason in _DROP_RULES:
        if test(tokens, norm):
            return {"action": DROP, "field": None, "sensitive": True, "reason": reason}
    for words, field in _KEEP_TOKENS:
        if tokens & words:
            return {"action": "keep", "field": field, "sensitive": False, "reason": f"Header looks like {FIELDS[field]}."}
    return {"action": DROP, "field": None, "sensitive": False,
            "reason": "Not recognised, so dropped by default. Choose a field to include it."}


def guess_header_row(table: ParsedTable) -> int:
    """1-based index into ``table.rows`` of the most header-like of the first rows."""
    best, best_score = 1, -1
    for i, (_, cells) in enumerate(table.rows[: L.HEADER_SCAN_ROWS], start=1):
        # Distinct values: a title merged across the columns counts once.
        filled = list(dict.fromkeys(c for c in cells if c))
        if len(filled) < 2:
            continue
        recognised = sum(
            1 for c in filled
            if classify(c)["field"] or classify(c)["sensitive"]
        )
        numeric = sum(1 for c in filled if re.fullmatch(r"[\d\s().,:/+-]+", c))
        score = recognised * 10 + len(filled) - numeric * 5
        if score > best_score:
            best, best_score = i, score
    return best


def column_letter(index: int) -> str:
    out = ""
    n = index + 1
    while n:
        n, rem = divmod(n - 1, 26)
        out = chr(65 + rem) + out
    return out


def headers_for(table: ParsedTable, header_row: int) -> list[str]:
    """Header text per column (``Column C`` where the header cell is blank)."""
    width = table.width
    cells = table.rows[header_row - 1][1] if 0 < header_row <= len(table.rows) else []
    return [
        (cells[i] if i < len(cells) and cells[i] else f"Column {column_letter(i)}")[:200]
        for i in range(width)
    ]


def data_rows(table: ParsedTable, header_row: int) -> list[tuple[int, list[str]]]:
    width = table.width
    return [(n, cells + [""] * (width - len(cells))) for n, cells in table.rows[header_row:]]

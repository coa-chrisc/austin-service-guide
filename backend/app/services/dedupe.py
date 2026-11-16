"""Likely-duplicate detection for service records (research drafts against
the loaded pack and against each other).

Signals, strongest first: the same phone digits, the same street address +
ZIP, the same website registrable domain, then name-token overlap. No
place-specific stopwords. A match is a prompt for a reviewer, not a merge.
"""

from __future__ import annotations

import re
from typing import Any, Iterable
from urllib.parse import urlsplit

_STOP = {"the", "of", "and", "for", "a", "an", "in", "at", "to", "inc", "llc", "program", "programs",
         "services", "service", "center", "centre"}
# Shared hosting and umbrella platforms: a common domain says nothing.
_SHARED_DOMAINS = {"google.com", "sites.google.com", "wixsite.com", "squarespace.com", "wordpress.com",
                   "github.io", "facebook.com", "linktr.ee"}
_MULTI_PART_TLDS = {"co.uk", "org.uk", "gov.uk", "com.au", "tx.us", "ca.us", "ny.us", "fl.us", "il.us", "wa.us"}


_UMBRELLA_TLDS = (".gov", ".us", ".mil", ".edu")


def _page_key(url: Any) -> str:
    text = str(url or "").strip().split("#", 1)[0].rstrip("/")
    return re.sub(r"^https?://(www\.)?", "", text, flags=re.I).casefold()


def phone_key(value: Any) -> str:
    digits = re.sub(r"\D", "", str(value or ""))
    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]
    return digits if len(digits) == 10 else ""


def registrable_domain(url: Any) -> str:
    try:
        host = (urlsplit(str(url or "")).hostname or "").lower().rstrip(".")
    except ValueError:
        return ""
    labels = host.split(".")
    if len(labels) < 2:
        return ""
    keep = 3 if ".".join(labels[-2:]) in _MULTI_PART_TLDS and len(labels) >= 3 else 2
    domain = ".".join(labels[-keep:])
    return "" if domain in _SHARED_DOMAINS else domain


# USPS street-suffix and direction abbreviations, so "Dr." matches "Drive".
_ADDRESS_WORDS = {
    "street": "st", "avenue": "ave", "av": "ave", "drive": "dr", "road": "rd", "boulevard": "blvd",
    "lane": "ln", "court": "ct", "place": "pl", "parkway": "pkwy", "highway": "hwy", "freeway": "fwy",
    "circle": "cir", "terrace": "ter", "trail": "trl", "square": "sq", "suite": "ste", "building": "bldg",
    "north": "n", "south": "s", "east": "e", "west": "w", "northeast": "ne", "northwest": "nw",
    "southeast": "se", "southwest": "sw",
}


def address_key(address: Any, zip_code: Any) -> str:
    addr = re.sub(r"[^a-z0-9 ]", " ", str(address or "").lower())
    addr = " ".join(_ADDRESS_WORDS.get(w, w) for w in addr.split())
    z = str(zip_code or "")[:5]
    return f"{addr}|{z}" if addr and z else ""


def name_tokens(name: Any) -> set[str]:
    return {t for t in re.findall(r"[a-z0-9]+", str(name or "").lower()) if t not in _STOP and len(t) > 1}


def _phones(svc: dict) -> set[str]:
    keys = {phone_key(svc.get("phone"))}
    keys |= {phone_key(loc.get("phone")) for loc in svc.get("locations") or [] if isinstance(loc, dict)}
    return {k for k in keys if k}


def _addresses(svc: dict) -> set[str]:
    keys = {address_key(loc.get("address"), loc.get("zip_code")) for loc in svc.get("locations") or [] if isinstance(loc, dict)}
    return {k for k in keys if k}


def duplicate_reasons(a: dict, b: dict) -> list[str]:
    reasons = []
    if _phones(a) & _phones(b):
        reasons.append("same phone number")
    if _addresses(a) & _addresses(b):
        reasons.append("same street address and ZIP")
    da, db = registrable_domain(a.get("website_url")), registrable_domain(b.get("website_url"))
    if da and da == db:
        if not da.endswith(_UMBRELLA_TLDS):
            reasons.append(f"same website domain ({da})")
        elif _page_key(a.get("website_url")) == _page_key(b.get("website_url")):
            # One government domain hosts many services: only the same page counts.
            reasons.append("same website page")
    ta, tb = name_tokens(a.get("name")), name_tokens(b.get("name"))
    if ta and tb:
        overlap = len(ta & tb) / len(ta | tb)
        if overlap >= 0.6:
            reasons.append(f"similar name ({round(overlap * 100)}% word overlap)")
    return reasons


def find_duplicates(candidate: dict, existing: Iterable[dict], *, source: str) -> list[dict]:
    out = []
    for svc in existing:
        if svc is candidate:
            continue
        reasons = duplicate_reasons(candidate, svc)
        if reasons:
            out.append({"slug": svc.get("slug", ""), "name": svc.get("name", ""), "source": source, "reasons": reasons})
    return out

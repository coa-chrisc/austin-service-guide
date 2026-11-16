"""Likely-duplicate detection for service records (research drafts against
the loaded pack and against each other).

A possible duplicate needs BOTH a similar service name and the same place or
organisation: the same phone digits, street address + ZIP, website
(registrable domain; on a government domain the same page), or
organisation. A shared phone or address alone is not enough (one community
center runs a food pantry, a clothing closet and job search), a similar name
alone is not enough (every county center has a "Food Pantry"), and two
records at known, different addresses are never duplicates. Names are
compared on the words that name the service: the organisation's and the
site's words are set aside, unless that leaves nothing. No place-specific
stopwords. A match is a prompt for a reviewer, not a merge.
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


def _service_tokens(svc: dict) -> set[str]:
    """Name words minus the organisation's and the site's words, so
    "Central Community Center Food Pantry" compares as "food pantry"."""
    name = str(svc.get("name") or "")
    words = name_tokens(name) - name_tokens(svc.get("provider_name"))
    for loc in svc.get("locations") or []:
        site = str(loc.get("name") or "") if isinstance(loc, dict) else ""
        if site.casefold() != name.casefold():  # a location named after the service names no site
            words -= name_tokens(site)
    return words


def _same_organisation(a: dict, b: dict) -> bool:
    ta, tb = name_tokens(a.get("provider_name")), name_tokens(b.get("provider_name"))
    if not ta or not tb:
        return False
    small, large = sorted((ta, tb), key=len)
    return small == large or (len(small) >= 2 and small <= large)


def _name_overlap(a: dict, b: dict) -> float:
    sa, sb = _service_tokens(a), _service_tokens(b)
    if not sa or not sb:  # the name is just the organisation's or site's: compare whole names
        sa, sb = name_tokens(a.get("name")), name_tokens(b.get("name"))
    return len(sa & sb) / len(sa | sb) if sa and sb else 0.0


def duplicate_reasons(a: dict, b: dict) -> list[str]:
    """Why ``a`` may duplicate ``b``; empty when it does not (see the module doc)."""
    overlap = _name_overlap(a, b)
    if overlap < 0.6:
        return []
    addr_a, addr_b = _addresses(a), _addresses(b)
    if addr_a and addr_b and not addr_a & addr_b:
        return []  # the same kind of service at two different places
    reasons = []
    if _phones(a) & _phones(b):
        reasons.append("same phone number")
    if addr_a & addr_b:
        reasons.append("same street address and ZIP")
    da, db = registrable_domain(a.get("website_url")), registrable_domain(b.get("website_url"))
    if da and da == db:
        if not da.endswith(_UMBRELLA_TLDS):
            reasons.append(f"same website domain ({da})")
        elif _page_key(a.get("website_url")) == _page_key(b.get("website_url")):
            # One government domain hosts many services: only the same page counts.
            reasons.append("same website page")
    if _same_organisation(a, b):
        reasons.append("same organisation")
    if not reasons:
        return []  # a similar name alone says nothing
    return [*reasons, f"similar name ({round(overlap * 100)}% word overlap)"]


def find_duplicates(candidate: dict, existing: Iterable[dict], *, source: str) -> list[dict]:
    out = []
    for svc in existing:
        if svc is candidate:
            continue
        reasons = duplicate_reasons(candidate, svc)
        if reasons:
            out.append({"slug": svc.get("slug", ""), "name": svc.get("name", ""), "source": source, "reasons": reasons})
    return out

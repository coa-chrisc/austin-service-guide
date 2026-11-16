"""Evidence check, in code, after extraction: the main defence against
invented contact details.

- Every evidence ``quote`` must occur in the stored text of the page after
  normalisation (Unicode NFKC, quotes and dashes folded, whitespace
  collapsed, case folded). Quotes that do not are dropped.
- Sentences that look like instructions to a model ("ignore previous",
  "system:", "you are ...") are removed from the text used for checking and
  reported to the reviewer, so a value that appears only inside an injected
  instruction is never supported.
- Every phone number must be one the page states; every email must appear in
  the page; the website must be the page itself or a link on it.
- A field without supporting text is blanked and flagged "no supporting
  text found". A location without a supported address is dropped.
"""

from __future__ import annotations

import re
import unicodedata
from datetime import datetime
from typing import Any

from app.research.search import host_of

_FOLD = str.maketrans({
    "‘": "'", "’": "'", "“": '"', "”": '"', "–": "-", "—": "-", "−": "-",
    " ": " ",
})
INJECTION_PATTERNS = [
    re.compile(p, re.I) for p in (
        r"\bignore\s+(all\s+|any\s+)?(the\s+)?(previous|prior|above|earlier)\b",
        r"\bdisregard\s+(all\s+|any\s+)?(the\s+)?(previous|prior|above|earlier|your)\b",
        r"(^|\s)(system|assistant|developer)\s*:",
        r"\byou\s+are\s+(now\s+)?(an?\s+)?(ai|assistant|language model|chatgpt|gpt)\b",
        r"\b(new|updated)\s+instructions?\b",
        r"\bset\s+the\s+(phone|email|website|address)\b",
    )
]
_SENTENCE = re.compile(r"[^.!?\n]+[.!?]?")
PHONE_RE = re.compile(r"(?:\+?1[\s.\-]?)?\(?\b(\d{3})\)?[\s.\-]?(\d{3})[\s.\-]?(\d{4})\b")
EMAIL_RE = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}")
TEXT_FIELDS = ("description", "eligibility_summary", "how_to_apply", "cost")
MIN_QUOTE = 6


def local_date(timestamp: Any) -> str:
    """The retrieval day in this host's timezone: the pack validator compares
    ``retrieved_at`` with ``date.today()``, so a UTC date can read as "future"."""
    try:
        return datetime.fromisoformat(str(timestamp)).astimezone().date().isoformat()
    except ValueError:
        return str(timestamp or "")[:10]


def normalize(text: str) -> str:
    text = unicodedata.normalize("NFKC", text or "").translate(_FOLD)
    return " ".join(text.split()).casefold()


def injection_hits(text: str) -> list[str]:
    """Sentences in ``text`` that read like instructions to a model."""
    hits = []
    for match in _SENTENCE.finditer(text or ""):
        sentence = match.group(0).strip()
        if sentence and any(p.search(sentence) for p in INJECTION_PATTERNS):
            hits.append(sentence[:300])
    return hits


def strip_injections(text: str) -> str:
    out = text or ""
    for sentence in injection_hits(out):
        out = out.replace(sentence, " ")
    return out


def phone_digits(value: str) -> str:
    digits = re.sub(r"\D", "", value or "")
    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]
    return digits


def phones_in(text: str) -> set[str]:
    return {"".join(m.groups()) for m in PHONE_RE.finditer(text or "")}


def _url_key(url: str) -> str:
    url = (url or "").strip().split("#", 1)[0].rstrip("/")
    return re.sub(r"^https?://(www\.)?", "", url, flags=re.I).casefold()


def check_candidate(candidate: dict, page: dict) -> tuple[dict, dict]:
    """Return (checked candidate, provenance) for one extracted service.

    ``page`` is a stored source: url, final_url, title, retrieved_at, text, links.
    Provenance: {"fields": {field: [{url, title, quote, retrieved_at}]},
    "missing": [field], "flags": [{field, message}]}.
    """
    raw_text = page.get("text") or ""
    clean = strip_injections(raw_text)
    norm = normalize(clean)
    page_phones = phones_in(clean)
    page_emails = {e.casefold() for e in EMAIL_RE.findall(clean)}
    flags: list[dict] = []
    for sentence in injection_hits(raw_text)[:5]:
        flags.append({"field": "page", "message": f"Instruction-like text on the source page (ignored): {sentence[:200]}"})

    cand = dict(candidate)
    ref = {"url": page.get("final_url") or page.get("url"), "title": page.get("title") or "",
           "retrieved_at": local_date(page.get("retrieved_at"))}
    fields: dict[str, list[dict]] = {}
    for ev in cand.pop("evidence", None) or []:
        if not isinstance(ev, dict):
            continue
        field, quote = str(ev.get("field") or "").strip(), str(ev.get("quote") or "").strip()
        if len(quote) < MIN_QUOTE or not field:
            continue
        if normalize(quote) in norm:
            fields.setdefault(field, []).append({**ref, "quote": quote[:1000]})
        else:
            flags.append({"field": field, "message": "quoted text was not found on the cited page; quote dropped"})
    missing: list[str] = []

    def blank(field: str, message: str = "no supporting text found") -> None:
        missing.append(field)
        flags.append({"field": field, "message": message})

    for field in TEXT_FIELDS:
        if cand.get(field) and field not in fields:
            cand[field] = None
            blank(field)
        elif not cand.get(field):
            missing.append(field)

    phone = cand.get("phone")
    if phone:
        if phone_digits(phone) not in page_phones:
            cand["phone"] = None
            blank("phone", "phone number does not appear on the page; removed")
        else:
            fields.setdefault("phone", [{**ref, "quote": phone}])
    email = (cand.get("email") or "").strip()
    if email:
        if email.casefold() not in page_emails:
            cand["email"] = None
            blank("email", "email does not appear on the page; removed")
        else:
            fields.setdefault("email", [{**ref, "quote": email}])
    website = (cand.get("website_url") or "").strip()
    if website:
        known = {_url_key(page.get("url", "")), _url_key(page.get("final_url", ""))}
        known |= {_url_key(link) for link in page.get("links") or []}
        if not website.startswith(("http://", "https://")) or _url_key(website) not in known:
            cand["website_url"] = None
            blank("website_url", "website is not the page or a link on it; removed")
        else:
            fields.setdefault("website_url", [{**ref, "quote": website}])

    for field in ("name", "provider_name"):
        value = cand.get(field) or ""
        if field not in fields and value and normalize(value) not in norm:
            flags.append({"field": field, "message": "name not found verbatim on the page; check it"})

    kept_locations = []
    for i, loc in enumerate(cand.get("locations") or []):
        if not isinstance(loc, dict):
            continue
        loc = dict(loc)
        new_i = len(kept_locations)
        addr_field = f"locations.{i}.address"
        address = (loc.get("address") or "").strip()
        if not address or (addr_field not in fields and normalize(address) not in norm):
            flags.append({"field": addr_field, "message": "address not found on the page; location dropped"})
            for suffix in ("address", "phone", "hours"):
                fields.pop(f"locations.{i}.{suffix}", None)
            continue
        fields.setdefault(addr_field, [{**ref, "quote": address}])
        lphone = loc.get("phone")
        if lphone and phone_digits(lphone) not in page_phones:
            loc["phone"] = None
            blank(f"locations.{i}.phone", "location phone does not appear on the page; removed")
        hours = loc.get("hours") or {}
        if any(hours.values()) and f"locations.{i}.hours" not in fields:
            loc["hours"] = {}
            blank(f"locations.{i}.hours", "no supporting text for the hours; removed")
        if new_i != i:  # renumber evidence keys to the kept index
            for suffix in ("address", "phone", "hours"):
                old = f"locations.{i}.{suffix}"
                if old in fields:
                    fields[f"locations.{new_i}.{suffix}"] = fields.pop(old)
        kept_locations.append(loc)
    cand["locations"] = kept_locations

    if not cand.get("phone") and not any(loc.get("phone") for loc in kept_locations):
        flags.append({"field": "phone", "message": "no supported contact phone; add one before accepting"})
    return cand, {"fields": fields, "missing": sorted(set(missing)), "flags": flags,
                  "source_host": host_of(ref["url"] or "")}

"""Value-level filters on the reduced table, in code, before any model call.

Column mapping removes whole columns; these rules clean what is left inside
mapped cells:

* resident identifiers (SSN, date of birth, card and ID numbers) through the
  same rules ``app/services/pii.py`` applies to resident text;
* "contact: <Name>", "ask for <Name>", "attn <Name>" phrases;
* phone numbers labelled cell, mobile, direct or fax (one main number is
  kept per phone cell; extensions are dropped);
* email addresses whose local part is not a role (info@, intake@, ...) or a
  program name.

Flags name what was removed, never the removed value. A name typed into free
text without one of these phrases still gets through, which is why every
draft is reviewed by a person.
"""

from __future__ import annotations

import re

from app.services.pii import redact

RESIDENT_KINDS = ("ssn", "dob", "card", "id_number")

_NAME = r"(?:Dr\.?\s+|Mr\.?\s+|Mrs\.?\s+|Ms\.?\s+)?[A-Z][A-Za-z'’.-]+(?:\s+[A-Z][A-Za-z'’.-]+){0,2}"
_CONTACT_RE = re.compile(
    rf"\(?\b(?i:contact(?:\s+person)?|ask\s+for|attn|attention|speak\s+(?:to|with)|c/o)\b\s*[:.,-]?\s*{_NAME}"
    r"(?:\s*\([^)]{0,40}\))?\)?"
)
_PHONE = (
    r"(?<![\d])(?:\+?1[\s.-]?)?(?:\(\d{3}\)\s?|\d{3}[\s.-]?)\d{3}[\s.-]?\d{4}(?![\d])"
    r"(?:\s*(?:x|ext\.?|extension)\s*\d{1,6})?"
)
_PHONE_RE = re.compile(_PHONE, re.IGNORECASE)
_DIRECT_LABEL = r"(?:cell|mobile|direct(?:\s+line)?|personal|fax)"
_LABELLED_DIRECT_RE = re.compile(
    rf"\b{_DIRECT_LABEL}\b\s*(?:phone|#|number|no\.?)?\s*[:.-]?\s*{_PHONE}", re.IGNORECASE
)
_DIRECT_WORDS = re.compile(rf"\b{_DIRECT_LABEL}\b", re.IGNORECASE)
_MAIN_WORDS = re.compile(r"\b(?:main|office|intake|hotline|front\s+desk|toll[\s-]?free|general|helpline)\b", re.IGNORECASE)
_EXT_RE = re.compile(r"\s*(?:x|ext\.?|extension)\s*\d{1,6}$", re.IGNORECASE)
_SHORT_LINE_RE = re.compile(r"^\s*(?:\d-1-1|[2-9]11|[2-9]-1-1)\s*$")
_EMAIL_RE = re.compile(r"(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}")

ROLE_WORDS = (
    "info", "contact", "help", "office", "intake", "admin", "services", "service", "hello", "support",
    "referral", "reception", "frontdesk", "programs", "program", "outreach", "enroll", "appointments",
    "inquiries", "questions", "general", "team", "clinic", "pantry", "hotline",
)


def _tidy(text: str) -> str:
    text = re.sub(r"\(\s*\)", "", text)
    text = re.sub(r"\s+([,.;:])", r"\1", text)
    text = re.sub(r"([,;:])\1+", r"\1", text)
    text = re.sub(r"\s{2,}", " ", text)
    return text.strip(" ,;:-")


def clean_text(text: str, flags: set[str]) -> str:
    """Free text: resident identifiers, contact-person phrases, direct lines, personal emails."""
    if not text:
        return ""
    result = redact(text, kinds=RESIDENT_KINDS)
    if result.types:
        flags.add("resident_identifier_removed")
    out = result.text
    new = _CONTACT_RE.sub("", out)
    if new != out:
        flags.add("contact_name_removed")
        out = new
    new = _LABELLED_DIRECT_RE.sub("", out)
    if new != out:
        flags.add("direct_line_removed")
        out = new

    def _email(match: re.Match[str]) -> str:
        if is_role_email(match.group(0), ()):
            return match.group(0)
        flags.add("personal_email_removed")
        return ""

    out = _EMAIL_RE.sub(_email, out)
    return _tidy(out)


def _format_phone(raw: str) -> str:
    digits = re.sub(r"\D", "", raw)
    if len(digits) == 11 and digits.startswith("1"):
        digits = digits[1:]
    return f"{digits[:3]}-{digits[3:6]}-{digits[6:]}" if len(digits) == 10 else raw.strip()


def pick_phone(text: str, flags: set[str]) -> str:
    """One main phone from a phone cell: labelled main first, else the first unlabelled one."""
    if not text:
        return ""
    if _SHORT_LINE_RE.match(text):
        return text.strip()
    matches = list(_PHONE_RE.finditer(text))
    if not matches:
        flags.add("phone_unrecognised")
        return ""
    candidates: list[tuple[int, str]] = []
    start = 0
    for m in matches:
        label = text[start:m.start()][-30:]
        start = m.end()
        if _DIRECT_WORDS.search(label):
            flags.add("direct_line_removed")
            continue
        number = m.group(0)
        if _EXT_RE.search(number):
            flags.add("extension_removed")
            number = _EXT_RE.sub("", number)
        candidates.append((0 if _MAIN_WORDS.search(label) else 1, _format_phone(number)))
    if not candidates:
        return ""
    candidates.sort(key=lambda c: c[0])
    if len(candidates) > 1:
        flags.add("extra_phones_dropped")
    return candidates[0][1]


def _compact(text: str) -> str:
    return re.sub(r"[^a-z]", "", text.lower())


def is_role_email(email: str, program_names: tuple[str, ...]) -> bool:
    local = _compact(email.split("@", 1)[0])
    if not local:
        return False
    if any(local == w or local.startswith(w) for w in ROLE_WORDS):
        return True
    for name in program_names:
        compact = _compact(name)
        if len(local) >= 4 and compact and (local in compact or compact in local):
            return True
    return False


def pick_email(text: str, program_names: tuple[str, ...], flags: set[str]) -> str:
    """The first role email in the cell; personal ones are dropped and flagged."""
    kept = ""
    for match in _EMAIL_RE.finditer(text or ""):
        if is_role_email(match.group(0), program_names):
            kept = kept or match.group(0)
        else:
            flags.add("personal_email_removed")
    return kept


def clean_website(text: str, flags: set[str]) -> str:
    raw = (text or "").strip().strip("<>").rstrip(".,;")
    if not raw:
        return ""
    if _EMAIL_RE.fullmatch(raw):
        flags.add("website_unrecognised")
        return ""
    if not re.match(r"^https?://", raw, re.IGNORECASE):
        raw = "https://" + raw.removeprefix("//")
    if not re.fullmatch(r"https?://[A-Za-z0-9.-]+\.[A-Za-z]{2,}(?::\d{1,5})?(?:[/?#][^\s]*)?", raw, re.IGNORECASE):
        flags.add("website_unrecognised")
        return ""
    return raw

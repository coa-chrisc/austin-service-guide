"""Deterministic redaction of high-risk personal identifiers.

Applied to resident-authored text (typed chat messages and voice
transcripts) before it is stored in session history, sent to a model, or
written to a debug log. The intake never needs these identifiers — it only
uses zip code, household size, income/insurance brackets and yes/no facts —
so removing them costs nothing for matching.

Design goals, in order:

1. Precision over recall. Every pattern is anchored on a strong signal
   (a fixed digit layout, a Luhn checksum, an ``@``, a street suffix, or an
   explicit keyword such as "SSN" / "Medicaid number" / "date of birth").
   Zip codes, household counts, ages and dollar amounts must survive
   untouched because the intake depends on them.
2. No raw values leave this module. ``redact`` returns the cleaned text and
   the *types* that were found, never the matched strings.

Catalog and assistant text carry legitimate service phone numbers and
addresses, so assistant voice transcripts are redacted with
``ASSISTANT_KINDS`` only (see ``redact``'s ``kinds`` / ``keep`` options).

Every pattern must stay linear-time on adversarial input (long runs with no
match): request handlers call ``redact`` on the event loop. Unbounded
repetition is only allowed where a match can start at most once per run
(left-boundary lookbehind) or where nothing after it can backtrack into it.
"""

from __future__ import annotations

import re
from typing import Callable, Collection, NamedTuple

PLACEHOLDERS: dict[str, str] = {
    "email": "[email removed]",
    "card": "[card number removed]",
    "ssn": "[SSN removed]",
    "id_number": "[ID number removed]",
    "dob": "[date of birth removed]",
    "phone": "[phone removed]",
    "address": "[address removed]",
}


# Identifier types that never appear in catalog content, so they are safe to
# strip from what the voice assistant said. Phone and address are left out on
# purpose: the assistant reads out service phone numbers and addresses.
# Emails are included, but callers pass the catalog's service emails as
# ``keep`` so those survive.
ASSISTANT_KINDS: tuple[str, ...] = ("email", "card", "ssn", "dob", "id_number")


class Redaction(NamedTuple):
    text: str
    types: list[str]  # sorted, unique type keys from PLACEHOLDERS


# ── Patterns ─────────────────────────────────────────────────────────

# The lookbehind pins the start to the beginning of a local-part run, so a
# long run with no "@" is scanned once instead of once per character.
_EMAIL_RE = re.compile(r"(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}")

# 13-19 contiguous digits, or the printed 4-4-4-4 / 4-6-5 groupings.
# Luhn-checked so arbitrary long numbers are left alone.
_CARD_RE = re.compile(
    r"(?<![\d$])(?:\d{13,19}|\d{4}([ -])\d{4}\1\d{4}\1\d{1,7}|\d{4}([ -])\d{6}\2\d{5})(?!\d)"
)

# 3-2-4 layout is distinctive enough on its own (phones are 3-3-4).
_SSN_FORMATTED_RE = re.compile(r"(?<![\d$])\d{3}([-. ])\d{2}\1\d{4}(?!\d)")

_SSN_KEYWORDS = (
    r"ssn|s\.s\.n\.?|social(?:\s+security)?(?:\s+(?:number|no\.?|#))?"
    r"|seguro\s+social|n[uú]mero\s+de\s+seguro\s+social"
)
_SSN_CONTEXT_RE = re.compile(
    rf"(?P<pre>\b(?:{_SSN_KEYWORDS})\b[\s:#-]*(?:(?:is|es|was)\s+)?)(?P<val>\d{{9}})(?!\d)",
    re.IGNORECASE,
)
# "last four of my social is 1234"
_SSN_LAST4_RE = re.compile(
    r"(?P<pre>\blast\s+(?:4|four)\s+(?:digits\s+)?(?:of\s+)?(?:my\s+)?"
    rf"(?:{_SSN_KEYWORDS})\b[\s:#-]*(?:(?:is|was)\s+)?)(?P<val>\d{{4}})(?!\d)",
    re.IGNORECASE,
)

_ID_KEYWORDS = (
    r"medicaid|medicare|member(?:ship)?|subscriber|policy|insurance|account|acct"
    r"|case|chip|snap|ebt|wic|i\.?d\.?|driver'?s?\s+licen[cs]e|licen[cs]e"
    r"|passport|alien|a-number|uscis|green\s+card|routing|group|mbi"
    r"|n[uú]mero\s+de\s+(?:miembro|cuenta|caso|p[oó]liza)"
)
_ID_CONNECTORS = r"(?:card|number|num|no\.?|#|id|is|was|es|:|-)"
# Connectors are bounded: "id" is both a keyword and a connector, so an
# unbounded run ("id id id ...") would rescan the whole run from every start.
_ID_CONTEXT_RE = re.compile(
    rf"(?P<pre>\b(?:{_ID_KEYWORDS})(?![A-Za-z])(?:\s*{_ID_CONNECTORS}){{0,4}}\s*)"
    r"(?P<val>[A-Za-z0-9][A-Za-z0-9-]{4,24}[A-Za-z0-9])(?![A-Za-z0-9-])",
    re.IGNORECASE,
)

_MONTHS = (
    r"jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?"
    r"|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?"
    r"|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre"
    r"|noviembre|diciembre"
)
_DATE = (
    r"\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}"
    r"|\d{4}-\d{2}-\d{2}"
    rf"|(?:{_MONTHS})\.?\s+\d{{1,2}}(?:st|nd|rd|th)?,?\s+\d{{4}}"
    rf"|\d{{1,2}}(?:\s+de)?\s+(?:{_MONTHS})\.?,?(?:\s+de)?\s+\d{{4}}"
)
_DOB_RE = re.compile(
    r"(?P<pre>\b(?:dob|d\.o\.b\.?|date\s+of\s+birth|birth\s*date|birthday"
    r"|born(?:\s+on)?|fecha\s+de\s+nacimiento|nac[ií](?:\s+el)?)\b[\s:,-]*"
    r"(?:(?:is|was|es|fue)\s+)?)"
    rf"(?P<val>{_DATE})",
    re.IGNORECASE,
)

# 10-digit US numbers with optional +1 and common separators.
_PHONE_RE = re.compile(
    r"(?<![\d$])(?:\+?1[\s.-]?)?(?:\(\d{3}\)\s?|\d{3}[\s.-]?)\d{3}[\s.-]?\d{4}(?!\d)"
)
# 7-digit local numbers only when a phone keyword precedes them.
_PHONE_LOCAL_RE = re.compile(
    r"(?P<pre>\b(?:call|text|phone|cell|mobile|number|reach\s+me|tel[eé]fono|celular)"
    r"\b(?:\s+(?:me|at|is|es|number|al|:)){0,4}[\s:]{0,4})"
    r"(?P<val>\d{3}[\s.-]\d{4})(?!\d)",
    re.IGNORECASE,
)

# Suffixes that are rarely ordinary words match in any case; the ones that
# are ("way", "court", "place", ...) only count when capitalized, so
# "1 eviction court date" is left alone but "12 Oak Court" is not.
_STREET_SUFFIXES = (
    r"street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln"
    r"|ct|cir|pl|parkway|pkwy|highway|hwy|trl|ter|cv|xing"
    r"|(?-i:Way|Court|Circle|Place|Trail|Terrace|Cove|Loop|Bend|Path|Crossing|Row|Pass|Run)"
)
# Words that show the number is a count/duration, not a house number
# ("3 months on the street", "2 kids no way", "45 minute drive",
# "2 eviction notices Court date").
_NOT_STREET_WORDS = (
    r"the|on|in|at|a|an|of|to|for|my|our|from|near|by|and|or|with|but|no|not"
    r"|years?|months?|weeks?|days?|hours?|people|persons?|kids?|children|adults?"
    r"|dollars?|times?|am|pm|i|we|me|it|is|was"
    r"|minutes?|mins?|miles?|blocks?|nights?|notices?|evictions?"
)
_STREET_TOKEN = rf"(?!(?:{_NOT_STREET_WORDS})\b)[A-Za-z0-9][A-Za-z0-9.'-]*"
_ADDRESS_RE = re.compile(
    # House number: 1-6 digits, never a 786xx/787xx Austin zip code.
    r"(?<![\d$,.])(?!7[86]\d{3}\b)\d{1,6}[A-Za-z]?\s+"
    rf"(?:{_STREET_TOKEN}\s+){{1,4}}"
    rf"(?:{_STREET_SUFFIXES})\b\.?"
    r"(?:,?\s*(?:apt|apartment|unit|suite|ste|#)\.?\s*#?\s*[A-Za-z0-9-]+)?",
    re.IGNORECASE,
)
_PO_BOX_RE = re.compile(r"\bP\.?\s?O\.?\s*Box\s+\d+", re.IGNORECASE)


# ── Helpers ──────────────────────────────────────────────────────────

def _luhn_valid(digits: str) -> bool:
    total = 0
    for idx, ch in enumerate(reversed(digits)):
        n = int(ch)
        if idx % 2 == 1:
            n *= 2
            if n > 9:
                n -= 9
        total += n
    return total % 10 == 0


def _is_card(match: re.Match[str]) -> bool:
    return _luhn_valid(re.sub(r"\D", "", match.group(0)))


_ZIP4_OR_PHONE_RE = re.compile(r"\d{5}-\d{4}|(?:1-)?\d{3}-\d{3}-\d{4}")


def _is_id_value(match: re.Match[str]) -> bool:
    value = match.group("val")
    digits = sum(ch.isdigit() for ch in value)
    # Needs real digit content, and is not a ZIP+4 ("78744-1234") or a dashed
    # phone number ("Medicaid: 1-800-252-8263"). Phones are left to the phone
    # rule, so assistant text (which skips it) keeps service numbers.
    return digits >= 4 and not _ZIP4_OR_PHONE_RE.fullmatch(value)


def _always(_: re.Match[str]) -> bool:
    return True


# (type, pattern, accept-predicate). Order matters: longer / more specific
# shapes run first so e.g. a card number is not half-eaten by the phone rule.
_RULES: list[tuple[str, re.Pattern[str], Callable[[re.Match[str]], bool]]] = [
    ("email", _EMAIL_RE, _always),
    ("card", _CARD_RE, _is_card),
    ("ssn", _SSN_FORMATTED_RE, _always),
    ("ssn", _SSN_CONTEXT_RE, _always),
    ("ssn", _SSN_LAST4_RE, _always),
    ("dob", _DOB_RE, _always),
    ("id_number", _ID_CONTEXT_RE, _is_id_value),
    ("phone", _PHONE_RE, _always),
    ("phone", _PHONE_LOCAL_RE, _always),
    ("address", _PO_BOX_RE, _always),
    ("address", _ADDRESS_RE, _always),
]


def redact(
    text: str,
    kinds: Collection[str] | None = None,
    keep: Collection[str] = (),
) -> Redaction:
    """Replace high-risk identifiers in ``text``.

    Returns the redacted text and the sorted list of identifier types that
    were removed. Keyword-anchored rules keep the keyword ("my SSN is
    [SSN removed]") so the sentence still reads naturally.

    ``kinds`` limits which identifier types are removed (default: all, for
    resident-authored text; use ``ASSISTANT_KINDS`` for assistant text).
    ``keep`` lists exact values (case-insensitive) that are never removed,
    such as the catalog's service email addresses.
    """
    found: set[str] = set()
    kept = {value.lower() for value in keep}

    for kind, pattern, accept in _RULES:
        if kinds is not None and kind not in kinds:
            continue
        placeholder = PLACEHOLDERS[kind]

        def _sub(match: re.Match[str], kind: str = kind, placeholder: str = placeholder,
                 accept: Callable[[re.Match[str]], bool] = accept) -> str:
            if not accept(match) or match.group(0).lower() in kept:
                return match.group(0)
            found.add(kind)
            if "val" in match.re.groupindex:
                return match.group("pre") + placeholder
            return placeholder

        text = pattern.sub(_sub, text)

    return Redaction(text, sorted(found))

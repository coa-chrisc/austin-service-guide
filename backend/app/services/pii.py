"""Deterministic redaction of high-risk personal identifiers.

Applied to resident-authored text (typed chat messages and voice
transcripts) before it is stored in session history, sent to a model, or
written to a debug log. The intake never needs these identifiers — it only
uses zip code, household size, income/insurance brackets and yes/no facts —
so removing them costs nothing for matching.

Design goals, in order:

1. Precision over recall. Every pattern is anchored on a strong signal
   (a fixed digit layout, a Luhn checksum, an ``@``, a street suffix, or an
   explicit keyword such as "SSN" / "Medicaid number" / "date of birth", or
   a self-identification phrase such as "my name is").
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
from functools import lru_cache
from typing import Callable, Collection, NamedTuple

from app.services.city import get_city

PLACEHOLDERS: dict[str, str] = {
    "email": "[email removed]",
    "card": "[card number removed]",
    "ssn": "[SSN removed]",
    "id_number": "[ID number removed]",
    "dob": "[date of birth removed]",
    "phone": "[phone removed]",
    "address": "[address removed]",
    "name": "[name removed]",
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
    r"ssn|itin(?:\s+(?:number|no\.?|#))?|s\.s\.n\.?|social(?:\s+security)?(?:\s+(?:number|no\.?|#))?"
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
# A ZIP code named as one ("zip 60614", "my zip code is 02134") is matched by
# the ``zip`` alternative and left alone (``_not_zip``), so it is never read
# as a house number. Elsewhere a 5-digit number can be a house number
# ("12345 Research Blvd"); a bare ZIP survives because a street suffix must
# follow it within four non-stopword tokens ("I live in 60614",
# "60614 near Clark St").
_ZIP_CONTEXT = (
    r"(?P<zip>\b(?:zip(?:\s*code)?|postal\s+code|c[oó]digo\s+postal)\b[\s:#-]*"
    r"(?:(?:is|es|was)\s+)?\d{5}(?:-\d{4})?(?!\d))"
)
_ADDRESS_RE = re.compile(
    rf"{_ZIP_CONTEXT}|"
    # House number: 1-6 digits.
    r"(?<![\d$,.])\d{1,6}[A-Za-z]?\s+"
    rf"(?:{_STREET_TOKEN}\s+){{1,4}}"
    rf"(?:{_STREET_SUFFIXES})\b\.?"
    r"(?:,?\s*(?:apt|apartment|unit|suite|ste|#)\.?\s*#?\s*[A-Za-z0-9-]+)?",
    re.IGNORECASE,
)
_PO_BOX_RE = re.compile(r"\bP\.?\s?O\.?\s*Box\s+\d+", re.IGNORECASE)

# ── Spoken numbers (speech-to-text transcripts) ──────────────────────
# Dictated identifiers arrive as words ("five one two ...") or a mix of words
# and digits. A run is any sequence of digit words / short digit groups;
# whether it is redacted is decided by counting digits in ``_spoken_*``
# below, so ordinary counts ("I have three kids", "two adults and one
# child") never qualify. Separators and tokens share no characters, so the
# run never backtracks into itself.
_SPOKEN_DIGIT = r"(?:(?:zero|oh|one|two|three|four|five|six|seven|eight|nine)\b|\d{1,4}(?!\d))"
_SPOKEN_RUN = rf"\b{_SPOKEN_DIGIT}(?:[\s,-]+{_SPOKEN_DIGIT})+"
# "my social is one two three ..." (and "last four of my social is ...").
_SSN_SPOKEN_RE = re.compile(
    rf"(?P<pre>\b(?:{_SSN_KEYWORDS})\b[\s:#-]*(?:(?:is|es|was)\s+)?)(?P<val>{_SPOKEN_RUN})",
    re.IGNORECASE,
)
_PHONE_SPOKEN_RE = re.compile(_SPOKEN_RUN, re.IGNORECASE)
# "twelve oh four Main Street": two to six number words before the same
# street tokens and suffixes as ``_ADDRESS_RE``. One spoken number word is
# not enough ("one long road"). The bounded word run keeps it linear.
_SPOKEN_NUMBER_WORD = (
    r"(?:zero|oh|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve"
    r"|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty"
    r"|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)\b"
)
_SPOKEN_ADDRESS_RE = re.compile(
    rf"\b{_SPOKEN_NUMBER_WORD}(?:[\s-]+{_SPOKEN_NUMBER_WORD}){{1,5}}\s+"
    rf"(?:{_STREET_TOKEN}\s+){{1,4}}"
    rf"(?:{_STREET_SUFFIXES})\b\.?"
    r"(?:,?\s*(?:apt|apartment|unit|suite|ste|#)\.?\s*#?\s*[A-Za-z0-9-]+)?",
    re.IGNORECASE,
)

# Names are only removed right after an explicit self-identification phrase.
# Name tokens are case-sensitive on purpose, so only the phrases use ``(?i:``.
_NAME_LET = "A-Za-zÀ-ÖØ-öø-ÿ"
_NAME_UP = "A-ZÀ-ÖØ-Þ"
_NAME_LOW = "a-zß-öø-ÿ"
# Function words that can follow "my name is" ("my name is on the lease").
_NAME_STOP_FUNC = (
    r"on|in|at|to|of|not|no|the|a|an|and|or|but|is|was|are|for|with|from|under"
    r"|off|also|here|there|different|same|wrong|misspelled|spelled|listed"
    r"|correct|incorrect|mine|ok|okay|just|really|so|that|this|it|its|then|if"
    r"|when|what|who|why|how|we|you|he|she|they|my|me|your|his|her|our|their"
    r"|too|very|still|now|never|always|only|written|printed|signed|required"
    r"|missing|en|el|la|los|las|de|del|y|mi|es|un|una|que|para|por|con|sin"
    r"|aqui|aquí|mal|igual|diferente"
)
_NAME_STOP_CONTINUATION = (
    _NAME_STOP_FUNC
    + r"|i|im|need|needs|needed|looking|look|want|wants|wanted|have|has|had|am|be"
    r"|been|live|lives|living|work|works|working|help|trying|try|seeking|get"
    r"|getting|got|can|cant|could|will|would|do|does|did|lost|late|behind|hungry"
    r"|homeless|unemployed|pregnant|disabled|veteran|calling|writing|applying"
    r"|please|pls|thanks|hi|hello|necesito|busco|tengo|soy|estoy|vivo|quiero"
    r"|trabajo|perdi|perdí|ayuda|hola|gracias"
)
# Capitalized words that follow "I am" / "this is" without being a name.
_NAME_STOP_DESCRIPTOR = (
    _NAME_STOP_FUNC
    + r"|monday|tuesday|wednesday|thursday|friday|saturday|sunday"
    r"|january|february|march|april|may|june|july|august|september|october"
    r"|november|december|veterans?|unemployed|disabled|pregnant|retired"
    r"|homeless|single|married|divorced|widowed|separated|student|citizen"
    r"|resident|immigrant|refugee|senior|elderly|deaf|blind|sick|diabetic"
    r"|spanish|english|mexican|american|african|asian|black|white"
    r"|hispanic|latino|latina|latinx|native|indian|chinese|vietnamese|korean"
    r"|filipino|cuban|salvadoran|guatemalan|honduran|venezuelan|haitian|french"
    r"|german|arabic|catholic|christian|muslim|jewish|buddhist|hindu|currently"
    r"|looking|seeking|trying|having|living|working|needing|receiving|behind"
    r"|out|laid|late|without|sure|new|public|health|center|city|county|food"
    r"|bank|help|need|needs"
)


def _not_stop(words: str) -> str:
    return rf"(?!(?i:{words})(?![{_NAME_LET}]))"


# One capitalized name token: Maria, O'Brien, McDonald, Smith-Jones.
_NAME_CAP = (
    rf"[{_NAME_UP}](?:[{_NAME_LOW}]+|['’][{_NAME_UP}][{_NAME_LOW}]+)"
    rf"(?:[{_NAME_UP}][{_NAME_LOW}]+)?(?:-[{_NAME_UP}][{_NAME_LOW}]+)?(?![{_NAME_LET}])"
)
_NAME_ANY = rf"[{_NAME_LET}]+(?:['’-][{_NAME_LET}]+)*"
_NAME_FUNC_GUARD = _not_stop(_NAME_STOP_FUNC)
_NAME_CONT_GUARD = _not_stop(_NAME_STOP_CONTINUATION)

# "my name is maria lopez": the phrase is explicit, so up to 3 tokens in any
# case; the run stops at the first function/verb stopword, punctuation or digit
# (over-redacting is acceptable, leaking a name is not).
_NAME_EXPLICIT_RE = re.compile(
    r"(?P<pre>(?i:\bmy\s+name(?:\s+is|['’]s)|\bme\s+llamo|\bmi\s+nombre\s+es)(?:\s*[:,–—-]\s*|\s+))"
    rf"(?P<val>{_NAME_FUNC_GUARD}{_NAME_ANY}(?:[ \t  ]+{_NAME_CONT_GUARD}{_NAME_ANY}){{0,2}})"
)

# The deployment's own place names ("I'm Greater Austin Resident") are descriptors
# too: city name and region name from the city config, each as a whole
# phrase ("greater\s+austin"). State names are left out on purpose: many
# are first names (Georgia, Virginia, Carolina), and leaking a name is worse
# than over-redacting "I'm Texas Born".
_REGEX_SPECIAL_RE = re.compile(r"[.*+?^$()\[\]{}|\\]")


def _place_stopwords(places: tuple[str, ...]) -> str:
    """``|phrase`` stopword alternatives, one per non-empty place name."""
    out = ""
    for place in places:
        words = [_REGEX_SPECIAL_RE.sub(r"\\\g<0>", word) for word in place.split()]
        if words:
            out += "|" + r"\s+".join(words)
    return out


def _city_places() -> tuple[str, ...]:
    city = get_city()
    return (city.city_name, city.region_name)


@lru_cache(maxsize=4)
def _name_self_re(places: tuple[str, ...]) -> re.Pattern[str]:
    # "I am Maria Lopez" / "this is Maria Lopez": ambiguous phrases, so two
    # to three Capitalized words that are neither stopwords nor place names.
    guard = _not_stop(_NAME_STOP_DESCRIPTOR + _place_stopwords(places))
    return re.compile(
        r"(?P<pre>(?i:\bi(?:\s+am|['’]m)|\bthis\s+is)(?:\s*[:,–—-]\s*|\s+))"
        rf"(?P<val>{guard}{_NAME_CAP}(?:[ \t  ]+{guard}{_NAME_CAP}){{1,2}})"
    )


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
    # Needs real digit content, and is not a ZIP+4 ("60614-1234") or a dashed
    # phone number ("Medicaid: 1-800-555-0100"). Phones are left to the phone
    # rule, so assistant text (which skips it) keeps service numbers.
    return digits >= 4 and not _ZIP4_OR_PHONE_RE.fullmatch(value)


def _always(_: re.Match[str]) -> bool:
    return True


def _not_zip(match: re.Match[str]) -> bool:
    return match.group("zip") is None


_DIGIT_GROUP_RE = re.compile(r"\d+")
_DIGIT_WORD_RE = re.compile(r"[A-Za-z]+")


def _spoken_counts(value: str) -> tuple[int, int]:
    """(digits, digit words) in a spoken run; each digit word is one digit."""
    words = len(_DIGIT_WORD_RE.findall(value))
    digits = sum(len(group) for group in _DIGIT_GROUP_RE.findall(value))
    return digits + words, words


def _is_spoken_ssn(match: re.Match[str]) -> bool:
    # Keyword-anchored, so a "last four" is enough. At least one spoken word
    # and at most nine digits, so "Social Security: 1 800 772 1213" (a phone
    # number the assistant may read out) is left to the phone rules.
    digits, words = _spoken_counts(match.group("val"))
    return 4 <= digits <= 9 and words >= 1


def _is_spoken_phone(match: re.Match[str]) -> bool:
    # At least two spoken digit words, so all-numeral runs such as
    # "1988-03-15" or "2023 2024" stay with the numeric rules.
    digits, words = _spoken_counts(match.group(0))
    return digits >= 7 and words >= 2


# (type, pattern, accept-predicate). Order matters: longer / more specific
# shapes run first so e.g. a card number is not half-eaten by the phone rule.
_RULES: list[tuple[str, re.Pattern[str], Callable[[re.Match[str]], bool]]] = [
    ("email", _EMAIL_RE, _always),
    ("card", _CARD_RE, _is_card),
    ("ssn", _SSN_FORMATTED_RE, _always),
    ("ssn", _SSN_CONTEXT_RE, _always),
    ("ssn", _SSN_LAST4_RE, _always),
    ("ssn", _SSN_SPOKEN_RE, _is_spoken_ssn),
    ("dob", _DOB_RE, _always),
    ("id_number", _ID_CONTEXT_RE, _is_id_value),
    ("phone", _PHONE_RE, _always),
    ("phone", _PHONE_LOCAL_RE, _always),
    ("phone", _PHONE_SPOKEN_RE, _is_spoken_phone),
    ("address", _PO_BOX_RE, _always),
    ("address", _ADDRESS_RE, _not_zip),
    ("address", _SPOKEN_ADDRESS_RE, _always),
    ("name", _NAME_EXPLICIT_RE, _always),
    # ("name", _name_self_re(...)) is appended in ``redact``: it reads the city config.
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

    rules = [*_RULES, ("name", _name_self_re(_city_places()), _always)]
    for kind, pattern, accept in rules:
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

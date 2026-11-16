"""Small closed vocabularies: language names to codes, US state names to codes."""

from __future__ import annotations

import re

LANGUAGES: dict[str, str] = {
    "english": "en", "spanish": "es", "espanol": "es", "español": "es", "vietnamese": "vi", "chinese": "zh",
    "mandarin": "zh", "cantonese": "yue", "arabic": "ar", "french": "fr", "korean": "ko", "russian": "ru",
    "somali": "so", "swahili": "sw", "burmese": "my", "nepali": "ne", "pashto": "ps", "dari": "prs",
    "farsi": "fa", "persian": "fa", "hindi": "hi", "urdu": "ur", "tagalog": "tl", "filipino": "fil",
    "portuguese": "pt", "german": "de", "japanese": "ja", "asl": "ase", "american sign language": "ase",
    "sign language": "ase", "haitian creole": "ht", "creole": "ht", "amharic": "am", "tigrinya": "ti",
    "ukrainian": "uk", "kinyarwanda": "rw", "karen": "kar", "polish": "pl", "italian": "it", "hmong": "hmn",
    "bengali": "bn", "punjabi": "pa", "gujarati": "gu", "telugu": "te", "tamil": "ta", "thai": "th",
    "lao": "lo", "khmer": "km", "oromo": "om", "turkish": "tr", "hebrew": "he", "greek": "el",
}
_CODE_RE = re.compile(r"^[a-z]{2,3}(-[A-Za-z0-9]+)*$")
_KNOWN_CODES = set(LANGUAGES.values())

STATES: dict[str, str] = {
    "alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR", "california": "CA", "colorado": "CO",
    "connecticut": "CT", "delaware": "DE", "district of columbia": "DC", "florida": "FL", "georgia": "GA",
    "hawaii": "HI", "idaho": "ID", "illinois": "IL", "indiana": "IN", "iowa": "IA", "kansas": "KS",
    "kentucky": "KY", "louisiana": "LA", "maine": "ME", "maryland": "MD", "massachusetts": "MA",
    "michigan": "MI", "minnesota": "MN", "mississippi": "MS", "missouri": "MO", "montana": "MT",
    "nebraska": "NE", "nevada": "NV", "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM",
    "new york": "NY", "north carolina": "NC", "north dakota": "ND", "ohio": "OH", "oklahoma": "OK",
    "oregon": "OR", "pennsylvania": "PA", "rhode island": "RI", "south carolina": "SC", "south dakota": "SD",
    "tennessee": "TN", "texas": "TX", "utah": "UT", "vermont": "VT", "virginia": "VA", "washington": "WA",
    "west virginia": "WV", "wisconsin": "WI", "wyoming": "WY", "puerto rico": "PR", "guam": "GU",
}
STATE_CODES = set(STATES.values())


def language_codes(text: str) -> tuple[list[str], list[str]]:
    """(codes, unrecognised names) from a free-text language list."""
    codes: list[str] = []
    unknown: list[str] = []
    for part in re.split(r"\s*(?:,|;|/|\||&|\band\b|\n)\s*", text or ""):
        word = part.strip().strip(".").lower()
        if not word:
            continue
        code = LANGUAGES.get(word)
        if code is None and _CODE_RE.match(word) and word in _KNOWN_CODES:
            code = word
        if code is None:
            unknown.append(part.strip()[:40])
        elif code not in codes:
            codes.append(code)
    return codes, unknown


def state_code(text: str) -> str:
    raw = (text or "").strip().strip(".")
    if raw.upper() in STATE_CODES:
        return raw.upper()
    return STATES.get(raw.lower(), "")

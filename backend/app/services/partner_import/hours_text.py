"""Free-text opening hours to the catalog's day map, where code can decide.

Handles day lists and ranges followed by a time range ("Mon-Fri 9am-5pm",
"M/W/F 9:00 AM - 12:00 PM; Sat 10-2", "Weekdays 8-5", "Daily 8 AM - 8 PM")
and round-the-clock wording ("24/7", "Open 24 hours"). The result is
``confident`` only when every part of the text was understood and every time
carried AM or PM (or one end did and the other follows). Anything else is
left for the reviewer (or the optional model step), never guessed silently.
Output values use the grammar ``app/services/hours.py`` reads.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from app.services.hours import _parse_range

DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
_DAY_WORDS = {
    "monday": 0, "mon": 0, "m": 0, "mo": 0,
    "tuesday": 1, "tues": 1, "tue": 1, "tu": 1, "t": 1,
    "wednesday": 2, "wed": 2, "w": 2, "we": 2,
    "thursday": 3, "thurs": 3, "thur": 3, "thu": 3, "th": 3, "r": 3,
    "friday": 4, "fri": 4, "f": 4, "fr": 4,
    "saturday": 5, "sat": 5, "sa": 5,
    "sunday": 6, "sun": 6, "su": 6,
}
_GROUPS = {
    "daily": range(7), "every day": range(7), "everyday": range(7), "7 days a week": range(7),
    "7 days": range(7), "weekdays": range(5), "weekends": range(5, 7), "weekend": range(5, 7),
}
_DAY = r"(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|tues|thurs|thur|mon|tue|wed|thu|fri|sat|sun|mo|tu|we|th|fr|sa|su|m|t|w|r|f)\.?"
_DAY_SPEC = (
    rf"(?:{'|'.join(sorted((re.escape(g) for g in _GROUPS), key=len, reverse=True))}"
    rf"|{_DAY}(?:\s*(?:-|–|—|to|through|thru)\s*{_DAY})?(?:\s*(?:,|&|/|and)\s*{_DAY}(?:\s*(?:-|–|—|to|through|thru)\s*{_DAY})?)*)"
)
_TIME = r"(?:\d{1,2}(?::\d{2})?\s*(?:[ap]\.?\s*m\.?)?|noon|midnight)"
_SEGMENT_RE = re.compile(
    rf"(?<![a-z])(?P<days>{_DAY_SPEC})(?![a-z])\s*[:,]?\s*(?P<open>{_TIME})\s*(?:-|–|—|to|until)\s*(?P<close>{_TIME})(?![a-z0-9])",
    re.IGNORECASE,
)
_ALWAYS_RE = re.compile(r"^\s*(?:open\s+)?(?:24\s*/\s*7|24\s*hours?(?:\s*(?:a day|daily|,?\s*7 days(?: a week)?))?|24\s*hrs?)\s*\.?\s*$", re.IGNORECASE)
_FILLER_RE = re.compile(r"\b(?:hours|open|from|and|closed\s+(?:on\s+)?holidays?)\b|[\s,;.:/&()-]+", re.IGNORECASE)
_TIME_PARTS_RE = re.compile(r"(?P<h>\d{1,2})(?::(?P<m>\d{2}))?\s*(?P<ap>[ap])?", re.IGNORECASE)


@dataclass
class HoursResult:
    hours: dict[str, str] | None
    confident: bool


def _days(spec: str) -> list[int]:
    spec = spec.lower().strip()
    if spec in _GROUPS:
        return list(_GROUPS[spec])
    out: list[int] = []
    for part in re.split(r"\s*(?:,|&|/|\band\b)\s*", spec):
        bounds = [b.strip().rstrip(".") for b in re.split(r"\s*(?:-|–|—|\bto\b|\bthrough\b|\bthru\b)\s*", part) if b.strip()]
        idx = [_DAY_WORDS.get(b) for b in bounds]
        if not idx or any(i is None for i in idx):
            return []
        if len(idx) == 1:
            out.append(idx[0])
        else:
            a, b = idx[0], idx[-1]
            out.extend(range(a, b + 1) if a <= b else [*range(a, 7), *range(0, b + 1)])
    return out


def _clock(token: str) -> tuple[int, int, str | None] | None:
    token = token.strip().lower()
    if token == "noon":
        return 12, 0, "p"
    if token == "midnight":
        return 12, 0, "a"
    m = _TIME_PARTS_RE.match(token)
    if not m:
        return None
    hour, minute = int(m.group("h")), int(m.group("m") or 0)
    if hour > 23 or minute > 59:
        return None
    ap = (m.group("ap") or "").lower() or None
    if hour > 12:  # 24-hour clock
        return hour - 12, minute, "p"
    return hour, minute, ap


def _fmt(hour: int, minute: int, ap: str) -> str:
    return f"{hour or 12}:{minute:02d} {'AM' if ap == 'a' else 'PM'}"


def _range(open_t: str, close_t: str) -> tuple[str, bool] | None:
    a, b = _clock(open_t), _clock(close_t)
    if a is None or b is None:
        return None
    (ah, am, aap), (bh, bm, bap) = a, b
    confident = True
    if aap and not bap:
        bap = aap if (bh % 12, bm) > (ah % 12, am) else ("p" if aap == "a" else "a")
    elif bap and not aap:
        aap = bap if (ah % 12, am) < (bh % 12, bm) else ("a" if bap == "p" else "p")
    elif not aap and not bap:
        confident = False
        aap = "a" if 7 <= ah <= 11 else "p"
        bap = "p" if bh <= 9 or bh == 12 or (aap == "p") else "a"
    text = f"{_fmt(ah, am, aap)} – {_fmt(bh, bm, bap)}"
    return (text, confident) if _parse_range(text) not in (None, "24") else None


def normalize_hours(text: str) -> HoursResult:
    raw = (text or "").strip()
    if not raw:
        return HoursResult(None, True)
    if _ALWAYS_RE.match(raw):
        return HoursResult({d: "Open 24 hours" for d in DAYS}, True)
    hours: dict[str, str] = {}
    confident = True
    covered = 0
    leftover = []
    last = 0
    for m in _SEGMENT_RE.finditer(raw):
        leftover.append(raw[last:m.start()])
        last = m.end()
        days = _days(m.group("days"))
        rng = _range(m.group("open"), m.group("close"))
        if not days or rng is None:
            return HoursResult(None, False)
        value, sure = rng
        confident = confident and sure
        for d in days:
            if DAYS[d] in hours and hours[DAYS[d]] != value:
                confident = False  # two ranges in one day: keep the first, reviewer decides
                continue
            hours[DAYS[d]] = value
        covered += 1
    leftover.append(raw[last:])
    if not covered:
        return HoursResult(None, False)
    if _FILLER_RE.sub("", "".join(leftover)):
        confident = False
    return HoursResult(hours, confident)

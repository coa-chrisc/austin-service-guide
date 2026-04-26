"""Open-now / next-open helpers for ServiceLocation.hours dicts.

Hours dicts in seed data look like:
    {"monday": "8:00 AM – 5:00 PM", ..., "saturday": "Closed"}
or sparse:
    {"saturday": "9:00 AM – 11:00 AM"}
or:
    {"monday": "24 hours", ...}

Times accept hyphen, en-dash, or em-dash separators.  Days that are
absent from the dict are treated as Closed.
"""

from __future__ import annotations

import re
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from app.models import ServiceLocation

DEFAULT_TZ = "America/Chicago"

_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
_DAY_LABEL = {d: d.capitalize() for d in _DAYS}

_RANGE_SPLIT_RE = re.compile(r"\s*[-–—]\s*")
_TIME_RE = re.compile(r"^\s*(\d{1,2})(?::(\d{2}))?\s*([AaPp])\.?\s*[Mm]\.?\s*$")


def _parse_time(token: str) -> time | None:
    m = _TIME_RE.match(token)
    if not m:
        return None
    hour = int(m.group(1))
    minute = int(m.group(2) or 0)
    meridiem = m.group(3).lower()
    if meridiem == "p" and hour != 12:
        hour += 12
    elif meridiem == "a" and hour == 12:
        hour = 0
    if not (0 <= hour <= 23 and 0 <= minute <= 59):
        return None
    return time(hour=hour, minute=minute)


def _parse_range(label: str) -> tuple[time, time] | None | str:
    """Return (open, close) tuple, ``None`` for closed, or the literal
    string ``"24"`` for round-the-clock."""
    text = (label or "").strip().lower()
    if not text or text in {"closed", "n/a", "by appointment", "appointment only"}:
        return None
    if "24" in text and "hour" in text:
        return "24"
    parts = _RANGE_SPLIT_RE.split(label.strip(), maxsplit=1)
    if len(parts) != 2:
        return None
    start = _parse_time(parts[0])
    end = _parse_time(parts[1])
    if start is None or end is None:
        return None
    return (start, end)


def _now(tz: str | None) -> datetime:
    return datetime.now(ZoneInfo(tz or DEFAULT_TZ))


def is_open_now(
    location: ServiceLocation,
    *,
    now: datetime | None = None,
    tz: str = DEFAULT_TZ,
) -> bool:
    """Return ``True`` if the location is currently open."""
    if not location.hours:
        return False
    current = now or _now(tz)
    today = _DAYS[current.weekday()]
    parsed = _parse_range(location.hours.get(today, ""))
    if parsed is None:
        return False
    if parsed == "24":
        return True
    open_t, close_t = parsed
    now_t = current.timetz().replace(tzinfo=None)
    if close_t <= open_t:
        # Overnight range (e.g. 22:00–02:00) — open if now ≥ open or now < close
        return now_t >= open_t or now_t < close_t
    return open_t <= now_t < close_t


def next_open_label(
    location: ServiceLocation,
    *,
    now: datetime | None = None,
    tz: str = DEFAULT_TZ,
) -> str | None:
    """Return a short human label for the next opening, or ``None`` when
    the location is open now or has no schedulable hours."""
    if not location.hours or is_open_now(location, now=now, tz=tz):
        return None
    current = now or _now(tz)
    for offset in range(0, 8):
        check = current + timedelta(days=offset)
        day = _DAYS[check.weekday()]
        parsed = _parse_range(location.hours.get(day, ""))
        if parsed is None:
            continue
        if parsed == "24":
            return "Opens at midnight" if offset > 0 else "Open 24 hours"
        open_t, _ = parsed
        if offset == 0 and check.timetz().replace(tzinfo=None) >= open_t:
            continue
        opens_at = _format_time(open_t)
        if offset == 0:
            return f"Opens {opens_at}"
        if offset == 1:
            return f"Opens tomorrow {opens_at}"
        return f"Opens {_DAY_LABEL[day]} {opens_at}"
    return None


def _format_time(t: time) -> str:
    hour12 = t.hour % 12 or 12
    suffix = "am" if t.hour < 12 else "pm"
    if t.minute == 0:
        return f"{hour12}{suffix}"
    return f"{hour12}:{t.minute:02d}{suffix}"


def service_open_now(service_locations: list[ServiceLocation], **kwargs) -> bool:
    """Return ``True`` when *any* of the service's locations are open."""
    return any(is_open_now(loc, **kwargs) for loc in service_locations)

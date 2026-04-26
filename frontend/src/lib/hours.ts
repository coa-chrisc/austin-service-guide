/**
 * Open-now / next-open helpers for ServiceLocation.hours dicts.
 * Mirrors backend/app/services/hours.py — keep the two parsers in sync.
 */

import type { ServiceLocation } from "@/types";

const DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;
type Day = (typeof DAYS)[number];

const DAY_LABEL: Record<Day, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};

const RANGE_SPLIT_RE = /\s*[-–—]\s*/;
const TIME_RE = /^\s*(\d{1,2})(?::(\d{2}))?\s*([AaPp])\.?\s*[Mm]\.?\s*$/;

interface ParsedTime {
  hour: number;
  minute: number;
}

type ParsedRange =
  | { kind: "range"; open: ParsedTime; close: ParsedTime }
  | { kind: "twentyFour" }
  | { kind: "closed" };

function parseTime(token: string): ParsedTime | null {
  const m = TIME_RE.exec(token);
  if (!m) return null;
  let hour = parseInt(m[1], 10);
  const minute = m[2] ? parseInt(m[2], 10) : 0;
  const meridiem = m[3].toLowerCase();
  if (meridiem === "p" && hour !== 12) hour += 12;
  else if (meridiem === "a" && hour === 12) hour = 0;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function parseRange(label: string | undefined): ParsedRange {
  const text = (label ?? "").trim().toLowerCase();
  if (
    !text ||
    text === "closed" ||
    text === "n/a" ||
    text === "by appointment" ||
    text === "appointment only"
  ) {
    return { kind: "closed" };
  }
  if (text.includes("24") && text.includes("hour")) {
    return { kind: "twentyFour" };
  }
  const parts = (label ?? "").trim().split(RANGE_SPLIT_RE);
  if (parts.length !== 2) return { kind: "closed" };
  const open = parseTime(parts[0]);
  const close = parseTime(parts[1]);
  if (!open || !close) return { kind: "closed" };
  return { kind: "range", open, close };
}

function dayKey(date: Date): Day {
  // JS getDay: Sunday=0..Saturday=6 → map to monday-first DAYS array
  return DAYS[(date.getDay() + 6) % 7];
}

function minutesSinceMidnight(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

function rangeMinutes(t: ParsedTime): number {
  return t.hour * 60 + t.minute;
}

export function isOpenNow(
  location: Pick<ServiceLocation, "hours">,
  now: Date = new Date(),
): boolean {
  if (!location.hours) return false;
  const today = dayKey(now);
  const parsed = parseRange(location.hours[today]);
  if (parsed.kind === "closed") return false;
  if (parsed.kind === "twentyFour") return true;
  const cur = minutesSinceMidnight(now);
  const open = rangeMinutes(parsed.open);
  const close = rangeMinutes(parsed.close);
  if (close <= open) return cur >= open || cur < close;
  return cur >= open && cur < close;
}

function formatTime(t: ParsedTime): string {
  const hour12 = t.hour % 12 || 12;
  const suffix = t.hour < 12 ? "am" : "pm";
  if (t.minute === 0) return `${hour12}${suffix}`;
  return `${hour12}:${t.minute.toString().padStart(2, "0")}${suffix}`;
}

export function nextOpenLabel(
  location: Pick<ServiceLocation, "hours">,
  now: Date = new Date(),
): string | null {
  if (!location.hours || isOpenNow(location, now)) return null;
  for (let offset = 0; offset < 8; offset++) {
    const check = new Date(now.getTime() + offset * 86_400_000);
    const day = dayKey(check);
    const parsed = parseRange(location.hours[day]);
    if (parsed.kind === "closed") continue;
    if (parsed.kind === "twentyFour") {
      return offset > 0 ? "Opens at midnight" : "Open 24 hours";
    }
    if (
      offset === 0 &&
      minutesSinceMidnight(check) >= rangeMinutes(parsed.open)
    )
      continue;
    const opensAt = formatTime(parsed.open);
    if (offset === 0) return `Opens ${opensAt}`;
    if (offset === 1) return `Opens tomorrow ${opensAt}`;
    return `Opens ${DAY_LABEL[day]} ${opensAt}`;
  }
  return null;
}

/** Returns true when ANY of the service's locations is currently open. */
export function serviceOpenNow(
  locations: Pick<ServiceLocation, "hours">[],
  now: Date = new Date(),
): boolean {
  return locations.some((loc) => isOpenNow(loc, now));
}

/** Compact label like "Open now" / "Closed — opens tomorrow 8am". */
export function openStatusLabel(
  location: Pick<ServiceLocation, "hours">,
  now: Date = new Date(),
): { open: boolean; label: string } {
  if (isOpenNow(location, now)) return { open: true, label: "Open now" };
  const next = nextOpenLabel(location, now);
  return { open: false, label: next ? `Closed · ${next}` : "Hours not listed" };
}

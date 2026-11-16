/**
 * Seven-row hours editor model. Rows read and write the same labels the
 * open-now parsers accept (src/lib/hours.ts and backend/app/services/hours.py):
 * "8:00 AM – 5:00 PM", "Closed", "24 hours", "By appointment". One range
 * per day. A label neither parser reads is kept as free text, never dropped.
 */

export const DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;
export type Day = (typeof DAYS)[number];

/** none: no hours listed for the day (the key is left out). */
export type DayMode = "none" | "open" | "closed" | "24h" | "appointment" | "text";

export interface HoursRow {
  day: Day;
  mode: DayMode;
  /** "HH:MM", 24-hour, as an <input type="time"> holds it. */
  open: string;
  close: string;
  text: string;
}

const RANGE_SPLIT_RE = /\s*[-–—]\s*/;
const TIME_RE = /^\s*(\d{1,2})(?::(\d{2}))?\s*([AaPp])\.?\s*[Mm]\.?\s*$/;

function to24(token: string): string | null {
  const m = TIME_RE.exec(token);
  if (!m) return null;
  let hour = parseInt(m[1], 10);
  const minute = m[2] ? parseInt(m[2], 10) : 0;
  if (hour < 1 || hour > 12 || minute > 59) return null;
  const pm = m[3].toLowerCase() === "p";
  if (pm && hour !== 12) hour += 12;
  else if (!pm && hour === 12) hour = 0;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function to12(value: string): string {
  const [h, m] = value.split(":").map((n) => parseInt(n, 10));
  const suffix = h < 12 ? "AM" : "PM";
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${suffix}`;
}

function rowFromLabel(day: Day, label: string | undefined): HoursRow {
  const row: HoursRow = { day, mode: "none", open: "", close: "", text: "" };
  if (label === undefined) return row;
  const text = label.trim().toLowerCase();
  if (text === "closed" || text === "") return { ...row, mode: "closed" };
  if (text === "by appointment" || text === "appointment only") {
    return { ...row, mode: "appointment" };
  }
  if (text === "24 hours") return { ...row, mode: "24h" };
  const parts = label.trim().split(RANGE_SPLIT_RE);
  if (parts.length === 2) {
    const open = to24(parts[0]);
    const close = to24(parts[1]);
    if (open && close) return { ...row, mode: "open", open, close };
  }
  return { ...row, mode: "text", text: label };
}

export function hoursToRows(hours: Record<string, string> | undefined): HoursRow[] {
  return DAYS.map((day) => rowFromLabel(day, hours?.[day]));
}

function labelFor(row: HoursRow): string | null {
  switch (row.mode) {
    case "none":
      return null;
    case "closed":
      return "Closed";
    case "24h":
      return "24 hours";
    case "appointment":
      return "By appointment";
    case "open":
      return `${to12(row.open)} – ${to12(row.close)}`;
    case "text":
      return row.text.trim();
  }
}

/** The `hours` object for a location: day key to label, unlisted days absent. */
export function rowsToHours(rows: HoursRow[]): Record<string, string> {
  const hours: Record<string, string> = {};
  for (const row of rows) {
    const label = labelFor(row);
    if (label) hours[row.day] = label;
  }
  return hours;
}

/** A message for a row that cannot be saved, or null. */
export function rowError(row: HoursRow): string | null {
  if (row.mode === "open") {
    if (!row.open) return "Enter an opening time.";
    if (!row.close) return "Enter a closing time.";
    if (row.open === row.close) return "Opening and closing times must differ.";
  }
  if (row.mode === "text" && !row.text.trim()) return "Enter the text to show, or pick another option.";
  return null;
}

/**
 * Formatting shared by the admin pages and the printable reports: small-cell
 * suppression, percentages, local dates and CSV.
 */

/** Counts below this are shown as "<11" (common public-health small-cell rule). */
export const SMALL_CELL_THRESHOLD = 11;
export const SUPPRESSED = `<${SMALL_CELL_THRESHOLD}`;

export function isSmallCell(n: number): boolean {
  return n > 0 && n < SMALL_CELL_THRESHOLD;
}

/** A count for display or CSV: "<11" for small cells, else "1,247". */
export function countCell(n: number): string {
  return isSmallCell(n) ? SUPPRESSED : n.toLocaleString("en-US");
}

/** "(7)" counts inside free text (partner reasons) become "(<11)". */
export function suppressInlineCounts(text: string): string {
  return text.replace(/\((\d+)\)/g, (match, digits: string) =>
    isSmallCell(Number(digits)) ? `(${SUPPRESSED})` : match,
  );
}

export function pct(value: number, digits = 1): string {
  return `${value.toFixed(digits)}%`;
}

/** Share of `total` as a percentage string; "—" when the count is suppressed. */
export function shareCell(count: number, total: number): string {
  if (isSmallCell(count) || total <= 0) return "—";
  return pct((100 * count) / total);
}

/** "+13.8" / "-2.0" percentage-point gap. */
export function gapCell(gap: number): string {
  return `${gap > 0 ? "+" : ""}${gap.toFixed(1)}`;
}

/**
 * Parse "2026-11-14" or a zone-less "2026-11-14T07:00:00" as a local wall
 * time. Report run times are local city times, so they must not be shifted
 * from UTC.
 */
export function parseLocal(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(value);
  if (!m) return null;
  const [, y, mo, d, h = "0", mi = "0"] = m;
  return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi));
}

/** "Nov 5" */
export function shortDay(value: string | Date): string {
  const d = typeof value === "string" ? parseLocal(value) : value;
  return d
    ? d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
    : "";
}

/** "Nov 5, 2026" */
export function longDay(value: string | Date): string {
  const d = typeof value === "string" ? parseLocal(value) : value;
  return d
    ? d.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "";
}

/** "Nov 1, 7:00 AM" for a zone-less local timestamp; "" when unset. */
export function localRunTime(value: string): string {
  const d = parseLocal(value);
  if (!d) return "";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

/* -- CSV ------------------------------------------------------------- */

export type CsvValue = string | number | null | undefined;

export interface CsvTable {
  headers: string[];
  rows: CsvValue[][];
}

/**
 * One RFC 4180 cell. Text that a spreadsheet would run as a formula
 * (leading = + - @) gets a leading apostrophe; plain numbers are left alone.
 */
export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (
    typeof value === "string" &&
    /^[=+\-@\t\r]/.test(text) &&
    Number.isNaN(Number(text))
  ) {
    text = `'${text}`;
  }
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(table: CsvTable): string {
  return [table.headers, ...table.rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n")
    .concat("\r\n");
}

/** Save `csv` as a file (UTF-8 with BOM so Excel reads accents correctly). */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(["﻿", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Pure view helpers for the research agent pages (issue #18). Kept out of
// the components so the rules (evidence ordering, accept gate, caps) are
// unit-tested in draftView.test.ts.

import { ApiError } from "@/lib/api";
import type {
  CoverageRow,
  DraftDetail,
  DraftState,
  EvidenceSource,
  Job,
  JobCaps,
  JobState,
} from "@/lib/researchApi";

/* ---- jobs ---- */

export const JOB_STATE_LABELS: Record<JobState, string> = {
  queued: "Queued",
  awaiting_plan: "Waiting for plan approval",
  running: "Running",
  needs_review: "Ready for review",
  failed: "Failed",
  cancelled: "Cancelled",
};

export const JOB_STATE_COLORS: Record<
  JobState,
  "default" | "info" | "warning" | "success" | "error"
> = {
  queued: "default",
  awaiting_plan: "warning",
  running: "info",
  needs_review: "success",
  failed: "error",
  cancelled: "default",
};

/** States where the worker is still moving and the page should poll. */
export function isPollingState(state: JobState): boolean {
  return state === "queued" || state === "running";
}

export function canCancel(state: JobState): boolean {
  return state === "queued" || state === "awaiting_plan" || state === "running";
}

export function placeLabel(place: Job["params"]["place"]): string {
  const parts = [place.city, place.county, place.state].filter(
    (part): part is string => Boolean(part && part.trim()),
  );
  return parts.length ? parts.join(", ") : "Unknown place";
}

export function formatUsd(value: number): string {
  return `$${value.toFixed(2)}`;
}

export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "-";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

/**
 * One plain sentence for the aria-live status line. While running it only
 * names the draft count (not every counter), so a screen reader is not
 * interrupted on each 3-second poll; the full counters sit beside it.
 */
export function jobSummary(job: Job): string {
  const c = job.counters;
  const work =
    `${c.searches} searches, ${c.pages} pages read, ${c.drafts} drafts, ` +
    `about ${formatUsd(c.estimated_cost_usd)} spent`;
  switch (job.state) {
    case "queued":
      return "Queued. Waiting for the research worker to pick up this job.";
    case "awaiting_plan":
      return "The search plan is ready. Review it below and approve it to start.";
    case "running":
      return `Running. ${c.drafts} ${c.drafts === 1 ? "draft" : "drafts"} so far.`;
    case "needs_review":
      return `Finished: ${work}. Drafts are ready for review.`;
    case "failed":
      return `Failed${job.error ? `: ${job.error}` : "."} ${work}.`;
    case "cancelled":
      return `Cancelled: ${work}.`;
  }
}

export const CAP_KEYS: (keyof JobCaps)[] = [
  "max_cost_usd",
  "max_runtime_minutes",
  "max_steps",
  "max_searches",
  "max_pages",
  "max_pages_per_host",
  "max_drafts",
];

export const CAP_LABELS: Record<keyof JobCaps, string> = {
  max_steps: "Max steps",
  max_searches: "Max searches",
  max_pages: "Max pages",
  max_pages_per_host: "Max pages per site",
  max_cost_usd: "Max cost (USD)",
  max_runtime_minutes: "Max runtime (minutes)",
  max_drafts: "Max drafts",
};

/** "Stopped by cap: Max pages (50)." for a known cap, else the raw reason. */
export function stopReasonText(job: Job): string | null {
  const reason = job.stop_reason;
  if (!reason) return null;
  if (reason in CAP_LABELS) {
    const key = reason as keyof JobCaps;
    const limit = job.caps?.[key];
    const shown =
      limit === undefined
        ? ""
        : key === "max_cost_usd"
          ? ` (${formatUsd(limit)})`
          : ` (${limit})`;
    return `Stopped by cap: ${CAP_LABELS[key]}${shown}.`;
  }
  return `Stopped by cap: ${reason}.`;
}

export interface CapsFormResult {
  /** Only the caps the staff member lowered. */
  caps: Partial<JobCaps>;
  errors: Partial<Record<keyof JobCaps, string>>;
}

/**
 * Turn the caps form (strings, prefilled from the config) into the request's
 * `caps`. A value may only stay the same or go lower; unchanged caps are left
 * out so the server's configured value applies.
 */
export function capsFromForm(
  limits: JobCaps,
  values: Record<keyof JobCaps, string>,
): CapsFormResult {
  const caps: Partial<JobCaps> = {};
  const errors: Partial<Record<keyof JobCaps, string>> = {};
  for (const key of CAP_KEYS) {
    const raw = values[key].trim();
    const limit = limits[key];
    const value = Number(raw);
    const whole = key !== "max_cost_usd";
    if (!raw || !Number.isFinite(value) || value <= 0) {
      errors[key] = "Enter a number above 0.";
    } else if (whole && !Number.isInteger(value)) {
      errors[key] = "Enter a whole number.";
    } else if (value > limit) {
      errors[key] = `Can only be lowered (up to ${limit}).`;
    } else if (value < limit) {
      caps[key] = value;
    }
  }
  return { caps, errors };
}

/** The cost ceiling the run will use: the lowered value when valid. */
export function effectiveMaxCost(
  limits: JobCaps,
  form: CapsFormResult,
): number {
  return form.errors.max_cost_usd
    ? limits.max_cost_usd
    : (form.caps.max_cost_usd ?? limits.max_cost_usd);
}

/** One entry per non-blank line, trimmed. */
export function parseLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export interface CoverageView {
  rows: CoverageRow[];
  /** Requested categories that produced no drafts at any level. */
  emptyCategories: string[];
}

/**
 * Coverage rows sorted by category then level, plus every requested category
 * that has no drafts, so gaps are listed rather than hidden. Categories the
 * report never mentions get a zero row too.
 */
export function coverageView(
  coverage: CoverageRow[],
  requested: string[],
): CoverageView {
  const rows = [...coverage];
  const seen = new Set(coverage.map((row) => row.category));
  for (const category of requested) {
    if (!seen.has(category)) {
      rows.push({ category, level: "any", drafts: 0, full_evidence: 0 });
      seen.add(category);
    }
  }
  rows.sort(
    (a, b) =>
      a.category.localeCompare(b.category) || a.level.localeCompare(b.level),
  );
  const totals = new Map<string, number>();
  for (const row of rows) {
    totals.set(row.category, (totals.get(row.category) ?? 0) + row.drafts);
  }
  const emptyCategories = [...totals]
    .filter(([, drafts]) => drafts === 0)
    .map(([category]) => category);
  return { rows, emptyCategories };
}

/* ---- drafts ---- */

export const DRAFT_STATE_LABELS: Record<DraftState, string> = {
  pending: "Pending review",
  accepted: "Accepted",
  rejected: "Rejected",
  merged: "Merged",
};

export interface EvidenceRow {
  field: string;
  /** Element id for the field's evidence block (target of in-page links). */
  anchorId: string;
  sources: EvidenceSource[];
  /** True when there is no source text for the field. */
  missing: boolean;
  flags: string[];
}

/** Top-level key of a field path: "locations[0].address" -> "locations". */
function rootKey(field: string): string {
  return field.split(/[.[]/, 1)[0];
}

/**
 * Evidence grouped per field: every field with sources, every field the
 * backend listed as missing and every flagged field. Fields follow the
 * candidate record's key order (unknown fields last), then path order, so
 * the pane reads in the same order as the YAML. A field with no sources gets
 * `missing: true` and renders "No supporting text found".
 */
export function evidenceRows(
  detail: Pick<DraftDetail, "candidate" | "provenance">,
): EvidenceRow[] {
  const { fields, missing, flags } = detail.provenance;
  const names = new Set<string>([
    ...Object.keys(fields),
    ...missing,
    ...flags.map((flag) => flag.field).filter(Boolean),
  ]);
  const order = Object.keys(detail.candidate ?? {});
  const rank = (field: string) => {
    const index = order.indexOf(rootKey(field));
    return index === -1 ? order.length : index;
  };
  const sorted = [...names].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }),
  );
  return sorted.map((field, index) => {
    const sources = fields[field] ?? [];
    return {
      field,
      anchorId: evidenceAnchorId(index, field),
      sources,
      missing: sources.length === 0,
      flags: flags.filter((flag) => flag.field === field).map((f) => f.message),
    };
  });
}

/** Stable, valid element id; the index keeps "a.b" and "a-b" apart. */
export function evidenceAnchorId(index: number, field: string): string {
  return `evidence-${index}-${field.replace(/[^A-Za-z0-9_-]+/g, "-")}`;
}

/**
 * Source URLs come from scraped pages, so only http(s) URLs become links
 * (a "javascript:" URL must never reach an href). Returns the normalized URL
 * or null when it should render as text only.
 */
export function safeHttpUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed.href
      : null;
  } catch {
    return null;
  }
}

/**
 * Why Accept is disabled, or null when it is allowed. Validator errors block
 * accepting (the backend answers 409 too); unsaved YAML edits block it so
 * staff never accept a different version from the one on screen.
 */
export function acceptBlockReason(
  draft: Pick<DraftDetail, "state" | "error_count">,
  hasUnsavedEdits: boolean,
): string | null {
  if (draft.state === "accepted") return "This draft is already accepted.";
  if (draft.state === "merged") return "This draft is already merged.";
  if (draft.error_count > 0) {
    const n = draft.error_count;
    return `Fix ${n} validator ${n === 1 ? "error" : "errors"} before accepting.`;
  }
  if (hasUnsavedEdits) return "Save your YAML changes before accepting.";
  return null;
}

/** Why Reject is disabled, or null when it is allowed. */
export function rejectBlockReason(
  draft: Pick<DraftDetail, "state">,
): string | null {
  if (draft.state === "rejected") return "This draft is already rejected.";
  if (draft.state === "merged") return "This draft is already merged.";
  return null;
}

/* ---- errors ---- */

/** A readable line for a failed research API call. */
export function describeError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 403) {
      return "The staff token is missing or wrong. Set it with Unlock editing, then refresh.";
    }
    if (err.status === 404) {
      return "Not found. The research agent may be turned off for this deployment.";
    }
    if (err.status === 502 || err.status === 503) {
      return `The research worker could not be reached or refused the request: ${err.message}`;
    }
    return err.message;
  }
  return "Something went wrong. Check your connection and try again.";
}

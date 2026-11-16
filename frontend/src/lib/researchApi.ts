/* ------------------------------------------------------------------ */
/*  Catalog research agent: staff console client (issue #18)           */
/* ------------------------------------------------------------------ */
//
// Every route except GET /admin/jobs/config needs the staff X-Admin-Token
// (the same token as catalog writes), GETs included. When the feature is
// off the backend answers 404 on all of them.

import { ApiError } from "./api";
import { getAdminToken } from "./adminToken";

const BASE_URL = import.meta.env.VITE_API_URL ?? "";

/* ---- types ---- */

export type JurisdictionLevel =
  | "city"
  | "county"
  | "state"
  | "federal"
  | "nonprofit";

export const JURISDICTION_LEVELS: JurisdictionLevel[] = [
  "city",
  "county",
  "state",
  "federal",
  "nonprofit",
];

export interface JobCaps {
  max_steps: number;
  max_searches: number;
  max_pages: number;
  max_pages_per_host: number;
  max_cost_usd: number;
  max_runtime_minutes: number;
  max_drafts: number;
}

export interface JobsConfig {
  backend: "remote";
  research_enabled: boolean;
  import_enabled: boolean;
  search_provider: string;
  model: string;
  require_plan_approval: boolean;
  caps: JobCaps;
}

export interface ResearchPlace {
  city?: string;
  county?: string;
  /** Two-letter state code. */
  state: string;
}

export interface ResearchJobRequest {
  place: ResearchPlace;
  topic?: string;
  /** Category slugs; omit for all. */
  categories?: string[];
  levels?: JurisdictionLevel[];
  seed_urls?: string[];
  allowed_domains?: string[];
  /** Can only lower the configured caps. */
  caps?: Partial<JobCaps>;
  acknowledge_cost: true;
}

export type JobState =
  | "queued"
  | "awaiting_plan"
  | "running"
  | "needs_review"
  | "failed"
  | "cancelled";

export interface PlanQuery {
  query: string;
  category: string;
  level: string;
  rationale: string;
}

export interface JobPlan {
  queries: PlanQuery[];
  expected_sources: string[];
}

export interface CoverageRow {
  category: string;
  level: string;
  drafts: number;
  full_evidence: number;
}

export interface JobReport {
  coverage: CoverageRow[];
  unreachable: string[];
  notices: string[];
}

export interface JobCounters {
  steps: number;
  searches: number;
  pages: number;
  input_tokens: number;
  output_tokens: number;
  estimated_cost_usd: number;
  drafts: number;
}

export interface Job {
  id: string;
  kind: "research" | "noop";
  state: JobState;
  params: {
    place: {
      city: string | null;
      county: string | null;
      state: string | null;
      country: string | null;
    };
    topic: string | null;
    categories: string[] | null;
    levels: string[] | null;
    seed_urls: string[] | null;
    allowed_domains: string[] | null;
  };
  caps: JobCaps;
  counters: JobCounters;
  plan: JobPlan | null;
  plan_approved: boolean;
  /** Set when a cap ended the run, e.g. "max_pages". */
  stop_reason: string | null;
  error: string | null;
  report: JobReport | null;
  created_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_by: string | null;
}

export type JobEventType =
  | "planned"
  | "search"
  | "fetch"
  | "extract"
  | "draft_created"
  | "skipped"
  | "warning"
  | "state";

export interface JobEvent {
  id: number;
  at: string;
  type: JobEventType;
  message: string;
}

export type DraftState = "pending" | "accepted" | "rejected" | "merged";

export interface DraftSummary {
  id: string;
  job_id: string;
  kind: "service";
  state: DraftState;
  name: string;
  slug: string;
  /** 0..1 */
  confidence: number;
  error_count: number;
  warning_count: number;
  duplicate_count: number;
  flag_count: number;
  reviewed_at: string | null;
  reject_reason: string | null;
}

export interface EvidenceSource {
  url: string;
  title: string;
  quote: string;
  retrieved_at: string;
}

export interface ProvenanceFlag {
  field: string;
  message: string;
}

export interface Provenance {
  fields: Record<string, EvidenceSource[]>;
  /** Fields with no supporting text found. */
  missing: string[];
  flags: ProvenanceFlag[];
}

export interface ValidationIssue {
  file: string;
  path: string;
  code: string;
  message: string;
  severity: string;
}

export interface DraftDuplicate {
  slug: string;
  name: string;
  source: "pack" | "draft";
  reasons: string[];
}

export interface DraftDetail extends DraftSummary {
  candidate: Record<string, unknown>;
  yaml: string;
  provenance: Provenance;
  issues: { errors: ValidationIssue[]; warnings: ValidationIssue[] };
  duplicates: DraftDuplicate[];
}

/* ---- request helper ---- */

// FastAPI errors arrive as {"detail": string} or, for validation errors,
// {"detail": [{loc, msg}, ...]}. Turn either into one readable line.
function errorDetail(body: string, status: number): string {
  try {
    const parsed = JSON.parse(body) as { detail?: unknown };
    const detail = parsed?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      const lines = detail
        .map((item) => {
          const entry = item as { loc?: unknown; msg?: unknown };
          if (typeof entry?.msg !== "string") return "";
          const loc = Array.isArray(entry.loc)
            ? entry.loc.filter((part) => part !== "body").join(".")
            : "";
          return loc ? `${loc}: ${entry.msg}` : entry.msg;
        })
        .filter(Boolean);
      if (lines.length) return lines.join("; ");
    }
  } catch {
    // non-JSON body
  }
  return `Request failed (${status}).`;
}

function adminHeaders(): Record<string, string> {
  const token = getAdminToken();
  return token ? { "X-Admin-Token": token } : {};
}

async function send(
  method: string,
  path: string,
  body?: unknown,
  withToken = true,
): Promise<Response> {
  const headers: Record<string, string> = withToken ? adminHeaders() : {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const detail = errorDetail(text, res.status);
    // Optional access-code gate (private demo deployments), as in api.ts.
    if (res.status === 401 && detail === "Access code required.") {
      const here = window.location.pathname + window.location.search;
      window.location.assign(`/access?next=${encodeURIComponent(here)}`);
    }
    throw new ApiError(res.status, detail);
  }
  return res;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  withToken = true,
): Promise<T> {
  const res = await send(method, path, body, withToken);
  return res.json() as Promise<T>;
}

const enc = encodeURIComponent;

/* ---- endpoints ---- */

/** 404 means the feature is off for this deployment. No token needed. */
export function getJobsConfig() {
  return request<JobsConfig>("GET", "/api/v1/admin/jobs/config", undefined, false);
}

export function startResearchJob(body: ResearchJobRequest) {
  return request<{ id: string }>("POST", "/api/v1/admin/research/jobs", body);
}

export function listJobs() {
  return request<{ items: Job[] }>("GET", "/api/v1/admin/jobs");
}

export function getJob(id: string) {
  return request<Job>("GET", `/api/v1/admin/jobs/${enc(id)}`);
}

export function getJobEvents(id: string, after = 0) {
  return request<{ items: JobEvent[]; next_after: number }>(
    "GET",
    `/api/v1/admin/jobs/${enc(id)}/events?after=${after}`,
  );
}

/** keep: indices of plan.queries to keep; omit to keep all. */
export function approvePlan(id: string, keep?: number[]) {
  return request<Job>(
    "POST",
    `/api/v1/admin/jobs/${enc(id)}/approve-plan`,
    keep ? { keep } : {},
  );
}

export function cancelJob(id: string) {
  return request<Job>("POST", `/api/v1/admin/jobs/${enc(id)}/cancel`);
}

export function listDrafts(params: { job?: string; state?: DraftState } = {}) {
  const query = new URLSearchParams();
  if (params.job) query.set("job", params.job);
  if (params.state) query.set("state", params.state);
  const qs = query.toString();
  return request<{ items: DraftSummary[] }>(
    "GET",
    `/api/v1/admin/drafts${qs ? `?${qs}` : ""}`,
  );
}

export function getDraft(id: string) {
  return request<DraftDetail>("GET", `/api/v1/admin/drafts/${enc(id)}`);
}

/** Revalidated server-side; 422 if the YAML is not a mapping. */
export function saveDraftYaml(id: string, yaml: string) {
  return request<DraftDetail>("PATCH", `/api/v1/admin/drafts/${enc(id)}`, {
    yaml,
  });
}

/** 409 with a detail when the draft still has validator errors. */
export function acceptDraft(id: string) {
  return request<DraftDetail>(
    "POST",
    `/api/v1/admin/drafts/${enc(id)}/accept`,
  );
}

export function rejectDraft(id: string, reason: string) {
  return request<DraftDetail>(
    "POST",
    `/api/v1/admin/drafts/${enc(id)}/reject`,
    { reason },
  );
}

/**
 * Download the job's accepted drafts as a pack zip. A plain link would not
 * carry the token header, so fetch the blob and save it via an object URL.
 */
export async function downloadJobExport(id: string): Promise<void> {
  const res = await send("GET", `/api/v1/admin/jobs/${enc(id)}/export.zip`);
  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const named = /filename="?([^";]+)"?/i.exec(disposition)?.[1];
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = named || `research-${id}.zip`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Give the browser a moment to start the download before revoking.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Partner-list import API (issue #19). Every route 404s unless the server
// turns the feature on, and the write routes need the staff-entered
// X-Admin-Token. The server keeps nothing between calls: the file is sent
// again with the confirmed mapping, and reviewed drafts are sent back for
// validation and export.

import { getAdminToken } from "../../../lib/adminToken";

const BASE_URL = import.meta.env.VITE_API_URL ?? "";
const PREFIX = "/api/v1/admin/import";

export interface ImportConfig {
  enabled: boolean;
  accepted: string[];
  max_file_mb: number;
  max_rows: number;
  model_available: boolean;
  job_backend: string;
}

export interface ImportColumn {
  index: number;
  letter: string;
  header: string;
  action: "keep" | "drop";
  field: string | null;
  reason: string;
  sensitive: boolean;
}

export interface ImportTable {
  id: string;
  name: string;
  header_row: number;
  header_choices: Array<{ row: number; source_row: number }>;
  row_count: number;
  columns: ImportColumn[];
  preview: Array<{ row: number; cells: string[] }>;
}

export interface InspectResult {
  file_name: string;
  kind: string;
  tables: ImportTable[];
  default_table: string;
  notes: string[];
  fields: Array<{ value: string; label: string }>;
}

export interface Issue {
  path: string;
  code: string;
  message: string;
}

export interface DraftService {
  id: string;
  slug: string;
  name: string;
  provider_name: string;
  [key: string]: unknown;
}

export interface Draft {
  key: string;
  service: DraftService;
  flags: Array<{ code: string; message: string }>;
  suggestions: string[];
  source_rows: Array<{ row: number; cells: Array<{ header: string; field: string; value: string }> }>;
  grouped: boolean;
  provenance: { source: string; file_name: string; sheet: string; row: number; rows: number[] };
  duplicates: Array<{ slug: string; id: string; name: string; reasons: string[] }>;
  duplicate_in_file: string[];
  errors: Issue[];
  warnings: Issue[];
}

export interface DraftsResult {
  drafts: Draft[];
  pack_issues: Array<Issue & { file: string }>;
  file_name: string;
  table: { id: string; name: string; header_row: number };
  mapped_columns: Array<{ index: number; header: string; field: string }>;
  rows_read: number;
  rows_skipped: number;
  notes: string[];
  model: { requested: boolean; used: boolean; note: string; estimated_usd?: number };
}

export interface ExportItem {
  service: DraftService;
  merge_into?: string | null;
  provenance: Draft["provenance"];
  flags: Draft["flags"];
  suggestions: string[];
}

export interface Problem {
  index: number | null;
  slug: string | null;
  errors: Issue[];
}

export interface ValidateResult {
  items: Array<{ index: number; slug: string; record: DraftService; warnings: Issue[] }>;
  problems: Problem[];
  ok: boolean;
}

export interface DraftParams {
  table: string;
  header_row: number;
  mapping: Record<string, string>;
  use_model: boolean;
  group: boolean;
}

export class ImportError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public problems: Problem[] = [],
  ) {
    super(message);
    this.name = "ImportError";
  }
}

function authHeaders(): Record<string, string> {
  const token = getAdminToken();
  return token ? { "X-Admin-Token": token } : {};
}

async function failure(res: Response): Promise<ImportError> {
  const text = await res.text().catch(() => "");
  try {
    const body = JSON.parse(text) as { code?: string; message?: string; detail?: unknown; problems?: Problem[] };
    if (body.message) return new ImportError(res.status, body.code ?? "error", body.message, body.problems ?? []);
    if (typeof body.detail === "string") return new ImportError(res.status, "error", body.detail);
  } catch {
    // not JSON
  }
  return new ImportError(res.status, "error", `Request failed (${res.status}).`);
}

async function send(path: string, init: RequestInit): Promise<Response> {
  const res = await fetch(`${BASE_URL}${PREFIX}${path}`, {
    ...init,
    headers: { ...authHeaders(), ...(init.headers as Record<string, string> | undefined) },
  });
  if (!res.ok) throw await failure(res);
  return res;
}

/** The feature's settings, or null when the server has it turned off (404). */
export async function getImportConfig(): Promise<ImportConfig | null> {
  try {
    const res = await fetch(`${BASE_URL}${PREFIX}/config`);
    if (!res.ok) return null;
    return (await res.json()) as ImportConfig;
  } catch {
    return null;
  }
}

export async function inspectFile(file: File, table?: string, headerRow?: number): Promise<InspectResult> {
  const form = new FormData();
  form.append("file", file, file.name);
  if (table) form.append("table", table);
  if (headerRow) form.append("header_row", String(headerRow));
  const res = await send("/inspect", { method: "POST", body: form });
  return (await res.json()) as InspectResult;
}

export async function buildDrafts(file: File, params: DraftParams): Promise<DraftsResult> {
  const form = new FormData();
  form.append("file", file, file.name);
  form.append("params", JSON.stringify(params));
  const res = await send("/drafts", { method: "POST", body: form });
  return (await res.json()) as DraftsResult;
}

export async function validateItems(items: ExportItem[]): Promise<ValidateResult> {
  const res = await send("/validate", {
    method: "POST",
    body: JSON.stringify({ items }),
    headers: { "Content-Type": "application/json" },
  });
  return (await res.json()) as ValidateResult;
}

export async function exportItems(items: ExportItem[]): Promise<Blob> {
  const res = await send("/export", {
    method: "POST",
    body: JSON.stringify({ items }),
    headers: { "Content-Type": "application/json" },
  });
  return res.blob();
}

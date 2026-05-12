/* ------------------------------------------------------------------ */
/*  API client for the Austin Service Guide backend                    */
/* ------------------------------------------------------------------ */

import type {
  IntakeSession,
  IntakeMessage,
  Service,
  ServiceCategory,
  LifeEvent,
  MapPin,
  CrisisResource,
  DemoResident,
  AnalyticsOverview,
  DemographicsData,
  EquityData,
  LanguageUsageItem,
  ServiceDemandItem,
  AuditLogEntry,
  StaffMember,
  PaginatedResponse,
} from "@/types";

const BASE_URL = import.meta.env.VITE_API_URL ?? "";

/* ---- generic request helper ---- */

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function apiRequest<T>(
  method: string,
  path: string,
  body?: unknown,
  options: { timeoutMs?: number } = {},
): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const headers: Record<string, string> = {};
  const controller =
    options.timeoutMs && options.timeoutMs > 0 ? new AbortController() : null;
  const timeoutId = controller
    ? window.setTimeout(() => controller.abort(), options.timeoutMs)
    : null;
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller?.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "Unknown error");
      throw new ApiError(res.status, text);
    }
    if (res.status === 204) return undefined as unknown as T;
    return res.json() as Promise<T>;
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError(408, `Request timed out after ${options.timeoutMs}ms`);
    }
    throw err;
  } finally {
    if (timeoutId) window.clearTimeout(timeoutId);
  }
}

/* ------------------------------------------------------------------ */
/*  Resident-facing endpoints                                          */
/* ------------------------------------------------------------------ */

export interface PersonaSummary {
  id: string;
  label: string;
  language: string;
}

export function getPersonas() {
  return apiRequest<{ personas: PersonaSummary[] }>(
    "GET",
    "/api/v1/intake/personas",
  );
}

export interface PersonaScriptTurn {
  role: "user" | "assistant";
  content: string;
  delay_ms: number;
}

export function loadPersona(personaId: string) {
  return apiRequest<{
    session_id: string;
    language: string;
    entry_source: string;
    status: string;
    conversation: IntakeMessage[];
    last_message: IntakeMessage | null;
    opening_message: string;
    script: PersonaScriptTurn[];
  }>("POST", "/api/v1/intake/load-persona", { persona_id: personaId });
}

export async function startIntake(
  language = "en",
  lifeEvent?: string,
  focus?: string[],
  mode: "text" | "voice" = "text",
): Promise<IntakeSession> {
  const body: Record<string, string | string[]> = { language };
  if (lifeEvent) body.life_event = lifeEvent;
  if (focus && focus.length > 0) body.focus = focus;
  body.mode = mode;

  const raw = await apiRequest<{
    session_id: string;
    language: string;
    greeting: IntakeMessage | null;
  }>("POST", "/api/v1/intake/start", body);

  return {
    id: raw.session_id,
    language: raw.language,
    conversation: raw.greeting ? [raw.greeting] : [],
    extracted_profile: {
      age_range: "",
      household_size: null,
      zip_code: "",
      housing_situation: "",
      employment_status: "",
      income_bracket: "",
      insurance_status: "",
      has_children: null,
      veteran_status: null,
      has_disability: null,
      immediate_needs: [],
      languages_spoken: [],
      crisis_indicators: [],
    },
    status: "in_progress",
    matches: [],
    risk_flags: [],
    created_at: new Date().toISOString(),
  };
}

export async function sendIntakeMessage(
  sessionId: string,
  message: string,
  language = "en",
): Promise<IntakeMessage> {
  const raw = await apiRequest<{
    session_id: string;
    response: IntakeMessage;
    status: string;
  }>("POST", `/api/v1/intake/${sessionId}/message`, { message, language });
  return raw.response;
}

export interface RealtimeClientSecretResponse {
  session_id: string;
  model: string;
  session_config: Record<string, unknown>;
  client_secret: {
    value: string;
    expires_at: number;
    session: { id: string };
  };
}

export function createRealtimeClientSecret(sessionId: string, language = "en") {
  return apiRequest<RealtimeClientSecretResponse>(
    "POST",
    `/api/v1/intake/${sessionId}/realtime/client-secret`,
    { language },
  );
}

export interface RealtimeToolResult {
  session_id: string;
  call_id: string;
  output: string;
  status: string;
  progress_percent: number;
  is_complete: boolean;
  crisis_detected: boolean;
  match_count?: number;
  /**
   * Present after state-mutating tool calls (extract_profile, set_language,
   * complete_intake). The voice hook diff-checks this against the last-pushed
   * instructions and emits a `session.update` so the realtime model picks up
   * the refreshed "Currently known" snapshot before its next response.
   */
  refreshed_instructions?: string;
}

export function executeRealtimeTool(
  sessionId: string,
  body: { name: string; arguments: Record<string, unknown>; call_id: string },
) {
  return apiRequest<RealtimeToolResult>(
    "POST",
    `/api/v1/intake/${sessionId}/realtime/tool`,
    body,
    { timeoutMs: 20000 },
  );
}

export interface RealtimeTranscriptResult {
  session_id: string;
  messages: IntakeMessage[];
  status: string;
  progress_percent: number;
  is_complete: boolean;
  crisis_detected: boolean;
}

export function syncRealtimeTranscript(
  sessionId: string,
  body: { role: "user" | "assistant"; content: string },
) {
  return apiRequest<RealtimeTranscriptResult>(
    "POST",
    `/api/v1/intake/${sessionId}/realtime/transcript`,
    body,
    { timeoutMs: 12000 },
  );
}

export interface RealtimeDebugEvent {
  seq: number;
  timestamp: string;
  event: string;
  source: string;
  status: string | null;
  detail: Record<string, unknown>;
}

// The realtime debug endpoint is gated by REALTIME_DEBUG_LOG_ENABLED on the
// backend. When it's off, every recordDebug() call (status change, tool
// dispatch, transport event…) would otherwise POST and get back a 404,
// spamming the console. After the first 404 we latch this flag and skip
// further POSTs. console.debug() in the caller still runs so local devs see
// events. resetRealtimeDebugLogDisabled() clears the flag at the start of a
// new realtime session so a config change doesn't require a page reload.
let realtimeDebugLogDisabled = false;

export function resetRealtimeDebugLogDisabled() {
  realtimeDebugLogDisabled = false;
}

export function logRealtimeDebugEvent(
  sessionId: string,
  body: {
    event: string;
    source?: string;
    status?: string;
    detail?: Record<string, unknown>;
  },
): Promise<{ ok: boolean; event: RealtimeDebugEvent } | null> {
  if (realtimeDebugLogDisabled) {
    return Promise.resolve(null);
  }
  return apiRequest<{ ok: boolean; event: RealtimeDebugEvent }>(
    "POST",
    `/api/v1/intake/${sessionId}/realtime/debug`,
    {
      source: "client",
      detail: {},
      ...body,
    },
    { timeoutMs: 5000 },
  ).catch((err) => {
    // 404 with detail="Not found" means the endpoint itself is disabled
    // (REALTIME_DEBUG_LOG_ENABLED=false). Latch and swallow so the burst of
    // in-flight POSTs that fired before the first 404 arrived doesn't each
    // surface as an unhandled rejection. A 404 with detail="Session not
    // found" means just this sessionId is stale — re-throw so the caller
    // can see it; we don't latch so a subsequent valid session still logs.
    if (
      err instanceof ApiError &&
      err.status === 404 &&
      isDebugEndpointDisabledDetail(err.message)
    ) {
      realtimeDebugLogDisabled = true;
      return null;
    }
    throw err;
  });
}

function isDebugEndpointDisabledDetail(message: string): boolean {
  try {
    const parsed = JSON.parse(message) as { detail?: unknown };
    return parsed?.detail === "Not found";
  } catch {
    return false;
  }
}

export function getRealtimeDebugEvents(sessionId: string, limit = 200) {
  return apiRequest<{ session_id: string; events: RealtimeDebugEvent[] }>(
    "GET",
    `/api/v1/intake/${sessionId}/realtime/debug?limit=${limit}`,
  );
}

export interface ApplicationOrderItem {
  rank: number;
  service_id: string;
  service_slug: string;
  service_name: string;
  category: string;
  reason: string;
}

export function getIntakeResults(sessionId: string) {
  return apiRequest<{
    session_id: string;
    status: string;
    language: string;
    profile: import("@/types").ResidentProfile;
    matches: import("@/types").ServiceMatch[];
    risk_flags: import("@/types").RiskFlag[];
    benefits_estimate: import("@/types").BenefitsEstimate;
    application_order: ApplicationOrderItem[];
    plan_synthesis: string;
    plan_ai_generated: boolean;
    conversation_length: number;
  }>("GET", `/api/v1/intake/${sessionId}/results`);
}

export function getIntakePlanSummary(sessionId: string) {
  return apiRequest<{
    session_id: string;
    summary: string;
    match_count: number;
    started_at: string;
    status: string;
  }>("GET", `/api/v1/intake/${sessionId}/summary`);
}

export function shareIntakeResults(
  sessionId: string,
  body: { channel: "sms" | "email"; recipient: string; language?: string },
) {
  return apiRequest<{
    ok: boolean;
    demo: boolean;
    channel: string;
    to: string;
  }>("POST", `/api/v1/intake/${sessionId}/share`, body);
}

export function getServices(params?: {
  page?: number;
  page_size?: number;
  category?: string;
  search?: string;
  sort?: string;
  open_now?: boolean;
}) {
  const sp = new URLSearchParams();
  if (params?.page) sp.set("page", String(params.page));
  if (params?.page_size) sp.set("page_size", String(params.page_size));
  if (params?.category) sp.set("category", params.category);
  if (params?.search) sp.set("search", params.search);
  if (params?.sort) sp.set("sort", params.sort);
  if (params?.open_now) sp.set("open_now", "true");
  const qs = sp.toString();
  return apiRequest<PaginatedResponse<Service>>(
    "GET",
    `/api/v1/services${qs ? `?${qs}` : ""}`,
  );
}

export function getServiceBySlug(slug: string) {
  return apiRequest<Service>("GET", `/api/v1/services/${slug}`);
}

export function getCategories() {
  return apiRequest<ServiceCategory[]>("GET", "/api/v1/categories");
}

export function getLifeEvents() {
  return apiRequest<LifeEvent[]>("GET", "/api/v1/life-events");
}

export function getMapPins(params?: { categories?: string[] }) {
  const sp = new URLSearchParams();
  if (params?.categories) {
    params.categories.forEach((c) => sp.append("category", c));
  }
  const qs = sp.toString();
  return apiRequest<MapPin[]>(
    "GET",
    `/api/v1/map/services${qs ? `?${qs}` : ""}`,
  );
}

export function getCrisisResources() {
  return apiRequest<CrisisResource[]>("GET", "/api/v1/crisis-resources");
}

/* ------------------------------------------------------------------ */
/*  Admin endpoints                                                    */
/* ------------------------------------------------------------------ */

export function getAdminResidents(params?: {
  page?: number;
  page_size?: number;
  search?: string;
}) {
  const sp = new URLSearchParams();
  if (params?.page) sp.set("page", String(params.page));
  if (params?.page_size) sp.set("page_size", String(params.page_size));
  if (params?.search) sp.set("search", params.search);
  const qs = sp.toString();
  return apiRequest<PaginatedResponse<DemoResident>>(
    "GET",
    `/api/v1/admin/residents${qs ? `?${qs}` : ""}`,
  );
}

export async function getAdminResident(id: string): Promise<DemoResident> {
  const raw = await apiRequest<{
    resident: DemoResident;
    matches?: unknown[];
    risk_flags?: unknown[];
    benefits_estimate?: unknown;
  }>("GET", `/api/v1/admin/residents/${id}`);
  return {
    ...raw.resident,
    _matches: raw.matches,
    _risk_flags: raw.risk_flags,
    _benefits_estimate: raw.benefits_estimate,
  } as DemoResident;
}

export function getAdminAnalytics() {
  return apiRequest<AnalyticsOverview>(
    "GET",
    "/api/v1/admin/analytics/overview",
  );
}

export function getAdminDemographics() {
  return apiRequest<DemographicsData>(
    "GET",
    "/api/v1/admin/analytics/demographics",
  );
}

export function getAdminEquity() {
  return apiRequest<EquityData>("GET", "/api/v1/admin/analytics/equity");
}

export function getAdminLanguages() {
  return apiRequest<LanguageUsageItem[]>(
    "GET",
    "/api/v1/admin/analytics/languages",
  );
}

export function getAdminServiceDemand() {
  return apiRequest<ServiceDemandItem[]>(
    "GET",
    "/api/v1/admin/analytics/services",
  );
}

export function getAdminAuditLog(params?: {
  page?: number;
  page_size?: number;
}) {
  const sp = new URLSearchParams();
  if (params?.page) sp.set("page", String(params.page));
  if (params?.page_size) sp.set("page_size", String(params.page_size));
  const qs = sp.toString();
  return apiRequest<PaginatedResponse<AuditLogEntry>>(
    "GET",
    `/api/v1/admin/audit-log${qs ? `?${qs}` : ""}`,
  );
}

export function getAdminStaff() {
  return apiRequest<StaffMember[]>("GET", "/api/v1/admin/staff");
}

export function updateAdminService(id: string, data: Partial<Service>) {
  return apiRequest<Service>("PATCH", `/api/v1/admin/services/${id}`, data);
}

export function createAdminService(data: Partial<Service>) {
  return apiRequest<Service>("POST", "/api/v1/admin/services", data);
}

// ── New admin endpoints ───────────────────────────────────────────

export interface EligibilityRule {
  id: string;
  name: string;
  category: string;
  criteria: string;
  services: string[];
  hits_30d: number;
  is_active: boolean;
  last_updated: string;
}

export interface DemandMapPoint {
  zip: string;
  lat: number;
  lng: number;
  sessions: number;
  top_categories: string[];
  intensity: "high" | "medium" | "low";
  heat_intensity?: "high" | "medium" | "low";
  heat_vulnerable_sessions?: number;
}

export interface AdminReport {
  id: string;
  title: string;
  description: string;
  category: string;
  format: string;
  row_count: number;
  last_run: string;
  schedule: string;
  owner: string;
}

export function getAdminEligibilityRules() {
  return apiRequest<EligibilityRule[]>(
    "GET",
    "/api/v1/admin/eligibility-rules",
  );
}

export function getAdminDemandMap() {
  return apiRequest<DemandMapPoint[]>(
    "GET",
    "/api/v1/admin/analytics/demand-map",
  );
}

export function getAdminReports() {
  return apiRequest<AdminReport[]>("GET", "/api/v1/admin/reports");
}

export interface PartnerGap {
  partner: string;
  category: string;
  referrals: number;
  connections: number;
  gap: number;
  primary_languages: string[];
  top_reasons: string[];
  trend: number[];
}

export interface PartnerGapsResponse {
  totals: {
    referrals: number;
    connections: number;
    gap: number;
    connection_rate: number;
  };
  partners: PartnerGap[];
}

export function getAdminPartnerGaps() {
  return apiRequest<PartnerGapsResponse>("GET", "/api/v1/admin/partner-gaps");
}

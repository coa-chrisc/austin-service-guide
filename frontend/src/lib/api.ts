/* ------------------------------------------------------------------ */
/*  API client for the Civic Service Guide backend                     */
/* ------------------------------------------------------------------ */

import { getAdminToken } from "./adminToken";
import type {
  BenefitsEstimate,
  IntakeMessage,
  IntakePlan,
  IntakePlanItem,
  IntakeState,
  ResidentProfile,
  RiskFlag,
  ServiceMatch,
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

// FastAPI errors arrive as {"detail": ...}. Surface a string detail as the
// message so pages never render raw JSON; anything else gets a generic line.
function errorDetail(body: string, status: number): string {
  try {
    const parsed = JSON.parse(body) as { detail?: unknown };
    if (typeof parsed?.detail === "string") return parsed.detail;
  } catch {
    // non-JSON body
  }
  return `Request failed (${status}).`;
}

async function apiRequest<T>(
  method: string,
  path: string,
  body?: unknown,
  options: { timeoutMs?: number; headers?: Record<string, string> } = {},
): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const headers: Record<string, string> = { ...options.headers };
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
      const text = await res.text().catch(() => "");
      throw new ApiError(res.status, errorDetail(text, res.status));
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
    state: IntakeState;
    language: string;
    entry_source: string;
    status: string;
    conversation: IntakeMessage[];
    last_message: IntakeMessage | null;
    opening_message: string;
    script: PersonaScriptTurn[];
  }>("POST", "/api/v1/intake/load-persona", { persona_id: personaId });
}

/*  Intake endpoints are stateless: each takes the client-held intake state
    and returns the updated copy. Callers go through withIntakeState() in
    lib/session.ts so requests are serialized and the result is saved. */

export function startIntake(
  language = "en",
  lifeEvent?: string,
  focus?: string[],
  mode: "text" | "voice" = "text",
) {
  const body: Record<string, string | string[]> = { language };
  if (lifeEvent) body.life_event = lifeEvent;
  if (focus && focus.length > 0) body.focus = focus;
  body.mode = mode;
  return apiRequest<{
    state: IntakeState;
    language: string;
    greeting: IntakeMessage | null;
  }>("POST", "/api/v1/intake/start", body);
}

export function sendIntakeMessage(
  state: IntakeState,
  message: string,
  language = "en",
) {
  return apiRequest<{
    state: IntakeState;
    response: IntakeMessage;
    /** Stored, PII-redacted copy of what the resident typed. */
    user_message: IntakeMessage;
    status: string;
  }>("POST", "/api/v1/intake/message", { state, message, language });
}

/**
 * How this deployment runs voice. "intercepted_text" (the default) keeps audio
 * on the device: on-device speech-to-text, then the normal text path.
 * "realtime_audio" streams raw audio to OpenAI's Realtime API.
 */
export type VoicePipelineMode = "intercepted_text" | "realtime_audio";

export interface VoiceConfig {
  /** Effective mode: "realtime_audio" only when the server allows raw audio. */
  mode: VoicePipelineMode;
  raw_audio_allowed: boolean;
  live_ai: boolean;
}

/** Deployment voice settings. No body and no resident data. */
export function getVoiceConfig() {
  return apiRequest<VoiceConfig>(
    "GET",
    "/api/v1/intake/voice-config",
    undefined,
    { timeoutMs: 8000 },
  );
}

export interface RealtimeClientSecretResponse {
  state: IntakeState;
  model: string;
  session_config: Record<string, unknown>;
  client_secret: {
    value: string;
    expires_at: number;
    session: { id: string };
  };
}

export function createRealtimeClientSecret(
  state: IntakeState,
  language = "en",
  traceId = "",
) {
  return apiRequest<RealtimeClientSecretResponse>(
    "POST",
    "/api/v1/intake/realtime/client-secret",
    { state, language, trace_id: traceId },
  );
}

export interface RealtimeToolResult {
  state: IntakeState;
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
  state: IntakeState,
  body: {
    name: string;
    arguments: Record<string, unknown>;
    call_id: string;
    trace_id?: string;
  },
) {
  return apiRequest<RealtimeToolResult>(
    "POST",
    "/api/v1/intake/realtime/tool",
    { state, ...body },
    { timeoutMs: 20000 },
  );
}

export interface RealtimeTranscriptResult {
  state: IntakeState;
  messages: IntakeMessage[];
  /** Identifier types removed from the transcript (e.g. "phone"). */
  redacted?: string[];
  /** Stored, redacted form of the synced turn; present even when nothing was stored. */
  redacted_content?: string;
  status: string;
  progress_percent: number;
  is_complete: boolean;
  crisis_detected: boolean;
}

export function syncRealtimeTranscript(
  state: IntakeState,
  body: { role: "user" | "assistant"; content: string; trace_id?: string },
) {
  return apiRequest<RealtimeTranscriptResult>(
    "POST",
    "/api/v1/intake/realtime/transcript",
    { state, ...body },
    { timeoutMs: 12000 },
  );
}

export interface RealtimeDebugEvent {
  trace_id: string;
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
// further POSTs for the rest of the page session (new voice sessions do not
// re-arm it). console.debug() in the caller still runs so local devs see
// events. resetRealtimeDebugLogDisabled() is for tests / explicit re-arming.
let realtimeDebugLogDisabled = false;

export function resetRealtimeDebugLogDisabled() {
  realtimeDebugLogDisabled = false;
}

/** `traceId` is a random per-voice-session id; it never names a resident. */
export function logRealtimeDebugEvent(
  traceId: string,
  body: {
    event: string;
    source?: string;
    status?: string;
    detail?: Record<string, unknown>;
  },
): Promise<{ ok: boolean; event: RealtimeDebugEvent } | null> {
  if (realtimeDebugLogDisabled || !traceId) {
    return Promise.resolve(null);
  }
  return apiRequest<{ ok: boolean; event: RealtimeDebugEvent }>(
    "POST",
    "/api/v1/intake/realtime/debug",
    {
      source: "client",
      detail: {},
      ...body,
      trace_id: traceId,
    },
    { timeoutMs: 5000 },
  ).catch((err) => {
    // Any 404 (endpoint disabled) latches the flag and is swallowed so the
    // burst of in-flight POSTs that fired before the first 404 arrived
    // doesn't surface as unhandled rejections.
    if (err instanceof ApiError && err.status === 404) {
      realtimeDebugLogDisabled = true;
      return null;
    }
    throw err;
  });
}

export function getRealtimeDebugEvents(traceId: string, limit = 200) {
  return apiRequest<{ trace_id: string; events: RealtimeDebugEvent[] }>(
    "GET",
    `/api/v1/intake/realtime/debug/${encodeURIComponent(traceId)}?limit=${limit}`,
  );
}

export type ApplicationOrderItem = IntakePlanItem;

export interface IntakeResults {
  state: IntakeState;
  status: string;
  language: string;
  profile: ResidentProfile;
  matches: ServiceMatch[];
  risk_flags: RiskFlag[];
  benefits_estimate: BenefitsEstimate;
  application_order: ApplicationOrderItem[];
  plan_synthesis: string;
  plan_ai_generated: boolean;
  /** Matches exist but no plan has been built yet: call buildIntakePlan. */
  plan_pending: boolean;
  conversation_length: number;
}

/** Hydrate results for the client-held state. Catalog data only; no model call. */
export function getIntakeResults(state: IntakeState) {
  return apiRequest<IntakeResults>("POST", "/api/v1/intake/results", {
    state,
  });
}

/** Build the ordered plan for a completed intake; returns it inside the state. */
export function buildIntakePlan(state: IntakeState) {
  return apiRequest<{ state: IntakeState; plan: IntakePlan }>(
    "POST",
    "/api/v1/intake/plan",
    { state },
    { timeoutMs: 60000 },
  );
}

/**
 * Send catalog details for these services by SMS or email. The server
 * builds the message from catalog data only and does not keep the recipient.
 */
export function shareIntakeResults(body: {
  channel: "sms" | "email";
  recipient: string;
  service_ids: string[];
  language?: string;
}) {
  return apiRequest<{
    ok: boolean;
    demo: boolean;
    channel: string;
    service_count: number;
  }>("POST", "/api/v1/intake/share", body);
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

// Catalog writes need the staff-entered X-Admin-Token (sessionStorage only).
function adminWriteOptions() {
  const token = getAdminToken();
  const headers: Record<string, string> = {};
  if (token) headers["X-Admin-Token"] = token;
  return { headers };
}

export function updateAdminService(id: string, data: Partial<Service>) {
  return apiRequest<Service>(
    "PATCH",
    `/api/v1/admin/services/${id}`,
    data,
    adminWriteOptions(),
  );
}

export function createAdminService(data: Partial<Service>) {
  return apiRequest<Service>(
    "POST",
    "/api/v1/admin/services",
    data,
    adminWriteOptions(),
  );
}

export function deleteAdminService(id: string) {
  return apiRequest<{ status: string; service_id: string }>(
    "DELETE",
    `/api/v1/admin/services/${id}`,
    undefined,
    adminWriteOptions(),
  );
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

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
): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const headers: Record<string, string> = {};
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new ApiError(res.status, text);
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

/* ------------------------------------------------------------------ */
/*  Resident-facing endpoints                                          */
/* ------------------------------------------------------------------ */

export async function startIntake(
  language = "en",
  lifeEvent?: string,
): Promise<IntakeSession> {
  const body: Record<string, string> = { language };
  if (lifeEvent) body.life_event = lifeEvent;

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
    profile: import("@/types").ResidentProfile;
    matches: import("@/types").ServiceMatch[];
    risk_flags: import("@/types").RiskFlag[];
    benefits_estimate: import("@/types").BenefitsEstimate;
    application_order: ApplicationOrderItem[];
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

/* ------------------------------------------------------------------ */
/*  TypeScript types matching the backend Pydantic models              */
/* ------------------------------------------------------------------ */

// Enums
export type CostType =
  | "free"
  | "sliding_scale"
  | "flat_fee"
  | "insurance"
  | "varies";
export type ServiceStatus = "active" | "inactive" | "seasonal";
export type IntakeStatus = "in_progress" | "completed" | "abandoned";
export type RiskSeverity = "low" | "medium" | "high" | "critical";
export type MessageRole = "system" | "assistant" | "user";
export type MatchConfidence = "high" | "medium" | "low";
export type StaffRole = "super_admin" | "admin" | "manager" | "viewer";

// Service models
export interface ServiceDocument {
  name: string;
  description: string;
  is_required: boolean;
}

export interface ServiceLocation {
  id: string;
  service_id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip_code: string;
  latitude: number;
  longitude: number;
  phone: string;
  is_primary: boolean;
  hours: Record<string, string>;
  hours_verified?: boolean;
}

export interface Service {
  id: string;
  name: string;
  slug: string;
  provider_name: string;
  description: string;
  eligibility_summary: string;
  how_to_apply: string;
  cost: string;
  cost_type: CostType;
  website_url: string;
  phone: string;
  email: string;
  languages_offered: string[];
  accessibility_features: string[];
  status: ServiceStatus;
  categories: string[];
  locations: ServiceLocation[];
  documents: ServiceDocument[];
}

export interface ServiceCategory {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  color: string;
  service_count: number;
}

export interface LifeEvent {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  related_categories: string[];
}

// Intake / conversation models
export interface IntakeMessage {
  role: MessageRole;
  content: string;
  suggested_buttons: string[];
  progress_percent: number;
  is_complete: boolean;
  crisis_detected: boolean;
}

export interface ResidentProfile {
  age_range: string;
  household_size: number | null;
  zip_code: string;
  housing_situation: string;
  employment_status: string;
  income_bracket: string;
  insurance_status: string;
  has_children: boolean | null;
  veteran_status: boolean | null;
  has_disability: boolean | null;
  immediate_needs: string[];
  languages_spoken: string[];
  crisis_indicators: string[];
}

export interface RiskFlag {
  risk_type: string;
  severity: RiskSeverity;
  description: string;
  contributing_factors: string[];
  prevention_services: string[];
}

export interface ServiceMatch {
  service: Service;
  match_confidence: MatchConfidence;
  match_reasoning: string;
  match_score: number;
}

export interface IntakeSession {
  id: string;
  language: string;
  conversation: IntakeMessage[];
  extracted_profile: ResidentProfile;
  status: IntakeStatus;
  matches: ServiceMatch[];
  risk_flags: RiskFlag[];
  created_at: string;
}

// Map
export interface MapPin {
  id: string;
  service_id: string;
  name: string;
  category: string;
  latitude: number;
  longitude: number;
  open_now?: boolean | null;
  next_open?: string | null;
}

// Demo resident (admin)
export interface DemoResident {
  id: string;
  name: string;
  email: string;
  zip_code: string;
  language: string;
  household_size: number;
  profile: ResidentProfile;
  matched_services_count: number;
  saved_services: string[];
  signup_date: string;
  last_active: string;
}

// Analytics (admin)
export interface DailySessionCount {
  date: string;
  count: number;
}

export interface AnalyticsOverview {
  total_sessions: number;
  total_residents: number;
  total_services: number;
  avg_matches_per_session: number;
  completion_rate: number;
  crisis_detections: number;
  top_categories: Array<Record<string, unknown>>;
  daily_sessions: DailySessionCount[];
}

export interface DemographicBucket {
  label: string;
  count: number;
  percentage: number;
}

export interface DemographicsData {
  age_ranges: DemographicBucket[];
  household_sizes: DemographicBucket[];
  zip_codes: DemographicBucket[];
  employment_statuses: DemographicBucket[];
  housing_situations: DemographicBucket[];
  insurance_statuses: DemographicBucket[];
}

export interface ServiceDemandItem {
  service_name: string;
  category: string;
  match_count: number;
  trend: "up" | "down" | "stable";
}

export interface LanguageUsageItem {
  language_code: string;
  language_name: string;
  session_count: number;
  percentage: number;
}

export interface EquityBucket {
  label: string;
  portal_percentage: number;
  census_percentage: number;
  gap: number;
}

export interface EquityData {
  race_ethnicity: EquityBucket[];
  income_levels: EquityBucket[];
  geographic: EquityBucket[];
  language_access: EquityBucket[];
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  actor: string;
  action: string;
  resource_type: string;
  resource_id: string;
  details: string;
}

export interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: string;
  department: string;
  last_login: string;
  is_active: boolean;
}

export interface CrisisResource {
  name: string;
  description: string;
  phone: string;
  available_24_7: boolean;
  languages: string[];
}

export interface BenefitsBreakdownItem {
  service: string;
  monthly_value: number;
}

export interface BenefitsEstimate {
  total_monthly_value: number;
  total_annual_value: number;
  breakdown: BenefitsBreakdownItem[];
}

// Pagination
export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

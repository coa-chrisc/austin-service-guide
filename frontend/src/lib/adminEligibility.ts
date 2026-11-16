/**
 * Types for the admin eligibility API (backend/app/routers/admin_pack.py).
 * The three layers mirror what the matching engine evaluates:
 * per-service gates, the pack's matching_rules.yaml, and engine constants.
 */

import type { ResidentProfile, RiskFlag } from "@/types";

export type GateId =
  | "veteran"
  | "homeless_or_unstable_housing"
  | "refugee_or_immigrant"
  | "disability"
  | "older_adult"
  | "older_adult_or_disability"
  | "has_children"
  | "youth"
  | "other_criteria";

export interface GateInfo {
  id: GateId;
  label: string;
  satisfied_when: string;
  contradicted_when: string;
  /** Slugs of services that require this gate. */
  services: string[];
}

export interface EligibilityServiceRow {
  id: string;
  slug: string;
  name: string;
  status: "active" | "inactive" | "seasonal";
  categories: string[];
  eligibility_summary: string;
  eligibility_requires: GateId[];
  verified: boolean;
  /** Wording in an ungated summary that suggests a restriction (review only). */
  restrictive_words: string[];
}

export interface PreventionEntry {
  service?: string;
  text?: string;
}

export interface BenefitEstimate {
  services: string[];
  label: string;
  monthly_value: number;
  per_household_member?: boolean;
  only_if_uninsured?: boolean;
}

export interface MatchingRules {
  high_heat_zips: string[];
  crisis_services: Record<string, string[]>;
  prevention_services: Record<string, PreventionEntry[]>;
  benefit_estimates: BenefitEstimate[];
}

export interface EngineConstants {
  source: string;
  need_keywords: Record<string, string[]>;
  score_weights: Record<string, number>;
  low_income_brackets: string[];
  bands: Record<string, number>;
  max_matches: number;
  sequence_priority: Record<string, number>;
  sequence_reasons: Record<string, string>;
  default_sequence_reason: string;
  age_bands: Record<string, [number, number]>;
  default_free_value: number;
}

export interface PersonaPreset {
  id: string;
  label: string;
  language: string;
  profile: Partial<ResidentProfile>;
}

export interface EligibilityPayload {
  edit_mode: "in_memory" | "export_only";
  gates: GateInfo[];
  services: EligibilityServiceRow[];
  categories: { slug: string; name: string }[];
  matching_rules: MatchingRules;
  rules_edited: boolean;
  unresolved_slugs: { path: string; slug: string }[];
  engine: EngineConstants;
  personas: PersonaPreset[];
}

export interface EligibilityOverrides {
  services?: Record<string, { eligibility_requires: GateId[] }>;
  matching_rules?: MatchingRules;
}

export type Outcome =
  | "crisis_direct"
  | "matched"
  | "check_eligibility"
  | "over_cap"
  | "below_threshold"
  | "not_relevant"
  | "excluded_by_gate";

/** true: the profile meets the gate; false: rules it out; null: cannot tell. */
export type GateState = boolean | null;

export interface OutcomeRow {
  id: string;
  slug: string;
  name: string;
  categories: string[];
  outcome: Outcome;
  score: number | null;
  confidence: string | null;
  reasoning: string;
  gates: { gate: GateId; state: GateState }[];
}

export interface EvaluateResult {
  outcomes: OutcomeRow[];
  counts: Partial<Record<Outcome, number>>;
  risk_flags: RiskFlag[];
  benefits: {
    total_monthly_value: number;
    total_annual_value: number;
    breakdown: { service: string; monthly_value: number }[];
  };
}

export interface ImpactItem {
  slug: string;
  name: string;
  outcome?: Outcome;
  before?: Outcome;
  after?: Outcome;
}

export interface ImpactResult {
  personas: {
    persona_id: string;
    label: string;
    gained: ImpactItem[];
    lost: ImpactItem[];
    changed: ImpactItem[];
  }[];
}

/** Outcomes the resident would see on the results page. */
export const SHOWN_OUTCOMES: Outcome[] = ["crisis_direct", "matched", "check_eligibility"];

export const OUTCOME_LABEL: Record<Outcome, string> = {
  crisis_direct: "Crisis service (always shown)",
  matched: "Matched",
  check_eligibility: "Matched: check eligibility",
  over_cap: "Relevant, past the result limit",
  below_threshold: "Relevant, score too low",
  not_relevant: "No overlap with the needs",
  excluded_by_gate: "Excluded by a gate",
};

/* ------------------------------------------------------------------ */
/*  Plan steps vs. the rest of the matches                             */
/* ------------------------------------------------------------------ */
/*  A resident sees a short, ordered set of steps first; every other    */
/*  match sits in a collapsed "More services that may help" section,    */
/*  grouped by category. The service detail page steps through the      */
/*  plan steps only ("Step 2 of 5"), never through every match.         */

import type { IntakePlanItem, IntakeState, ServiceMatch } from "@/types";

/**
 * At most this many ordered steps. ≤5 matches working-memory limits for
 * residents in scarcity (Cowan 2001 ~4±1 chunks; Mullainathan & Shafir 2013).
 */
export const PLAN_STEP_CAP = 5;

/** The ordered steps the resident sees first. */
export function planSteps(items: IntakePlanItem[]): IntakePlanItem[] {
  return items.slice(0, PLAN_STEP_CAP);
}

/** Matches that are not plan steps, in their original (best-fit) order. */
export function otherMatches(
  matches: ServiceMatch[],
  steps: IntakePlanItem[],
): ServiceMatch[] {
  const stepIds = new Set(steps.map((s) => s.service_id));
  return matches.filter((m) => !stepIds.has(m.service.id));
}

/** Group matches by primary category, keeping first-seen category order. */
export function groupByCategory(
  matches: ServiceMatch[],
): [string, ServiceMatch[]][] {
  const groups = new Map<string, ServiceMatch[]>();
  for (const m of matches) {
    const cat = m.service.categories[0] || "other";
    const list = groups.get(cat);
    if (list) list.push(m);
    else groups.set(cat, [m]);
  }
  return Array.from(groups.entries());
}

/**
 * Best-fit order built from the matches alone, for when the plan request
 * itself fails (network error, timeout). Not a "what to do first" order:
 * callers say so.
 */
export function fallbackOrder(matches: ServiceMatch[]): IntakePlanItem[] {
  return [...matches]
    .sort((a, b) => b.match_score - a.match_score)
    .slice(0, PLAN_STEP_CAP)
    .map((m, i) => ({
      rank: i + 1,
      service_id: m.service.id,
      service_slug: m.service.slug,
      service_name: m.service.name,
      category: m.service.categories[0] || "other",
      reason: m.match_reasoning,
    }));
}

export type PlanNavigation =
  | {
      kind: "step";
      /** Zero-based position among the steps. */
      index: number;
      total: number;
      prevSlug: string | null;
      nextSlug: string | null;
    }
  | { kind: "other" };

/**
 * Where a service detail page sits in the resident's plan: one of the
 * ordered steps, another matched service, or not part of the plan (null).
 */
export function planNavigation(
  state: IntakeState | null,
  slug: string,
  serviceId: string | undefined,
): PlanNavigation | null {
  if (!state || state.status !== "completed") return null;
  const steps = planSteps(state.plan?.items ?? []).map((i) => i.service_slug);
  const index = steps.indexOf(slug);
  if (index !== -1) {
    return {
      kind: "step",
      index,
      total: steps.length,
      prevSlug: index > 0 ? steps[index - 1] : null,
      nextSlug: index < steps.length - 1 ? steps[index + 1] : null,
    };
  }
  if (serviceId && state.matched_service_ids.includes(serviceId)) {
    return { kind: "other" };
  }
  return null;
}

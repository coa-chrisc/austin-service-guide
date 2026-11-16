import { describe, expect, it } from "vitest";
import type { IntakePlanItem, IntakeState, ServiceMatch } from "@/types";
import {
  PLAN_STEP_CAP,
  fallbackOrder,
  groupByCategory,
  otherMatches,
  planNavigation,
  planSteps,
} from "./planSteps";

function match(id: string, category: string, score: number): ServiceMatch {
  return {
    service: { id, slug: `${id}-slug`, name: id.toUpperCase(), categories: [category] },
    match_confidence: "high",
    match_reasoning: `fits ${id}`,
    match_score: score,
  } as unknown as ServiceMatch;
}

function item(id: string, rank: number): IntakePlanItem {
  return {
    rank,
    service_id: id,
    service_slug: `${id}-slug`,
    service_name: id,
    category: "x",
    reason: "r",
  };
}

// 15 matches, like a scripted persona: the rules plan lists them all.
const matches = Array.from({ length: 15 }, (_, i) =>
  match(`s${i}`, i % 3 === 0 ? "food" : i % 3 === 1 ? "health" : "housing", 100 - i),
);
const fullPlan = [3, 0, 7, 1, 2, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14].map((n, i) =>
  item(`s${n}`, i + 1),
);

function state(over: Partial<IntakeState> = {}): IntakeState {
  return {
    version: 1,
    language: "en",
    status: "completed",
    conversation: [],
    profile: {} as IntakeState["profile"],
    entry_source: "",
    scripted_turns_skipped: 0,
    matched_service_ids: matches.map((m) => m.service.id),
    plan: { summary: "", items: fullPlan, ai_generated: false },
    ...over,
  };
}

describe("planSteps", () => {
  it("keeps only the first few ordered steps", () => {
    const steps = planSteps(fullPlan);
    expect(steps).toHaveLength(PLAN_STEP_CAP);
    expect(steps.map((s) => s.service_id)).toEqual(["s3", "s0", "s7", "s1", "s2"]);
  });

  it("puts every other match in the rest, so none is lost", () => {
    const steps = planSteps(fullPlan);
    const rest = otherMatches(matches, steps);
    expect(rest).toHaveLength(matches.length - steps.length);
    const all = new Set([...steps.map((s) => s.service_id), ...rest.map((m) => m.service.id)]);
    expect(all.size).toBe(matches.length);
  });

  it("groups the rest by primary category in first-seen order", () => {
    const groups = groupByCategory(otherMatches(matches, planSteps(fullPlan)));
    // The rest starts at s4 (health), then s5 (housing), then s6 (food).
    expect(groups.map(([cat]) => cat)).toEqual(["health", "housing", "food"]);
    expect(groups.reduce((n, [, ms]) => n + ms.length, 0)).toBe(10);
  });

  it("falls back to best-fit order when there is no plan", () => {
    const order = fallbackOrder([...matches].reverse());
    expect(order.map((o) => o.service_id)).toEqual(["s0", "s1", "s2", "s3", "s4"]);
    expect(order.map((o) => o.rank)).toEqual([1, 2, 3, 4, 5]);
    expect(order[0].reason).toBe("fits s0");
  });
});

describe("planNavigation", () => {
  it("labels a plan step and links only to its neighbouring steps", () => {
    expect(planNavigation(state(), "s0-slug", "s0")).toEqual({
      kind: "step",
      index: 1,
      total: 5,
      prevSlug: "s3-slug",
      nextSlug: "s7-slug",
    });
    const last = planNavigation(state(), "s2-slug", "s2");
    expect(last).toMatchObject({ index: 4, total: 5, nextSlug: null });
  });

  it("does not chain through matches beyond the steps", () => {
    expect(planNavigation(state(), "s14-slug", "s14")).toEqual({ kind: "other" });
  });

  it("treats every match as 'other' while the plan is not built", () => {
    expect(planNavigation(state({ plan: null }), "s0-slug", "s0")).toEqual({ kind: "other" });
  });

  it("is null outside a completed intake or for unmatched services", () => {
    expect(planNavigation(null, "s0-slug", "s0")).toBeNull();
    expect(planNavigation(state({ status: "in_progress" }), "s0-slug", "s0")).toBeNull();
    expect(planNavigation(state(), "zz-slug", "zz")).toBeNull();
  });
});

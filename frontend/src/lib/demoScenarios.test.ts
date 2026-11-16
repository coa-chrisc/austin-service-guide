import { describe, expect, it } from "vitest";
import { groupScenarios } from "./demoScenarios";
import { demoPersonaId } from "./session";
import type { PersonaSummary } from "./api";
import type { IntakeState } from "@/types";

const persona = (id: string, language: string): PersonaSummary => ({
  id,
  label: id,
  language,
  summary: "",
  shows: [],
});

describe("groupScenarios", () => {
  it("puts translated variants on their base card, in order", () => {
    const grouped = groupScenarios([
      persona("heat-outdoor-worker", "en"),
      persona("schools-anxious-student", "en"),
      persona("heat-outdoor-worker-vi", "vi"),
      persona("schools-anxious-student-es", "es"),
    ]);
    expect(grouped.map((s) => [s.base.id, s.variants.map((v) => v.id)])).toEqual([
      ["heat-outdoor-worker", ["heat-outdoor-worker-vi"]],
      ["schools-anxious-student", ["schools-anxious-student-es"]],
    ]);
  });

  it("gives a variant without its base a card of its own", () => {
    const grouped = groupScenarios([persona("refugee-food-ar", "ar")]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].base.id).toBe("refugee-food-ar");
  });

  it("does not treat an id that merely ends in a language code as a variant", () => {
    // "-en" suffix but the persona's language is es: not a variant.
    const grouped = groupScenarios([persona("x", "en"), persona("x-en", "es")]);
    expect(grouped.map((s) => s.base.id)).toEqual(["x", "x-en"]);
  });
});

describe("demoPersonaId", () => {
  const state = (entry_source: string) => ({ entry_source }) as IntakeState;

  it("reads the persona id from a launcher intake", () => {
    expect(demoPersonaId(state("persona:heat-outdoor-worker"))).toBe("heat-outdoor-worker");
  });

  it("is null for other intakes and no intake", () => {
    expect(demoPersonaId(state("life-event:lost-job"))).toBeNull();
    expect(demoPersonaId(state(""))).toBeNull();
    expect(demoPersonaId(null)).toBeNull();
  });
});

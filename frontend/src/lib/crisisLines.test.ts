import { describe, expect, it } from "vitest";
import type { CrisisResource } from "@/types";
import {
  NATIONAL_CRISIS_LINES,
  crisisLinesToSpeak,
  hasSafetyCrisis,
  mergeCrisisLines,
} from "./crisisLines";

const line = (
  name: string,
  phone: string,
  crisis_topic?: string,
): CrisisResource => ({
  name,
  description: "",
  phone,
  available_24_7: true,
  languages: ["en"],
  crisis_topic,
});

const PACK = [
  line("9-1-1 Emergency", "911"),
  line("2-1-1 Texas", "2-1-1"),
  line("Local crisis line", "512-472-4357", "mental_health"),
  line("988 Suicide & Crisis Lifeline", "988"),
  line("Local DV line", "512-267-7233", "domestic_violence"),
  line("National DV Hotline", "1-800-799-7233"),
];

describe("mergeCrisisLines", () => {
  it("is the national lines when nothing was fetched", () => {
    expect(mergeCrisisLines([])).toEqual(NATIONAL_CRISIS_LINES);
  });

  it("puts national, then local crisis, then other lines, without repeats", () => {
    expect(mergeCrisisLines(PACK).map((r) => r.phone)).toEqual([
      "911",
      "988",
      "1-800-799-7233",
      "512-472-4357",
      "512-267-7233",
      "2-1-1",
    ]);
  });

  it("treats numbers that differ only in punctuation as the same line", () => {
    const merged = mergeCrisisLines([line("Dup 988", "9-8-8")]);
    expect(merged).toEqual(NATIONAL_CRISIS_LINES);
  });
});

describe("crisisLinesToSpeak", () => {
  it("reads the national and local crisis lines, not general referrals", () => {
    expect(crisisLinesToSpeak(PACK).map((r) => r.phone)).toEqual([
      "911",
      "988",
      "1-800-799-7233",
      "512-472-4357",
      "512-267-7233",
    ]);
  });
});

describe("hasSafetyCrisis", () => {
  it("is true for any crisis kind except homelessness", () => {
    expect(hasSafetyCrisis({ crisis_indicators: ["suicidal_ideation"] })).toBe(true);
    expect(hasSafetyCrisis({ crisis_indicators: ["crisis_reported"] })).toBe(true);
    expect(hasSafetyCrisis({ crisis_indicators: ["homelessness"] })).toBe(false);
    expect(hasSafetyCrisis({ crisis_indicators: [] })).toBe(false);
    expect(hasSafetyCrisis(null)).toBe(false);
  });
});

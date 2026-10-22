import { describe, expect, it, vi } from "vitest";
import { scrubPII } from "./piiGuard";

// Place-name stopwords come from the city config, not from code. Mirrors
// test_place_stopwords_follow_the_city_config in backend/tests/test_pii.py.
vi.mock("@/hooks/useBrandConfig", async () => {
  const { readFileSync } = await import("node:fs");
  const url = new URL("../../../config/presets/cedar-ridge-county.json", import.meta.url);
  return { brandConfig: JSON.parse(readFileSync(url, "utf-8")) };
});

const CEDAR_RIDGE_CASES: Array<[string, string]> = [
  ["I'm Cedar Ridge Resident", "I'm Cedar Ridge Resident"],
  ["this is Oregon Coast", "this is Oregon Coast"],
  ["I'm Austin Lopez", "I'm [name removed]"],
  ["I'm Texas Born", "I'm [name removed]"],
  ["I'm Maria Lopez", "I'm [name removed]"],
];

describe("piiGuard place stopwords follow the city config", () => {
  it.each(CEDAR_RIDGE_CASES)("scrubPII: %j", (input, expected) => {
    expect(scrubPII(input).text).toBe(expected);
  });
});

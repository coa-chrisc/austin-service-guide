import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { inspectForPII, scrubPII } from "./piiGuard";

// __CITY_CONFIG__ is injected by the Vite build only. The shared fixture runs
// under the default config, the same file the backend tests read.
vi.mock("@/hooks/useBrandConfig", async () => {
  const { readFileSync: read } = await import("node:fs");
  const url = new URL("../../../config/city.config.json", import.meta.url);
  return { brandConfig: JSON.parse(read(url, "utf-8")) };
});

interface PiiCase {
  input: string;
  expected: string;
  kinds: string[];
}

const fixturePath = fileURLToPath(
  new URL("../../../backend/tests/fixtures/pii_cases.json", import.meta.url),
);
const cases: PiiCase[] = JSON.parse(readFileSync(fixturePath, "utf-8"));

describe("piiGuard matches the backend redactor", () => {
  it("loads the shared fixture", () => {
    expect(cases.length).toBeGreaterThan(50);
  });

  it.each(cases.map((c) => [c.input, c] as const))("scrubPII: %j", (_input, c) => {
    const result = scrubPII(c.input);
    expect(result.text).toBe(c.expected);
    expect(result.kinds).toEqual(c.kinds);
  });

  it.each(cases.map((c) => [c.input, c] as const))("inspectForPII: %j", (_input, c) => {
    const result = inspectForPII(c.input);
    expect(result.kinds).toEqual(c.kinds);
    expect(result.hasPII).toBe(c.kinds.length > 0);
  });
});

// Mirrors test_other_places_are_not_stopwords_under_the_default_config.
describe("piiGuard place stopwords under the default config", () => {
  it.each([
    ["I'm Cedar Ridge Resident", "I'm [name removed] Resident"],
    ["this is Oregon Coast", "this is [name removed]"],
    ["I'm Texas Born", "I'm Texas Born"],
  ])("scrubPII: %j", (input, expected) => {
    expect(scrubPII(input).text).toBe(expected);
  });
});

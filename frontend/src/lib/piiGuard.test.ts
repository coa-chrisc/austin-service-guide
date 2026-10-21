import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { inspectForPII, scrubPII } from "./piiGuard";

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

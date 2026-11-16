import { describe, expect, it } from "vitest";
import { categoryLabel } from "./categoryLabel";

describe("categoryLabel", () => {
  it("title-cases single-word slugs", () => {
    expect(categoryLabel("food")).toBe("Food");
  });
  it("turns underscores and hyphens into spaces", () => {
    expect(categoryLabel("smoking_cessation")).toBe("Smoking Cessation");
    expect(categoryLabel("mental-health")).toBe("Mental Health");
  });
});

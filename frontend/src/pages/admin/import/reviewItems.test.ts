import { describe, expect, it } from "vitest";

import type { Draft } from "./importApi";
import { exportPlan, problemsByKey } from "./reviewItems";

const draft = (key: string): Draft => ({
  key,
  service: { id: `svc-${key}`, slug: key, name: key, provider_name: "Org" },
  flags: [],
  suggestions: [],
  source_rows: [],
  grouped: false,
  provenance: { source: "upload", file_name: "list.csv", sheet: "CSV", row: 2, rows: [2] },
  duplicates: [],
  duplicate_in_file: [],
  errors: [],
  warnings: [],
});

describe("exportPlan", () => {
  it("exports only accepted and merged drafts, with edits applied", () => {
    const drafts = [draft("a"), draft("b"), draft("c"), draft("d")];
    const { items, keys } = exportPlan(
      drafts,
      { a: { action: "accept" }, b: { action: "reject" }, c: { action: "merge", target: "existing" } },
      { a: { id: "svc-a", slug: "a", name: "Edited", provider_name: "Org" } },
    );
    expect(keys).toEqual(["a", "c"]);
    expect(items[0].service.name).toBe("Edited");
    expect(items[0].merge_into).toBeNull();
    expect(items[1].merge_into).toBe("existing");
  });

  it("skips a merge with no target", () => {
    expect(exportPlan([draft("a")], { a: { action: "merge", target: "" } }, {}).items).toHaveLength(0);
  });

  it("maps server problems back to draft keys", () => {
    const out = problemsByKey(
      [
        { index: 1, slug: "c", errors: [{ path: "phone", code: "schema", message: "missing" }] },
        { index: null, slug: null, errors: [{ path: "", code: "match_cap", message: "too many" }] },
      ],
      ["a", "c"],
    );
    expect(out).toEqual({ c: ["phone: missing"], "": ["too many"] });
  });
});

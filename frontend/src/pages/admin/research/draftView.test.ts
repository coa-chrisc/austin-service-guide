import { describe, expect, it } from "vitest";
import {
  acceptBlockReason,
  capsFromForm,
  coverageView,
  evidenceAnchorId,
  evidenceRows,
  parseLines,
  rejectBlockReason,
  safeHttpUrl,
  stopReasonText,
} from "./draftView";
import type { DraftDetail, Job, JobCaps } from "@/lib/researchApi";

const source = (url: string) => ({
  url,
  title: "Page",
  quote: "Open Monday to Friday.",
  retrieved_at: "2026-11-15T10:00:00Z",
});

function detail(
  provenance: DraftDetail["provenance"],
  candidate: Record<string, unknown> = {
    name: "x",
    phone: "x",
    eligibility_summary: "x",
    locations: [],
  },
): Pick<DraftDetail, "candidate" | "provenance"> {
  return { candidate, provenance };
}

describe("evidenceRows", () => {
  it("gives a missing field its own entry with no sources", () => {
    const rows = evidenceRows(
      detail({
        fields: { name: [source("https://a.example/")] },
        missing: ["phone"],
        flags: [],
      }),
    );
    expect(rows.map((r) => r.field)).toEqual(["name", "phone"]);
    expect(rows[1]).toMatchObject({ field: "phone", missing: true, sources: [] });
    expect(rows[0].missing).toBe(false);
  });

  it("treats a field with an empty source list as missing", () => {
    const rows = evidenceRows(
      detail({ fields: { phone: [] }, missing: [], flags: [] }),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].missing).toBe(true);
  });

  it("lists a flagged field even without provenance and attaches its flags", () => {
    const rows = evidenceRows(
      detail({
        fields: {},
        missing: [],
        flags: [
          { field: "eligibility_summary", message: "Possible instruction text" },
          { field: "eligibility_summary", message: "Second flag" },
        ],
      }),
    );
    expect(rows).toEqual([
      expect.objectContaining({
        field: "eligibility_summary",
        missing: true,
        flags: ["Possible instruction text", "Second flag"],
      }),
    ]);
  });

  it("orders fields by the candidate's key order, nested paths numerically, unknown fields last", () => {
    const rows = evidenceRows(
      detail({
        fields: {
          "locations[10].address": [source("https://a.example/10")],
          "locations[2].address": [source("https://a.example/2")],
          zzz_unknown: [source("https://a.example/z")],
          name: [source("https://a.example/n")],
        },
        missing: ["eligibility_summary", "phone"],
        flags: [],
      }),
    );
    expect(rows.map((r) => r.field)).toEqual([
      "name",
      "phone",
      "eligibility_summary",
      "locations[2].address",
      "locations[10].address",
      "zzz_unknown",
    ]);
  });

  it("does not duplicate a field listed both with sources and as missing", () => {
    const rows = evidenceRows(
      detail({
        fields: { name: [source("https://a.example/")] },
        missing: ["name"],
        flags: [],
      }),
    );
    expect(rows).toHaveLength(1);
  });

  it("gives every row a unique, id-safe anchor", () => {
    const rows = evidenceRows(
      detail({
        fields: { "a.b": [source("https://a.example/")] },
        missing: ["a-b"],
        flags: [],
      }),
    );
    const ids = rows.map((r) => r.anchorId);
    expect(new Set(ids).size).toBe(2);
    for (const id of ids) expect(id).toMatch(/^evidence-\d+-[A-Za-z0-9_-]+$/);
    expect(evidenceAnchorId(0, "locations[0].address")).toBe(
      "evidence-0-locations-0-address",
    );
  });
});

describe("acceptBlockReason", () => {
  it("blocks accepting while the draft has validator errors", () => {
    expect(acceptBlockReason({ state: "pending", error_count: 1 }, false)).toBe(
      "Fix 1 validator error before accepting.",
    );
    expect(acceptBlockReason({ state: "pending", error_count: 3 }, false)).toBe(
      "Fix 3 validator errors before accepting.",
    );
  });

  it("blocks accepting with unsaved YAML edits", () => {
    expect(acceptBlockReason({ state: "pending", error_count: 0 }, true)).toBe(
      "Save your YAML changes before accepting.",
    );
  });

  it("blocks accepting an already accepted or merged draft", () => {
    expect(acceptBlockReason({ state: "accepted", error_count: 0 }, false)).toMatch(
      /already accepted/,
    );
    expect(acceptBlockReason({ state: "merged", error_count: 0 }, false)).toMatch(
      /already merged/,
    );
  });

  it("allows accepting a clean, saved pending draft", () => {
    expect(acceptBlockReason({ state: "pending", error_count: 0 }, false)).toBeNull();
  });

  it("does not let a rejected or merged draft be rejected again", () => {
    expect(rejectBlockReason({ state: "rejected" })).toMatch(/already rejected/);
    expect(rejectBlockReason({ state: "merged" })).toMatch(/already merged/);
    expect(rejectBlockReason({ state: "pending" })).toBeNull();
  });
});

describe("safeHttpUrl", () => {
  it("links only http and https URLs", () => {
    expect(safeHttpUrl("https://www.austintexas.gov/page")).toBe(
      "https://www.austintexas.gov/page",
    );
    expect(safeHttpUrl("http://example.org")).toBe("http://example.org/");
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("data:text/html,hi")).toBeNull();
    expect(safeHttpUrl("not a url")).toBeNull();
  });
});

const LIMITS: JobCaps = {
  max_steps: 40,
  max_searches: 20,
  max_pages: 60,
  max_pages_per_host: 8,
  max_cost_usd: 5,
  max_runtime_minutes: 30,
  max_drafts: 25,
};

const asForm = (caps: JobCaps) =>
  Object.fromEntries(
    Object.entries(caps).map(([k, v]) => [k, String(v)]),
  ) as Record<keyof JobCaps, string>;

describe("capsFromForm", () => {
  it("sends nothing when every cap is left at the configured value", () => {
    expect(capsFromForm(LIMITS, asForm(LIMITS))).toEqual({ caps: {}, errors: {} });
  });

  it("sends only lowered caps", () => {
    const form = { ...asForm(LIMITS), max_pages: "10", max_cost_usd: "1.5" };
    expect(capsFromForm(LIMITS, form)).toEqual({
      caps: { max_pages: 10, max_cost_usd: 1.5 },
      errors: {},
    });
  });

  it("refuses raising, zero, blank and fractional counts", () => {
    const form = {
      ...asForm(LIMITS),
      max_pages: "61",
      max_steps: "0",
      max_drafts: "",
      max_searches: "2.5",
    };
    const { caps, errors } = capsFromForm(LIMITS, form);
    expect(caps).toEqual({});
    expect(Object.keys(errors).sort()).toEqual(
      ["max_drafts", "max_pages", "max_searches", "max_steps"].sort(),
    );
    expect(errors.max_pages).toMatch(/only be lowered/);
  });
});

describe("coverageView", () => {
  it("lists requested categories with zero drafts instead of hiding them", () => {
    const view = coverageView(
      [
        { category: "food", level: "city", drafts: 2, full_evidence: 1 },
        { category: "housing", level: "county", drafts: 0, full_evidence: 0 },
      ],
      ["food", "housing", "legal"],
    );
    expect(view.rows.map((r) => `${r.category}/${r.level}/${r.drafts}`)).toEqual([
      "food/city/2",
      "housing/county/0",
      "legal/any/0",
    ]);
    expect(view.emptyCategories).toEqual(["housing", "legal"]);
  });
});

describe("stopReasonText and parseLines", () => {
  const job = { stop_reason: "max_pages", caps: LIMITS } as unknown as Job;

  it("names the cap that stopped the run", () => {
    expect(stopReasonText(job)).toBe("Stopped by cap: Max pages (60).");
    expect(stopReasonText({ ...job, stop_reason: "max_cost_usd" })).toBe(
      "Stopped by cap: Max cost (USD) ($5.00).",
    );
    expect(stopReasonText({ ...job, stop_reason: null })).toBeNull();
  });

  it("splits one entry per line and drops blanks", () => {
    expect(parseLines(" https://a.example \n\n\r\nb.example\n")).toEqual([
      "https://a.example",
      "b.example",
    ]);
  });
});

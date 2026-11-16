import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PROTECTIONS, SECTIONS, STATUS_LABELS } from "./content";
import { CHAT_TURN, DIAGRAMS_BY_SECTION, WHO_HOLDS_WHAT } from "./diagrams";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../..");

/** Every string the page shows from the content and diagram modules. */
function allCopy(): string[] {
  const diagramText = [CHAT_TURN, WHO_HOLDS_WHAT].flatMap((d) => [
    d.caption,
    ...d.lanes.flatMap((l) => [l.label, l.boundaryBefore ?? "", ...l.nodes.flatMap((n) => [n.title, n.detail])]),
  ]);
  return [
    ...SECTIONS.flatMap((s) => [s.title, s.summary, ...s.points, ...s.limits]),
    ...PROTECTIONS.map((p) => p.label),
    ...Object.values(STATUS_LABELS),
    ...diagramText,
  ];
}

// Claims the page must never make. Negations in ALLOWED are removed first.
const BANNED: RegExp[] = [
  /\bguarantee/i,
  /\bblocked\b/i,
  /\bHIPAA[ -]compliant/i,
  /\bverified catalog/i,
  /\bzero[ -]data[ -]retention/i,
];
const ALLOWED = [/\bnot zero[ -]data[ -]retention/gi, /\bno zero[ -]data[ -]retention/gi];

const hasBannedClaim = (text: string) =>
  BANNED.some((re) => re.test(ALLOWED.reduce((t, allowed) => t.replace(allowed, ""), text)));

describe("How it works content", () => {
  it("has the nine sections in the specified order, with the specified anchors", () => {
    expect(SECTIONS.map((s) => s.id)).toEqual([
      "what-this-is",
      "architecture",
      "ai-model",
      "pii",
      "stateless",
      "grounding",
      "crisis",
      "consistency",
      "security",
    ]);
  });

  it("gives every section a summary, points, limits and sources", () => {
    for (const s of SECTIONS) {
      expect(s.summary, s.id).not.toBe("");
      expect(s.points.length, s.id).toBeGreaterThan(0);
      expect(s.limits.length, s.id).toBeGreaterThan(0);
      expect(s.sources.length, s.id).toBeGreaterThan(0);
    }
  });

  it("cites only files that exist in the repository", () => {
    const missing = SECTIONS.flatMap((s) => s.sources.map((src) => `${s.id}: ${src}`)).filter(
      (entry) => !fs.existsSync(path.join(REPO_ROOT, entry.slice(entry.indexOf(": ") + 2))),
    );
    expect(missing).toEqual([]);
  });

  it("makes none of the banned claims", () => {
    expect(allCopy().filter(hasBannedClaim)).toEqual([]);
  });

  it("catches a banned claim and allows its negation (guard self-check)", () => {
    expect(hasBannedClaim("Covered by zero data retention.")).toBe(true);
    expect(hasBannedClaim("store=False is not zero data retention.")).toBe(false);
    expect(hasBannedClaim("Identifiers are blocked.")).toBe(true);
    expect(hasBannedClaim("A verified catalog.")).toBe(true);
    expect(hasBannedClaim("The catalog is unverified.")).toBe(false);
  });

  it("links every in-progress protection to its issue, and lists each protection once", () => {
    for (const p of PROTECTIONS) {
      if (p.status === "in_progress") expect(p.issue, p.label).toBeGreaterThan(0);
    }
    expect(new Set(PROTECTIONS.map((p) => p.label)).size).toBe(PROTECTIONS.length);
    expect(PROTECTIONS.filter((p) => p.status === "in_progress").map((p) => p.issue)).toEqual([
      26, 27, 28, 29, 30, 14,
    ]);
  });

  it("places each diagram in an existing section", () => {
    const ids = new Set(SECTIONS.map((s) => s.id));
    for (const id of Object.keys(DIAGRAMS_BY_SECTION)) expect(ids.has(id), id).toBe(true);
  });
});

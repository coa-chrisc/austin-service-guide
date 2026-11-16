import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PROTECTIONS, SAFETY_LAYERS, SECTIONS, STATUS_LABELS } from "./content";
import { CHAT_TURN, DIAGRAMS_BY_SECTION, RESEARCH_JOB, SYSTEM_MAP, WHO_HOLDS_WHAT } from "./diagrams";
import {
  CRISIS_LANGUAGES,
  CTA,
  HERO,
  JOURNEY,
  METRICS,
  METRICS_TITLE,
  ROADMAP,
  SAFETY,
  SCALE,
  TECHNICAL_TITLE,
  plainText,
} from "./infographicCopy";

const ROWS = [JOURNEY, SAFETY, SCALE];
const INFO_CARDS = ROWS.flatMap((r) => r.cards);
const IMAGE_CARDS = INFO_CARDS.flatMap((c) => ("image" in c ? [c] : []));

/** Every string the infographic shows, image alt text included. */
function infographicCopy(): string[] {
  return [
    HERO.title,
    HERO.subtitle,
    ...ROWS.flatMap((r) => [r.title, r.subtitle]),
    METRICS_TITLE,
    TECHNICAL_TITLE,
    ...Object.values(CTA),
    ...INFO_CARDS.flatMap((c) => [c.title, plainText(c.text), "alt" in c ? c.alt : ""]),
    ...METRICS.flatMap((m) => [m.value, m.spoken ?? "", m.label, m.text]),
    ROADMAP.title,
    ROADMAP.subtitle,
  ].filter(Boolean);
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../..");
const FRONTEND_SRC = path.resolve(HERE, "../..");

/** Every string the technical detail shows, from the content and diagram modules. The infographic is checked on its own. */
function technicalCopy(): string[] {
  const diagramText = [SYSTEM_MAP, CHAT_TURN, WHO_HOLDS_WHAT, RESEARCH_JOB].flatMap((d) => [
    d.caption,
    ...d.lanes.flatMap((l) => [l.label, l.boundaryBefore ?? "", ...l.nodes.flatMap((n) => [n.title, n.detail])]),
  ]);
  return [
    ...SAFETY_LAYERS.flatMap((l) => [l.title, l.text]),
    ...SECTIONS.flatMap((s) => [s.title, s.detailsLabel, s.limitsLabel, s.roadmap ?? "", s.summary, ...s.points, ...s.limits]),
    ...PROTECTIONS.map((p) => p.label),
    ...Object.values(STATUS_LABELS),
    ...diagramText,
  ];
}

// Claims the page must never make. Negations and the grant team's approved phrasings in ALLOWED are removed first.
const BANNED: RegExp[] = [
  /\bguarantee/i,
  /\bblocked\b/i,
  /\bHIPAA[ -]compliant/i,
  /\bverified catalog/i,
  /\bzero[ -]data[ -]retention/i,
  /\b100 ?%/,
  /\bleverag/i,
  /\bdelv(e|ing)\b/i,
];
const ALLOWED = [
  /\bnot zero[ -]data[ -]retention/gi,
  /\bno zero[ -]data[ -]retention/gi,
  /\bnot guaranteed\b/gi,
  // Zero data retention named as a comparison or as an agreement to sign, not as something in place.
  /\bvs\.? zero[ -]data[ -]retention/gi,
  /\bzero[ -]data[ -]retention (\(ZDR\) )?(or [\w/]+ )?(agreements?|contracts?)\b/gi,
  // Availability of the free parts (directory, crisis lines), not a claim about the catalog or security.
  /\b100 ?% (available|live)\b/gi,
  // A planned workflow, and the catalog's contact cards (records staff curate), not a claim that staff checked the catalog.
  /\bverified catalog (workflows|contact cards)\b/gi,
];

const hasBannedClaim = (text: string) =>
  BANNED.some((re) => re.test(ALLOWED.reduce((t, allowed) => t.replace(allowed, ""), text)));


describe("How it works content", () => {
  it("has the sections in the specified order, with the specified anchors", () => {
    expect(SECTIONS.map((s) => s.id)).toEqual([
      "what-this-is",
      "journey",
      "architecture",
      "scaling",
      "stateless",
      "pii",
      "ai-model",
      "safety",
      "crisis",
      "cost",
      "staff-tools",
      "research",
      "status",
    ]);
  });

  it("opens with the infographic rows: three journey steps, three safeguards, three scaling cards", () => {
    expect(JOURNEY.cards).toHaveLength(3);
    expect(SAFETY.cards).toHaveLength(3);
    expect(SCALE.cards).toHaveLength(3);
    expect(METRICS).toHaveLength(5);
  });

  it("gives every infographic picture alt text, and uses each picture once", () => {
    expect(IMAGE_CARDS.length).toBeGreaterThan(0);
    for (const card of IMAGE_CARDS) expect(card.alt.trim(), card.title).not.toBe("");
    expect(new Set(IMAGE_CARDS.map((c) => c.image)).size).toBe(IMAGE_CARDS.length);
    for (const card of INFO_CARDS) {
      expect(card.title.trim()).not.toBe("");
      expect(plainText(card.text).trim(), card.title).not.toBe("");
      // Italics markers come in pairs.
      expect((card.text.match(/\*/g) ?? []).length % 2, card.title).toBe(0);
    }
  });

  it("ships a WebP file for every infographic image, and no unused image", () => {
    const files = fs.readdirSync(path.join(HERE, "images")).filter((name) => name.endsWith(".webp"));
    expect(files.sort()).toEqual(IMAGE_CARDS.map((c) => `${c.image}.webp`).sort());
    for (const { image } of IMAGE_CARDS) {
      const file = path.join(HERE, "images", `${image}.webp`);
      expect(fs.existsSync(file), image).toBe(true);
      const head = fs.readFileSync(file).subarray(0, 12).toString("latin1");
      expect(head.slice(0, 4) + head.slice(8), image).toBe("RIFFWEBP");
    }
  });

  it("links every safety card to an existing section", () => {
    const ids = new Set(SECTIONS.map((s) => s.id));
    for (const l of SAFETY_LAYERS) if (l.section) expect(ids.has(l.section), l.title).toBe(true);
  });

  it("counts the crisis-check languages from the backend phrase lists", () => {
    const phrases = fs.readFileSync(path.join(REPO_ROOT, "backend/app/services/crisis_phrases.py"), "utf8");
    const block = phrases.slice(phrases.indexOf("PHRASES"));
    const languages = new Set([...block.matchAll(/^ {4}"([a-z]{2})": \{$/gm)].map((m) => m[1]));
    expect(languages.size).toBe(8);
    expect(CRISIS_LANGUAGES).toBe(languages.size);
    expect(METRICS.map((m) => m.value)).toContain(String(languages.size));
  });

  it("gives every number a label and a line of context", () => {
    for (const m of METRICS) {
      expect(m.label.trim(), m.value).not.toBe("");
      expect(m.text.trim(), m.value).not.toBe("");
    }
  });

  it("links related sections only to other existing sections", () => {
    const ids = new Set(SECTIONS.map((s) => s.id));
    for (const s of SECTIONS) {
      for (const id of s.related ?? []) {
        expect(ids.has(id), `${s.id} -> ${id}`).toBe(true);
        expect(id, s.id).not.toBe(s.id);
      }
    }
  });

  it("keeps every anchor that other pages link to", () => {
    const ids = new Set(SECTIONS.map((s) => s.id));
    const linked: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(entry.name)) {
          for (const m of fs.readFileSync(full, "utf8").matchAll(/\/how-it-works#([\w-]+)/g)) linked.push(m[1]);
        }
      }
    };
    walk(FRONTEND_SRC);
    expect(linked).toContain("pii");
    expect(linked.filter((id) => !ids.has(id))).toEqual([]);
  });

  it("gives every diagram a caption that says what it shows", () => {
    for (const [id, diagram] of Object.entries(DIAGRAMS_BY_SECTION)) {
      expect(diagram.caption, id).toMatch(/^Diagram [A-Z]\. \S.{20,}\.$/);
    }
  });

  it("states the research agent's caveats next to its claims", () => {
    const research = SECTIONS.find((s) => s.id === "research");
    const limits = research?.limits.join(" ") ?? "";
    expect(limits).toMatch(/Unverified draft export/);
    expect(limits).toMatch(/verification flags stripped/);
    expect(limits).toMatch(/never auto-publish/);
    expect(limits).toMatch(/one at a time/);
    expect(limits).toMatch(/robots\.txt times out or errors, page fetch proceeds/);
    expect(limits).toMatch(/estimation/);
    expect(limits).toMatch(/Disabled by default/);
    expect(research?.points.join(" ")).toMatch(/wiped blank and flagged for human inspection rather than guessed/);
    expect(DIAGRAMS_BY_SECTION.research).toBe(RESEARCH_JOB);
    expect(DIAGRAMS_BY_SECTION.architecture).toBe(SYSTEM_MAP);
    expect(DIAGRAMS_BY_SECTION["ai-model"]).toBe(CHAT_TURN);
    expect(DIAGRAMS_BY_SECTION.stateless).toBe(WHO_HOLDS_WHAT);
    expect(new Set(RESEARCH_JOB.lanes.map((l) => l.label)).size).toBe(RESEARCH_JOB.lanes.length);
  });

  it("gives every section a summary, points, limits and sources", () => {
    for (const s of SECTIONS) {
      expect(s.summary, s.id).not.toBe("");
      expect(s.points.length, s.id).toBeGreaterThan(0);
      expect(s.limits.length, s.id).toBeGreaterThan(0);
      expect(s.sources.length, s.id).toBeGreaterThan(0);
    }
  });

  it("gives every section its own heading and specific panel labels, never a bare Details or Limits", () => {
    const titles = SECTIONS.map((s) => s.title);
    expect(new Set(titles).size).toBe(titles.length);
    for (const key of ["detailsLabel", "limitsLabel"] as const) {
      const labels = SECTIONS.map((s) => s[key]);
      for (const [i, label] of labels.entries()) {
        const id = SECTIONS[i].id;
        expect(label?.trim(), `${id} ${key}`).toBeTruthy();
        expect(label, `${id} ${key}`).not.toMatch(/^\s*(details|limits)\s*(\(\d+\))?\s*$/i);
        expect(label.split(/\s+/).length, `${id} ${key}`).toBeGreaterThanOrEqual(3);
      }
      expect(new Set(labels).size, key).toBe(labels.length);
    }
  });

  it("labels every planned capability as a plan, never as something that runs today", () => {
    const planned = SECTIONS.filter((s) => s.roadmap != null);
    expect(planned.length).toBeGreaterThan(0);
    for (const s of planned) expect(s.roadmap?.trim(), s.id).toBeTruthy();
    // Each roadmap line is shown under its own "Where this is going" heading, apart from what runs today.
    expect(fs.readFileSync(path.join(HERE, "Section.tsx"), "utf8")).toMatch(/Where this is going/);
    expect(STATUS_LABELS.not_planned).toMatch(/^Phase 2 roadmap\b/);
  });

  it("names the Phase 2 roadmap in the infographic's closing bar", () => {
    expect(ROADMAP.subtitle).toMatch(/^Our Phase 2 Roadmap: \S/);
  });

  it("cites only files that exist in the repository", () => {
    const missing = SECTIONS.flatMap((s) => s.sources.map((src) => `${s.id}: ${src}`)).filter(
      (entry) => !fs.existsSync(path.join(REPO_ROOT, entry.slice(entry.indexOf(": ") + 2))),
    );
    expect(missing).toEqual([]);
  });

  it("makes none of the banned claims", () => {
    expect(technicalCopy().filter(hasBannedClaim)).toEqual([]);
  });

  it("keeps compliance claims out of the infographic copy", () => {
    const copy = infographicCopy();
    expect(copy.length).toBeGreaterThan(30);
    expect(copy.filter((text) => /\bHIPAA[ -]compliant/i.test(text))).toEqual([]);
  });

  it("catches a banned claim and allows its negation (guard self-check)", () => {
    expect(hasBannedClaim("Covered by zero data retention.")).toBe(true);
    expect(hasBannedClaim("store=False is not zero data retention.")).toBe(false);
    expect(hasBannedClaim("Identifiers are blocked.")).toBe(true);
    expect(hasBannedClaim("A verified catalog.")).toBe(true);
    expect(hasBannedClaim("The catalog is unverified.")).toBe(false);
    expect(hasBannedClaim("100% vetted catalog")).toBe(true);
    expect(hasBannedClaim("Scores 100 on accessibility.")).toBe(false);
    expect(hasBannedClaim("We leverage AI for a seamless experience.")).toBe(true);
    expect(hasBannedClaim("Let's delve in.")).toBe(true);
    expect(hasBannedClaim("Eligibility is guaranteed.")).toBe(true);
    expect(hasBannedClaim("Not guaranteed eligibility.")).toBe(false);
    expect(hasBannedClaim("Calls are covered by Zero Data Retention.")).toBe(true);
    expect(hasBannedClaim("store=False vs. Zero Data Retention (ZDR)")).toBe(false);
    expect(hasBannedClaim("after signing a Zero Data Retention or BAA/DPA contract")).toBe(false);
    expect(hasBannedClaim("Crisis lines stay 100% available.")).toBe(false);
    expect(hasBannedClaim("Answers are 100% accurate.")).toBe(true);
    expect(hasBannedClaim("Phase 2 delivers verified catalog workflows.")).toBe(false);
  });

  it("links every in-progress protection to its issue, and lists each protection once", () => {
    for (const p of PROTECTIONS) {
      if (p.status === "in_progress") expect(p.issue, p.label).toBeGreaterThan(0);
    }
    expect(new Set(PROTECTIONS.map((p) => p.label)).size).toBe(PROTECTIONS.length);
    expect(PROTECTIONS.filter((p) => p.status === "in_progress").map((p) => p.issue)).toEqual([
      28, 29, 30, 14,
    ]);
  });

  it("describes the research agent (#18) as in place with its limits stated", () => {
    const research = PROTECTIONS.filter((p) => p.issue === 18);
    expect(research).toHaveLength(1);
    expect(research[0].status).toBe("in_place");
    expect(research[0].label).toMatch(/on Railway/);
    expect(research[0].label).toMatch(/staff search-plan approval/);
    expect(research[0].label).toMatch(/manual Data Pack merge/);
    // The off-by-default caveat now lives in the research section's limits.
    expect(SECTIONS.find((s) => s.id === "research")?.limits.join(" ")).toMatch(/requires deploying the standalone worker service with an active OpenAI API key/i);
  });

  it("places each diagram in an existing section", () => {
    const ids = new Set(SECTIONS.map((s) => s.id));
    for (const id of Object.keys(DIAGRAMS_BY_SECTION)) expect(ids.has(id), id).toBe(true);
  });

  // a11yGuard.test.ts makes every heading-sized Typography name its element, so
  // the explicit h1-h6 tags in these files are the page's whole outline.
  it("has one h1 and heading levels that do not skip", () => {
    const files = [
      path.join(FRONTEND_SRC, "pages/HowItWorks.tsx"),
      ...fs
        .readdirSync(HERE)
        .filter((name) => name.endsWith(".tsx"))
        .map((name) => path.join(HERE, name)),
    ];
    const levels: number[] = [];
    const h1Files: string[] = [];
    for (const file of files) {
      const source = fs.readFileSync(file, "utf8");
      for (const m of source.matchAll(/component="h([1-6])"|<h([1-6])[\s>]/g)) {
        const level = Number(m[1] ?? m[2]);
        levels.push(level);
        if (level === 1) h1Files.push(path.basename(file));
      }
    }
    expect(h1Files).toEqual(["HowItWorks.tsx"]);
    const used = [...new Set(levels)].sort();
    expect(used).toEqual(used.map((_, i) => i + 1));
  });
});

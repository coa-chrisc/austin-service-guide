import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PROTECTIONS, SAFETY_LAYERS, SECTIONS, STATUS_LABELS } from "./content";
import { CHAT_TURN, DIAGRAMS_BY_SECTION, RESEARCH_JOB, SYSTEM_MAP, WHO_HOLDS_WHAT } from "./diagrams";
import {
  CITY_CARDS,
  CITY_TITLE,
  CRISIS_LANGUAGES,
  CTA,
  HERO,
  JOURNEY,
  JOURNEY_TITLE,
  METRICS,
  METRICS_NOTE,
  METRICS_TITLE,
  ROADMAP,
  SAFETY_CARDS,
  SAFETY_TITLE,
  TECHNICAL_TITLE,
} from "./infographicCopy";

const INFO_CARDS = [...JOURNEY, ...SAFETY_CARDS, ...CITY_CARDS];

/** Every string the infographic shows, image alt text included. */
function infographicCopy(): string[] {
  return [
    HERO.title,
    HERO.subtitle,
    JOURNEY_TITLE,
    SAFETY_TITLE,
    CITY_TITLE,
    METRICS_TITLE,
    METRICS_NOTE,
    TECHNICAL_TITLE,
    CTA.primary,
    CTA.secondary,
    ...INFO_CARDS.flatMap((c) => [c.title, c.text, c.alt]),
    ...METRICS.flatMap((m) => [m.value, m.spoken ?? "", m.label]),
    ROADMAP.title,
    ROADMAP.statusLabel,
    ROADMAP.note,
    ROADMAP.noteLink,
    ...ROADMAP.items,
  ];
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, "../../../..");
const FRONTEND_SRC = path.resolve(HERE, "../..");

/** Every string the page shows from the content and diagram modules. */
function allCopy(): string[] {
  const diagramText = [SYSTEM_MAP, CHAT_TURN, WHO_HOLDS_WHAT, RESEARCH_JOB].flatMap((d) => [
    d.caption,
    ...d.lanes.flatMap((l) => [l.label, l.boundaryBefore ?? "", ...l.nodes.flatMap((n) => [n.title, n.detail])]),
  ]);
  return [
    ...infographicCopy(),
    ...SAFETY_LAYERS.flatMap((l) => [l.title, l.text]),
    ...SECTIONS.flatMap((s) => [s.title, s.detailsLabel, s.limitsLabel, s.roadmap ?? "", s.summary, ...s.points, ...s.limits]),
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
  /\b100 ?%/,
  /\bleverag/i,
  /\bseamless/i,
  /\bdelv(e|ing)\b/i,
];
const ALLOWED = [/\bnot zero[ -]data[ -]retention/gi, /\bno zero[ -]data[ -]retention/gi];

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

  it("opens with the infographic rows: four journey steps, three safeguards, two any-city cards", () => {
    expect(JOURNEY.map((c) => c.title)).toEqual([
      "Ask in your own words",
      "Private by design",
      "Matched to real services",
      "Map and call",
    ]);
    expect(SAFETY_CARDS).toHaveLength(3);
    expect(CITY_CARDS).toHaveLength(2);
    expect(METRICS).toHaveLength(5);
  });

  it("keeps every infographic card to one or two short sentences, with alt text for its image", () => {
    for (const card of INFO_CARDS) {
      expect(card.text.split(/(?<=\.) /).length, card.title).toBeLessThanOrEqual(2);
      expect(card.text.length, card.title).toBeLessThanOrEqual(90);
      expect(card.title.split(/\s+/).length, card.title).toBeLessThanOrEqual(5);
      expect(card.alt.trim(), card.title).not.toBe("");
    }
    expect(new Set(INFO_CARDS.map((c) => c.image)).size).toBe(INFO_CARDS.length);
  });

  it("ships a WebP file for every infographic image", () => {
    for (const { image } of INFO_CARDS) {
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
    expect(CRISIS_LANGUAGES).toBe(languages.size);
    expect(METRICS.map((m) => m.value)).toContain(String(languages.size));
    expect(SAFETY_CARDS.find((c) => c.image === "safety-crisis")?.text).toContain(`${languages.size} languages`);
  });

  it("dates the measured numbers and says what measured them", () => {
    expect(METRICS_NOTE).toMatch(/^Lighthouse \d+(\.\d+)? mobile, production demo, \d{1,2} [A-Z][a-z]{2} \d{4}\.$/);
    for (const m of METRICS) expect(m.label.length, m.value).toBeLessThanOrEqual(40);
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
    expect(limits).toMatch(/Every draft is unverified/);
    expect(limits).toMatch(/by hand/);
    expect(limits).toMatch(/one at a time/);
    expect(limits).toMatch(/robots\.txt cannot be reached, the fetch goes ahead/);
    expect(limits).toMatch(/estimate/);
    expect(research?.points.join(" ")).toMatch(/left blank, not guessed/);
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
    for (const s of planned) expect(s.roadmap, s.id).toMatch(/^(Phase 2|Planned|The goal): \S/);
    expect(STATUS_LABELS.not_planned).toMatch(/^Phase 2 roadmap\b/);
    expect(SECTIONS.find((s) => s.id === "status")?.summary).toMatch(/None of the roadmap is built yet\./);
  });

  it("marks the infographic's roadmap items as planned and not built", () => {
    expect(ROADMAP.status).toBe("planned");
    expect(ROADMAP.statusLabel).toBe("Planned");
    expect(ROADMAP.title).toMatch(/^Phase 2 roadmap\b/);
    expect(ROADMAP.note).toBe("Not built yet.");
    expect(ROADMAP.items.length).toBeGreaterThan(0);
    // "Full list below": each item is also in the Phase 2 roadmap group of the status list.
    const roadmapList = PROTECTIONS.filter((p) => p.status === "not_planned").map((p) => p.label.toLowerCase());
    const keyPhrase: Record<string, RegExp> = {
      "A shared multi-city standard": /multi-city standard/,
      "Staff-checked catalog records": /staff checking each catalog record/,
      "211 and partner data updates": /211 and partner/,
      "Demand signals for health leaders": /demand signals for health leaders/,
    };
    for (const item of ROADMAP.items) {
      expect(keyPhrase[item], item).toBeDefined();
      expect(roadmapList.some((label) => keyPhrase[item].test(label)), item).toBe(true);
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

  it("keeps the banned words out of the infographic copy", () => {
    const copy = infographicCopy();
    expect(copy.length).toBeGreaterThan(30);
    expect(copy.filter(hasBannedClaim)).toEqual([]);
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
    expect(research[0].label).toMatch(/runs on Railway/);
    expect(research[0].label).toMatch(/off until an OpenAI key is set/);
    expect(research[0].label).toMatch(/approve each search plan/);
    expect(research[0].label).toMatch(/by hand/);
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

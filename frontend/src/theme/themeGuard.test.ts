// Fails on hard-coded colors outside the theme (port of Austin Health Pulse's
// guard). Scans frontend/src/**/*.{ts,tsx} except src/theme/** and test files.
// Use theme.palette.* (incl. palette.brand) instead. A line containing
// `theme-exempt: <reason>` is skipped, as are comment-only lines.
//
// themeGuard.baseline.json lists known leaks per file. The test fails when a
// file has more hits than its baseline, when an unlisted file has hits, and
// when a file has FEWER hits than its baseline (so the baseline shrinks as
// leaks are fixed). Regenerate it after fixing leaks with:
//   UPDATE_THEME_BASELINE=1 npx vitest run src/theme/themeGuard.test.ts
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const THEME_DIR = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.resolve(THEME_DIR, "..");
const BASELINE_PATH = path.join(THEME_DIR, "themeGuard.baseline.json");

/** CSS named colors that show up in UI code (not the full CSS list, which includes words like "tan"). */
const NAMED =
  "white|black|red|green|blue|yellow|orange|purple|pink|gray|grey|silver|gold|navy|teal|maroon|olive|lime|aqua|cyan|magenta|fuchsia|brown|indigo|violet|crimson|coral|salmon|tomato|beige|ivory|khaki|lavender|turquoise|whitesmoke|gainsboro|lightgray|lightgrey|darkgray|darkgrey|dimgray|dimgrey|lightblue|darkblue|lightgreen|darkgreen|darkred";

/** CSS properties that take a color, for "prop: white" inside style strings. */
const CSS_COLOR_PROPS = "color|background|background-color|border|border-[a-z-]+|outline|fill|stroke|box-shadow|text-shadow";

export const RULES: [name: string, pattern: RegExp][] = [
  ["hex literal", /["'`][^"'`\n]*#[0-9a-fA-F]{3,8}\b/],
  ["rgb/hsl/oklch", /\b(?:rgba?|hsla?|oklch)\(/],
  // "white" / 'black' as a whole string value (case-sensitive: "White" as a
  // label is copy), "color: white" inside a style string, or a border
  // shorthand such as "1px solid white".
  [
    "named color",
    new RegExp(
      `(["'\`])(?:${NAMED})\\1|["'\`][^"'\`\\n]*\\b(?:${CSS_COLOR_PROPS})\\s*:\\s*(?:${NAMED})\\b|\\b(?:solid|dashed|dotted|double)\\s+(?:${NAMED})\\b`,
    ),
  ],
  ["@mui/material/colors import", /["']@mui\/material\/colors(?:\/[^"']*)?["']/],
];

const EXEMPT = /theme-exempt:\s*\S/;
const COMMENT_LINE = /^\s*(?:\/\/|\/\*|\*)/;

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return full === THEME_DIR ? [] : sourceFiles(full);
    return /\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name) ? [full] : [];
  });
}

/** Rule names that match one line (empty for exempt and comment-only lines). */
export function lineHits(line: string): string[] {
  if (EXEMPT.test(line) || COMMENT_LINE.test(line)) return [];
  return RULES.filter(([, re]) => re.test(line)).map(([name]) => name);
}

function scan(): { counts: Record<string, number>; details: string[] } {
  const counts: Record<string, number> = {};
  const details: string[] = [];
  for (const file of sourceFiles(SRC_DIR).sort()) {
    const name = path.relative(path.resolve(SRC_DIR, ".."), file).split(path.sep).join("/");
    fs.readFileSync(file, "utf8")
      .split("\n")
      .forEach((line, i) => {
        for (const rule of lineHits(line)) {
          counts[name] = (counts[name] ?? 0) + 1;
          details.push(`${name}:${i + 1} ${rule}: ${line.trim()}`);
        }
      });
  }
  return { counts, details };
}

describe("theme guard", () => {
  it("scans src/ but not src/theme/ or tests", () => {
    const files = sourceFiles(SRC_DIR).map((f) => path.relative(SRC_DIR, f));
    expect(files).toContain(path.join("pages", "Landing.tsx"));
    expect(files.some((f) => f.startsWith("theme"))).toBe(false);
    expect(files.some((f) => f.includes(".test."))).toBe(false);
  });

  it("flags each rule and honours the exemption marker", () => {
    expect(lineHits('color: "#44499C",')).toEqual(["hex literal"]);
    expect(lineHits("bgcolor: '#fff'")).toEqual(["hex literal"]);
    expect(lineHits("border: `1px solid #ddd`")).toEqual(["hex literal"]);
    expect(lineHits("background: rgba(0, 0, 0, 0.5)")).toEqual(["rgb/hsl/oklch"]);
    expect(lineHits("color: hsl(210, 50%, 40%)")).toEqual(["rgb/hsl/oklch"]);
    expect(lineHits("color: oklch(0.7 0.1 200)")).toEqual(["rgb/hsl/oklch"]);
    expect(lineHits('color: "white",')).toEqual(["named color"]);
    expect(lineHits("<Box sx={{ color: 'black' }} />")).toEqual(["named color"]);
    expect(lineHits('style="color: red"')).toEqual(["named color"]);
    expect(lineHits('border: "1px solid white"')).toEqual(["named color"]);
    expect(lineHits('import { red } from "@mui/material/colors";')).toEqual(["@mui/material/colors import"]);
    expect(lineHits('import blue from "@mui/material/colors/blue";')).toEqual(["@mui/material/colors import"]);
    // Theme-driven code and ordinary strings pass.
    expect(lineHits('color: "primary.main", bgcolor: "background.paper"')).toEqual([]);
    expect(lineHits("color: theme.palette.brand.onBrand")).toEqual([]);
    expect(lineHits('<Button color="error" variant="contained">')).toEqual([]);
    expect(lineHits('navigate("#/results")')).toEqual([]);
    expect(lineHits('label: "Whitelist the green card office"')).toEqual([]);
    expect(lineHits('"Black-owned business directory"')).toEqual([]);
    expect(lineHits('title: "Note: green card holders qualify"')).toEqual([]);
    expect(lineHits('options: ["White", "Black", "Asian"]')).toEqual([]);
    // Exemption marker and comment-only lines.
    expect(lineHits('fill: "#000", // theme-exempt: Leaflet marker shadow')).toEqual([]);
    expect(lineHits('// was "#44499C"')).toEqual([]);
    expect(lineHits(' * color: "white"')).toEqual([]);
    expect(EXEMPT.test("theme-exempt:")).toBe(false);
  });

  it("matches the baseline exactly (no new leaks; shrink the baseline as leaks are fixed)", () => {
    const { counts, details } = scan();
    if (process.env.UPDATE_THEME_BASELINE) {
      const sorted = Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
      fs.writeFileSync(BASELINE_PATH, JSON.stringify(sorted, null, 2) + "\n");
    }
    const baseline: Record<string, number> = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
    const problems: string[] = [];
    for (const file of new Set([...Object.keys(counts), ...Object.keys(baseline)])) {
      const now = counts[file] ?? 0;
      const allowed = baseline[file] ?? 0;
      if (now > allowed) {
        problems.push(
          `${file}: ${now} hard-coded color(s), baseline ${allowed}. Use theme.palette.* instead:\n` +
            details.filter((d) => d.startsWith(`${file}:`)).map((d) => `    ${d}`).join("\n"),
        );
      } else if (now < allowed) {
        problems.push(`${file}: ${now} hit(s), baseline ${allowed}. Lower themeGuard.baseline.json to ${now} (remove the entry at 0).`);
      }
    }
    expect(problems).toEqual([]);
  });
});

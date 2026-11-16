// Static accessibility guard for the resident pages (Lighthouse/axe findings
// from issue #49). Scans the JSX source, so it needs no DOM:
//
// - Every MUI <Select> has an accessible name: `labelId` pointing at its
//   InputLabel, or an aria-label through inputProps / SelectDisplayProps.
//   Without one the combobox div has no name (axe aria-input-field-name).
// - Every <Typography> with a heading-sized variant (h1-h6, subtitle1/2) sets
//   `component`. MUI maps the variant to a tag by default (subtitle1 -> h6,
//   h4 -> h4), which is how the pages ended up with no h1 and skipped levels
//   (axe heading-order). Choose the level (or "p"/"span") on purpose.
//
// Staff pages (admin/**) are out of scope.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKIP = [/^pages\/admin\//, /^components\/layout\/AdminLayout\.tsx$/];

function residentFiles(dir = SRC_DIR): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return residentFiles(full);
    const rel = path.relative(SRC_DIR, full).split(path.sep).join("/");
    return entry.name.endsWith(".tsx") && !SKIP.some((re) => re.test(rel)) ? [rel] : [];
  });
}

/** The opening tag text of each `<Name ...>` element (brace- and string-aware, so `=>` does not end it). */
export function openingTags(source: string, name: string): { line: number; text: string }[] {
  const tags: { line: number; text: string }[] = [];
  const start = new RegExp(`<${name}(?![\\w.])`, "g");
  let match: RegExpExecArray | null;
  while ((match = start.exec(source))) {
    let depth = 0;
    let quote: string | null = null;
    let i = match.index + match[0].length;
    for (; i < source.length; i++) {
      const ch = source[i];
      if (quote) {
        if (ch === quote && source[i - 1] !== "\\") quote = null;
      } else if (ch === '"' || ch === "'" || ch === "`") {
        quote = ch;
      } else if (ch === "{") {
        depth++;
      } else if (ch === "}") {
        depth--;
      } else if (ch === ">" && depth === 0) {
        break;
      }
    }
    tags.push({ line: source.slice(0, match.index).split("\n").length, text: source.slice(match.index, i + 1) });
  }
  return tags;
}

const HEADING_VARIANT = /\bvariant="(h[1-6]|subtitle[12])"/;
const SELECT_NAMED = /\blabelId=|aria-label(?:ledby)?\b/;

describe("a11y guard", () => {
  const files = residentFiles();

  it("scans the resident pages", () => {
    expect(files).toContain("pages/ServiceDirectory.tsx");
    expect(files).toContain("components/services/ServiceCard.tsx");
  });

  it("every Select has an accessible name", () => {
    const unnamed = files.flatMap((rel) =>
      openingTags(fs.readFileSync(path.join(SRC_DIR, rel), "utf8"), "Select")
        .filter((tag) => !SELECT_NAMED.test(tag.text))
        .map((tag) => `${rel}:${tag.line}`),
    );
    expect(unnamed).toEqual([]);
  });

  it("every heading-sized Typography sets its element with component", () => {
    const implicit = files.flatMap((rel) =>
      openingTags(fs.readFileSync(path.join(SRC_DIR, rel), "utf8"), "Typography")
        .filter((tag) => HEADING_VARIANT.test(tag.text) && !/\bcomponent=/.test(tag.text))
        .map((tag) => `${rel}:${tag.line} ${tag.text.match(HEADING_VARIANT)![1]}`),
    );
    expect(implicit).toEqual([]);
  });

  it("finds tags whose props contain arrow functions", () => {
    const src = `<Select\n  value={v}\n  onChange={(e) => set(e.target.value)}\n  labelId="x"\n>\n<Typography variant="h6">`;
    expect(openingTags(src, "Select")).toEqual([
      { line: 1, text: `<Select\n  value={v}\n  onChange={(e) => set(e.target.value)}\n  labelId="x"\n>` },
    ]);
    expect(openingTags(src, "Typography")[0].line).toBe(6);
  });
});

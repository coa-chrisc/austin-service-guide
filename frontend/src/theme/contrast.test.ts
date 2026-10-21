import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { CityConfig, ThemeColors } from "./cityConfig";
import {
  AA,
  checkPreset,
  contrastRatio,
  deriveDarkColors,
  mixHex,
  primaryShades,
  resolveTextOn,
  textCandidates,
} from "./contrast";

const PRESETS_DIR = path.resolve(__dirname, "../../../config/presets");
const readPreset = (id: string): CityConfig =>
  JSON.parse(fs.readFileSync(path.join(PRESETS_DIR, `${id}.json`), "utf8"));
const presetIds = fs.readdirSync(PRESETS_DIR).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""));
const lower = (colors: Iterable<string>) => new Set([...colors].map((c) => c.toLowerCase()));

describe("WCAG math", () => {
  it("matches the reference ratios", () => {
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#777777")).toBeCloseTo(1, 5);
    expect(contrastRatio("#ffffff", "#767676")).toBeCloseTo(4.54, 2);
    // Order does not matter.
    expect(contrastRatio("#009F4D", "#1a1a1a")).toBe(contrastRatio("#1a1a1a", "#009F4D"));
  });

  it("mixes linearly in RGB", () => {
    expect(mixHex("#000000", "#ffffff", 0)).toBe("#000000");
    expect(mixHex("#000000", "#ffffff", 1)).toBe("#ffffff");
    expect(mixHex("#000000", "#ffffff", 0.5)).toBe("#808080");
  });
});

describe("resolveTextOn", () => {
  const candidates = [
    { role: "onBrand", color: "#ffffff" },
    { role: "body", color: "#1a1a1a" },
  ];

  it("keeps the first candidate when it passes", () => {
    const choice = resolveTextOn("#44499C", candidates);
    expect(choice).toMatchObject({ role: "onBrand", ok: true });
  });

  it("swaps to the next passing candidate", () => {
    const choice = resolveTextOn("#009F4D", candidates);
    expect(choice).toMatchObject({ role: "body", color: "#1a1a1a", ok: true });
    expect(choice.first.ratio.toFixed(2)).toBe("3.46");
  });

  it("reports the best candidate when none passes", () => {
    const choice = resolveTextOn("#808080", candidates);
    expect(choice.ok).toBe(false);
    expect(choice.ratio).toBeLessThan(AA);
  });
});

describe("Austin preset", () => {
  const austin = readPreset("austin-travis-tx");
  const { errors, swaps } = checkPreset(austin);
  const lightSwap = (role: string) => swaps.find((s) => s.mode === "light" && s.roles.includes(role));

  it("passes with no errors", () => {
    expect(errors).toEqual([]);
  });

  it.each([
    ["accent", "#009F4D", "3.46", "5.03"],
    ["negative", "#F83125", "3.85", "4.52"],
    ["warning", "#FF8F00", "2.29", "7.61"],
  ])("swaps text on %s %s from onBrand %s to body #1a1a1a %s", (role, fill, from, to) => {
    const swap = lightSwap(role);
    expect(swap).toBeDefined();
    expect(swap!.fill).toBe(fill);
    expect(swap!.from).toMatchObject({ role: "onBrand", color: "#ffffff" });
    expect(swap!.from.ratio.toFixed(2)).toBe(from);
    expect(swap!.to).toMatchObject({ role: "body", color: "#1a1a1a" });
    expect(swap!.to.ratio.toFixed(2)).toBe(to);
  });

  it("logs swaps in the plan's format", () => {
    // Category colors that share the fill are listed too, after the roles.
    const message = lightSwap("accent")!.message;
    expect(message).toMatch(/^text on accent\/positiveFill\/series\[1\]/);
    expect(message).toMatch(/ #009F4D: onBrand 3\.46 -> body #1a1a1a 5\.03$/);
  });

  it("keeps primary and ink text on onBrand", () => {
    expect(lightSwap("primary")).toBeUndefined();
    expect(lightSwap("ink")).toBeUndefined();
  });

  it("keeps every explicit dark color unchanged", () => {
    const explicit = austin.serviceGuide!.darkColors!;
    const dark = deriveDarkColors(austin.theme.colors, explicit);
    for (const [key, value] of Object.entries(explicit)) {
      expect(dark[key as keyof ThemeColors]).toBe(value);
    }
  });
});

describe("failing presets", () => {
  const austin = readPreset("austin-travis-tx");
  const withColors = (colors: Partial<ThemeColors>, dark?: Partial<ThemeColors>): CityConfig => ({
    ...austin,
    theme: { ...austin.theme, colors: { ...austin.theme.colors, ...colors } },
    serviceGuide: { ...austin.serviceGuide, darkColors: dark ?? austin.serviceGuide!.darkColors },
  });

  it("errors when no preset color reads on a fill", () => {
    const { errors } = checkPreset(withColors({ primary: "#808080" }));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^text on primary #808080: no preset color reaches 4\.5:1 \(best /);
  });

  it("errors when body text is too light for the page", () => {
    const { errors } = checkPreset(withColors({ body: "#999999" }));
    expect(errors.some((e) => e.startsWith("body #999999 on page #f7f6f5 is"))).toBe(true);
  });

  it("errors on a dark-mode pair and names the dark block", () => {
    const { errors } = checkPreset(withColors({}, { ...austin.serviceGuide!.darkColors, muted: "#333333" }));
    expect(errors.some((e) => e.startsWith("[dark] muted #333333 on") && e.includes("serviceGuide.darkColors"))).toBe(true);
  });

  it("errors when primary's text does not read on ink", () => {
    const { errors } = checkPreset(withColors({ ink: "#8b8fd4" }));
    expect(errors.some((e) => e.startsWith("text on primary #ffffff on ink #8b8fd4 (primary.dark"))).toBe(true);
  });

  it("errors when positive text is too light", () => {
    const { errors } = checkPreset(withColors({ positive: "#7fd8a6" }));
    expect(errors.some((e) => e.startsWith("positive #7fd8a6 on surface"))).toBe(true);
  });
});

describe("swaps never invent colors", () => {
  it.each(presetIds)("%s: every swap target is a preset color (derived dark colors excepted)", (id) => {
    const preset = readPreset(id);
    const light = preset.theme.colors;
    const dark = deriveDarkColors(light, preset.serviceGuide?.darkColors);
    const lightSet = lower(Object.values(light));
    const darkSet = lower([...Object.values(light), ...Object.values(dark)]);
    for (const swap of checkPreset(preset).swaps) {
      const allowed = swap.mode === "light" ? lightSet : darkSet;
      expect(allowed.has(swap.to.color.toLowerCase()), swap.message).toBe(true);
    }
  });

  it("resolveTextOn only returns a candidate, for any fill", () => {
    const colors = readPreset("austin-travis-tx").theme.colors;
    const candidates = textCandidates(colors);
    const allowed = lower(candidates.map((c) => c.color));
    let seed = 7;
    const next = () => (seed = (seed * 48271) % 2147483647) / 2147483647;
    for (let i = 0; i < 500; i++) {
      const fill = `#${[0, 0, 0].map(() => Math.floor(next() * 256).toString(16).padStart(2, "0")).join("")}`;
      expect(allowed.has(resolveTextOn(fill, candidates).color.toLowerCase())).toBe(true);
    }
  });
});

describe("primaryShades", () => {
  it.each(presetIds)("%s: primary's text reads on primary.dark and every hero stop, both modes", (id) => {
    const preset = readPreset(id);
    const light = preset.theme.colors;
    const modes: [ThemeColors, ThemeColors | undefined][] = [
      [light, undefined],
      [deriveDarkColors(light, preset.serviceGuide?.darkColors), light],
    ];
    for (const [colors, fallback] of modes) {
      const text = resolveTextOn(colors.primary, textCandidates(colors, fallback)).color;
      const { dark, hero } = primaryShades(colors, text);
      for (const stop of [dark, ...hero]) {
        expect(contrastRatio(text, stop), `${text} on ${stop}`).toBeGreaterThanOrEqual(AA);
      }
    }
  });

  it("keeps Austin's light ink and MUI's default secondary.dark as-is", () => {
    const colors = readPreset("austin-travis-tx").theme.colors;
    const { dark, hero } = primaryShades(colors, "#ffffff");
    expect(dark).toBe(colors.ink);
    expect(hero).toEqual([colors.primary, colors.ink, mixHex(colors.accent, "#000000", 0.3)]);
  });
});

describe("deriveDarkColors", () => {
  it.each(presetIds)("%s without darkColors derives a passing dark mode", (id) => {
    const preset = readPreset(id);
    const bare: CityConfig = { ...preset, serviceGuide: { ...preset.serviceGuide, darkColors: undefined } };
    expect(checkPreset(bare).errors).toEqual([]);
    const dark = deriveDarkColors(preset.theme.colors);
    for (const text of [dark.body, dark.muted, dark.primary, dark.accent, dark.positive, dark.negative]) {
      expect(contrastRatio(text, dark.page)).toBeGreaterThanOrEqual(AA);
      expect(contrastRatio(text, dark.surface)).toBeGreaterThanOrEqual(AA);
    }
  });

  it("keeps a brand color as-is when it already reads on the dark surface", () => {
    const colors = readPreset("austin-travis-tx").theme.colors;
    const dark = deriveDarkColors({ ...colors, accent: "#4dd68f" });
    expect(dark.accent).toBe("#4dd68f");
  });
});

// WCAG contrast checks for a city config. Pure: imported by the Vite plugin
// (build-time gate) and by brandTheme.ts (MUI contrastText), so both pick the
// same text colors.
//
// Policy: brand colors are never changed. When the preset's onBrand text does
// not reach 4.5:1 on a fill, the text color is swapped to another color from
// the same preset (onBrand, body, ink, surface, page, first that passes). If
// none passes, checkPreset() reports an error and the build fails. Only
// derived dark-mode colors (deriveDarkColors) may be new colors.
import type { CityConfig, ThemeColorKey, ThemeColors } from "./cityConfig";

/** WCAG 2.x AA minimum for normal-size text. */
export const AA = 4.5;

/** Text color candidates for a fill, in preference order. */
export const TEXT_ON_FILL_ROLES = ["onBrand", "body", "ink", "surface", "page"] as const satisfies readonly ThemeColorKey[];

export interface Candidate {
  role: string;
  color: string;
}

export interface TextChoice extends Candidate {
  ratio: number;
  /** True when `ratio` reaches the minimum. */
  ok: boolean;
  /** The first candidate and its ratio (what was swapped away from, if anything). */
  first: Candidate & { ratio: number };
}

export interface Swap {
  mode: "light" | "dark";
  /** Roles sharing this fill, e.g. ["accent", "positiveFill", "series[2]"]. */
  roles: string[];
  fill: string;
  from: Candidate & { ratio: number };
  to: Candidate & { ratio: number };
  message: string;
}

export interface PresetCheck {
  errors: string[];
  swaps: Swap[];
}

const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const toHex = (n: number) => n.toString(16).padStart(2, "0");

/** WCAG 2 relative luminance of a "#rrggbb" color. */
export function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two "#rrggbb" colors (1 to 21). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Linear RGB mix of two "#rrggbb" colors; t = 0 gives a, t = 1 gives b. */
export function mixHex(a: string, b: string, t: number): string {
  const f = Math.max(0, Math.min(1, t));
  const ca = channels(a);
  const cb = channels(b);
  return `#${ca.map((c, i) => toHex(Math.round(c + (cb[i] - c) * f))).join("")}`;
}

/**
 * The preset's own text-on-fill candidates, in policy order. Dark mode passes
 * the light roles as `fallback`: they are preset colors too, tried after the
 * dark ones (a fill such as a series color is the same in both modes).
 */
export function textCandidates(colors: ThemeColors, fallback?: ThemeColors): Candidate[] {
  const list: Candidate[] = TEXT_ON_FILL_ROLES.map((role) => ({ role, color: colors[role] }));
  if (fallback) list.push(...TEXT_ON_FILL_ROLES.map((role) => ({ role: `light ${role}`, color: fallback[role] })));
  const seen = new Set<string>();
  return list.filter(({ color }) => {
    const key = color.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * First candidate that reaches `min` against `fill`. When none does, returns
 * the best one with ok = false.
 */
export function resolveTextOn(fill: string, candidates: readonly Candidate[], min = AA): TextChoice {
  const rated = candidates.map((c) => ({ ...c, ratio: contrastRatio(c.color, fill) }));
  const first = rated[0];
  const pass = rated.find((c) => c.ratio >= min);
  if (pass) return { ...pass, ok: true, first };
  const best = rated.reduce((a, b) => (b.ratio > a.ratio ? b : a));
  return { ...best, ok: false, first };
}

const WHITE = "#ffffff";
const BLACK = "#000000";

/** `color` if it reaches AA as text on every background, else the smallest mix toward white that does. */
function ensureText(color: string, backgrounds: readonly string[]): string {
  const passes = (c: string) => backgrounds.every((bg) => contrastRatio(c, bg) >= AA);
  for (let step = 0; step <= 100; step++) {
    const candidate = mixHex(color, WHITE, step / 100);
    if (passes(candidate)) return candidate;
  }
  return WHITE;
}

/**
 * Complete dark-mode roles: explicit `dark` values win; missing ones are
 * derived from the light roles. Backgrounds come from ink mixed toward black,
 * text from light neutrals, and primary/accent/positive/negative stay the
 * preset color when it already reads as text on the dark backgrounds, else the
 * minimum tint toward white that does.
 */
export function deriveDarkColors(light: ThemeColors, dark: Partial<ThemeColors> = {}): ThemeColors {
  const page = dark.page ?? mixHex(light.ink, BLACK, 0.6);
  const surface = dark.surface ?? mixHex(light.ink, BLACK, 0.45);
  const bgs = [page, surface];
  const body = dark.body ?? ensureText(light.page, bgs);
  // An explicit dark surface keeps its own hue for the subtle track.
  const subtle = dark.subtle ?? (dark.surface ? mixHex(surface, body, 0.08) : mixHex(light.ink, BLACK, 0.3));
  const primary = dark.primary ?? ensureText(light.primary, bgs);
  const accent = dark.accent ?? ensureText(light.accent, bgs);
  return {
    primary,
    primarySoft: dark.primarySoft ?? mixHex(primary, surface, 0.8),
    accent,
    accentSoft: dark.accentSoft ?? mixHex(accent, surface, 0.8),
    ink: dark.ink ?? light.ink,
    onBrand: dark.onBrand ?? light.onBrand,
    page,
    surface,
    subtle,
    body,
    muted: dark.muted ?? ensureText(light.line, bgs),
    line: dark.line ?? mixHex(body, surface, 0.8),
    noData: dark.noData ?? mixHex(body, surface, 0.7),
    positive: dark.positive ?? ensureText(light.positive, bgs),
    positiveFill: dark.positiveFill ?? light.positiveFill,
    negative: dark.negative ?? ensureText(light.negative, bgs),
    warning: dark.warning ?? light.warning,
    scrim: dark.scrim ?? light.scrim,
  };
}

/** Fill colors that carry text, labelled by role. info = series[3] (else primary), as in brandTheme. */
function textFills(colors: ThemeColors, series: readonly string[], categoryColors: Record<string, string>) {
  const fills: [label: string, color: string][] = [
    ["primary", colors.primary],
    ["accent", colors.accent],
    ["ink", colors.ink],
    ["positiveFill", colors.positiveFill],
    ["negative", colors.negative],
    ["warning", colors.warning],
    ["info", series[3] ?? colors.primary],
    ...series.map((c, i): [string, string] => [`series[${i}]`, c]),
    ...Object.entries(categoryColors).map(([slug, c]): [string, string] => [`category ${slug}`, c]),
  ];
  // Group roles that share a fill so each swap is logged once.
  const byColor = new Map<string, { color: string; roles: string[] }>();
  for (const [label, color] of fills) {
    const key = color.toLowerCase();
    const entry = byColor.get(key) ?? { color, roles: [] };
    entry.roles.push(label);
    byColor.set(key, entry);
  }
  return [...byColor.values()];
}

const fmt = (n: number) => n.toFixed(2);

/**
 * Checks every text pair of a preset in light and dark mode.
 * - Text on fills: resolved with resolveTextOn; a change from onBrand is a swap,
 *   no passing candidate is an error.
 * - negative as text on surface: same resolution starting from negative itself
 *   (the value becomes palette.brand.negativeText).
 * - body and muted on page and surface, positive on surface: must pass as-is.
 */
export function checkPreset(config: CityConfig): PresetCheck {
  const errors: string[] = [];
  const swaps: Swap[] = [];
  const { series } = config.theme;
  const categoryColors = config.serviceGuide?.categoryColors ?? {};
  const modes: ["light" | "dark", ThemeColors][] = [
    ["light", config.theme.colors],
    ["dark", deriveDarkColors(config.theme.colors, config.serviceGuide?.darkColors)],
  ];

  for (const [mode, colors] of modes) {
    const tag = mode === "dark" ? "[dark] " : "";
    const candidates = textCandidates(colors, mode === "dark" ? config.theme.colors : undefined);

    const resolve = (roles: string[], fill: string, cands: Candidate[], what: string) => {
      const choice = resolveTextOn(fill, cands);
      if (!choice.ok) {
        errors.push(
          `${tag}${what} ${roles.join("/")} ${fill}: no preset color reaches ${AA}:1 ` +
            `(best ${choice.role} ${choice.color} ${fmt(choice.ratio)}). Change the fill or add a text color that contrasts with it.`,
        );
      } else if (choice.role !== choice.first.role) {
        swaps.push({
          mode,
          roles,
          fill,
          from: choice.first,
          to: { role: choice.role, color: choice.color, ratio: choice.ratio },
          message:
            `${tag}${what} ${roles.join("/")} ${fill}: ${choice.first.role} ${fmt(choice.first.ratio)} -> ` +
            `${choice.role} ${choice.color} ${fmt(choice.ratio)}`,
        });
      }
    };

    for (const { color, roles } of textFills(colors, series, categoryColors)) {
      resolve(roles, color, candidates, "text on");
    }
    resolve(
      ["surface"],
      colors.surface,
      [{ role: "negative", color: colors.negative }, ...candidates],
      "negative text on",
    );

    const fixed: [fg: ThemeColorKey, bg: ThemeColorKey][] = [
      ["body", "page"],
      ["body", "surface"],
      ["muted", "page"],
      ["muted", "surface"],
      ["positive", "surface"],
    ];
    for (const [fg, bg] of fixed) {
      const ratio = contrastRatio(colors[fg], colors[bg]);
      if (ratio < AA) {
        errors.push(
          `${tag}${fg} ${colors[fg]} on ${bg} ${colors[bg]} is ${fmt(ratio)}:1, below ${AA}:1. ` +
            `Change one of the two colors${mode === "dark" ? " (serviceGuide.darkColors)" : ""}.`,
        );
      }
    }
  }
  return { errors, swaps };
}

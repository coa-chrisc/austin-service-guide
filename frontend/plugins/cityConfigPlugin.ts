// Build-time city config: selection, schema validation, contrast gate, logo,
// favicon and font bundling. vite.config.ts calls loadCityConfig() once and
// passes the result to cityConfigPlugin() and the PWA manifest.
//
// Selection (relative to config/):
//   CITY_CONFIG=presets/<id>.json   (same variable as Austin Health Pulse)
//   CITY_PRESET=<id>                (alias for presets/<id>.json)
//   neither                         -> city.config.json
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import type { Plugin } from "vite";
import { checkPreset, resolveTextOn, textCandidates, type Swap } from "../src/theme/contrast";
import {
  HEALTH_PULSE_ONLY_KEYS,
  resolveServiceGuide,
  type CityConfig,
  type ResolvedCityConfig,
} from "../src/theme/cityConfig";

const here = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_ROOT = path.resolve(here, "..");
export const REPO_ROOT = path.resolve(FRONTEND_ROOT, "..");
export const CONFIG_DIR = path.join(REPO_ROOT, "config");
export const SCHEMA_PATH = path.join(CONFIG_DIR, "city.config.schema.json");

/**
 * Data pack categories file, resolved like backend/app/services/data_pack.py:
 * CITY_DATA_DIR unset -> backend/app/data; absolute -> as-is; relative -> under config/.
 */
export function categoriesPath(env: Record<string, string | undefined> = process.env): string {
  const raw = env.CITY_DATA_DIR?.trim();
  const dir = !raw
    ? path.join(REPO_ROOT, "backend/app/data")
    : path.isAbsolute(raw)
      ? raw
      : path.resolve(CONFIG_DIR, raw);
  return path.join(dir, "categories.yaml");
}
export const CATEGORIES_PATH = categoriesPath();

const FONT_WEIGHTS = [400, 500, 600, 700];
const FONTS_ID = "virtual:theme-fonts";
const RESOLVED_FONTS_ID = "\0" + FONTS_ID;
/** Public path of the logo in the built app (fixed name so the PWA manifest can point at it). */
const LOGO_BASENAME = "brand/logo";

const PREFIX = "[city-config]";

export class CityConfigError extends Error {}

const readJson = (file: string) => JSON.parse(fs.readFileSync(file, "utf8"));

/** Ajv 2020 validator for config/city.config.schema.json. Returns readable error lines. */
export function schemaErrors(config: unknown): string[] {
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(readJson(SCHEMA_PATH));
  if (validate(config)) return [];
  return (validate.errors ?? []).map((e) => {
    const extra =
      e.keyword === "additionalProperties"
        ? ` (${(e.params as { additionalProperty: string }).additionalProperty})`
        : e.keyword === "enum"
          ? ` (${JSON.stringify((e.params as { allowedValues: unknown[] }).allowedValues)})`
          : "";
    return `${e.instancePath || "(root)"} ${e.message}${extra}`;
  });
}

export function listPresets(): string[] {
  const dir = path.join(CONFIG_DIR, "presets");
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => f.replace(/\.json$/, ""))
    .sort();
}

/** Config file chosen by CITY_CONFIG / CITY_PRESET, relative to config/. Empty values count as unset. */
export function selectConfig(env: Record<string, string | undefined> = process.env): string {
  const configVar = env.CITY_CONFIG?.trim();
  const presetVar = env.CITY_PRESET?.trim();
  const presets = listPresets();
  const available = `Available: ${presets.map((p) => `CITY_PRESET=${p} (CITY_CONFIG=presets/${p}.json)`).join(", ")}; unset both for config/city.config.json.`;
  if (configVar) {
    const abs = path.resolve(CONFIG_DIR, configVar);
    if (!abs.startsWith(CONFIG_DIR + path.sep) || !abs.endsWith(".json") || !fs.existsSync(abs)) {
      throw new CityConfigError(`${PREFIX} CITY_CONFIG="${configVar}" is not a .json file under config/. ${available}`);
    }
    return path.relative(CONFIG_DIR, abs);
  }
  if (presetVar) {
    if (!presets.includes(presetVar)) {
      throw new CityConfigError(`${PREFIX} Unknown CITY_PRESET "${presetVar}". ${available}`);
    }
    return `presets/${presetVar}.json`;
  }
  return "city.config.json";
}

/**
 * Category slugs in file order. categories.yaml is a flat list of maps, so a
 * line match on `slug:` is enough and avoids a YAML dependency.
 */
export function readCategorySlugs(file = categoriesPath()): string[] {
  if (!fs.existsSync(file)) {
    throw new CityConfigError(`${PREFIX} ${path.relative(REPO_ROOT, file)} not found (category order for palette.brand.category).`);
  }
  const text = fs.readFileSync(file, "utf8");
  return [...text.matchAll(/^\s*-?\s*slug:\s*["']?([A-Za-z0-9_-]+)["']?\s*$/gm)].map((m) => m[1]);
}

/** Family name registered by an installed @fontsource package, or an error line. */
function fontFamilyOf(pkg: string): { family?: string; error?: string } {
  for (const w of FONT_WEIGHTS) {
    const file = path.join(FRONTEND_ROOT, "node_modules", pkg, `${w}.css`);
    if (!fs.existsSync(file)) {
      return { error: `font package ${pkg} is not installed or lacks weight ${w} (missing ${path.relative(REPO_ROOT, file)}). Run \`npm install ${pkg}\` in frontend/.` };
    }
  }
  const css = fs.readFileSync(path.join(FRONTEND_ROOT, "node_modules", pkg, "400.css"), "utf8");
  const family = /font-family:\s*['"]([^'"]+)['"]/.exec(css)?.[1];
  return family ? { family } : { error: `cannot read the font-family name from ${pkg}/400.css` };
}

const quoteFamily = (f: string) => `"${f}"`;

export interface LoadedCityConfig {
  configRel: string;
  configPath: string;
  config: ResolvedCityConfig;
  swaps: Swap[];
  /** Absolute logo file, or null when a tile is generated. */
  logoFile: string | null;
  logoExt: "svg" | "png" | "webp";
  fontPackages: string[];
}

/**
 * Reads, validates and resolves one config. Every problem is collected and
 * thrown together as a CityConfigError, so a single build run lists them all.
 */
export function loadCityConfig(configRel = selectConfig()): LoadedCityConfig {
  const configPath = path.resolve(CONFIG_DIR, configRel);
  let raw: Record<string, unknown>;
  try {
    raw = readJson(configPath);
  } catch (err) {
    throw new CityConfigError(`${PREFIX} cannot read config/${configRel}: ${(err as Error).message}`);
  }
  const fail = (lines: string[]) =>
    new CityConfigError(`${PREFIX} config/${configRel} is invalid:\n${lines.map((l) => `  - ${l}`).join("\n")}`);

  const schemaLines = schemaErrors(raw);
  if (schemaLines.length) throw fail(schemaLines.map((l) => `schema: ${l}`));

  const config = raw as unknown as CityConfig;
  const errors: string[] = [];

  const logoRel = config.brand.logoUrl;
  const logoFile = logoRel ? path.resolve(CONFIG_DIR, logoRel) : null;
  if (logoFile && !fs.existsSync(logoFile)) errors.push(`brand.logoUrl file not found: config/${logoRel}`);

  const { typography } = config.theme;
  const extraPackages = config.serviceGuide?.extraFontPackages ?? [];
  const families: string[] = [];
  for (const pkg of [typography.fontPackage, ...extraPackages]) {
    const { family, error } = fontFamilyOf(pkg);
    if (error) errors.push(error);
    else if (pkg === typography.fontPackage && family !== typography.family) {
      errors.push(`theme.typography.family is "${typography.family}" but ${pkg} registers "${family}"`);
    } else if (family && pkg !== typography.fontPackage) families.push(family);
  }

  let categorySlugs: string[] = [];
  try {
    categorySlugs = readCategorySlugs();
  } catch (err) {
    errors.push((err as Error).message);
  }
  const unknownSlugs = Object.keys(config.serviceGuide?.categoryColors ?? {}).filter(
    (s) => categorySlugs.length && !categorySlugs.includes(s),
  );
  if (unknownSlugs.length) {
    errors.push(`serviceGuide.categoryColors has unknown categories ${unknownSlugs.join(", ")} (known: ${categorySlugs.join(", ")})`);
  }

  const check = checkPreset(config);
  errors.push(...check.errors.map((e) => `contrast: ${e}`));
  if (errors.length) throw fail(errors);

  const shared = Object.fromEntries(
    Object.entries(raw).filter(
      ([k]) => k !== "$schema" && k !== "serviceGuide" && !(HEALTH_PULSE_ONLY_KEYS as readonly string[]).includes(k),
    ),
  ) as Omit<CityConfig, "serviceGuide">;
  const logoExt = (logoFile ? path.extname(logoFile).slice(1).toLowerCase() : "svg") as LoadedCityConfig["logoExt"];

  return {
    configRel,
    configPath,
    swaps: check.swaps,
    logoFile,
    logoExt,
    fontPackages: [typography.fontPackage, ...extraPackages],
    config: {
      ...shared,
      serviceGuide: resolveServiceGuide(config),
      logoSrc: `/${LOGO_BASENAME}.${logoExt}`,
      fontStack: [typography.family, ...families].map(quoteFamily).concat(typography.fallback).join(", "),
      categorySlugs,
    },
  };
}

const escapeHtml = (v: string) => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/** Generated favicon: rounded square in the accent color with a plus in onBrand (as in Health Pulse). */
export function faviconSvg({ accent, onBrand }: { accent: string; onBrand: string }): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">` +
    `<rect width="32" height="32" rx="7" fill="${accent}"/>` +
    `<path d="M13 7h6v6h6v6h-6v6h-6v-6H7v-6h6z" fill="${onBrand}"/></svg>`
  );
}

/**
 * Logo tile for brand.logoUrl = null: accent fill with agency.shortName
 * initials in onBrand, or the contrast-resolved preset text color when
 * onBrand is below 4.5:1 on accent.
 */
export function logoTileSvg(config: ResolvedCityConfig): string {
  const { colors } = config.theme;
  const { accent } = colors;
  const onBrand = resolveTextOn(accent, textCandidates(colors)).color;
  const initials = escapeHtml(config.agency.shortName.replace(/[^A-Za-z0-9]/g, "").slice(0, 3).toUpperCase());
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img">` +
    `<rect width="64" height="64" rx="12" fill="${accent}"/>` +
    `<text x="32" y="41" text-anchor="middle" font-family="${escapeHtml(config.fontStack)}" ` +
    `font-size="${initials.length > 2 ? 20 : 26}" font-weight="700" fill="${onBrand}">${initials}</text></svg>`
  );
}

function logoBytes(loaded: LoadedCityConfig): Buffer {
  return loaded.logoFile ? fs.readFileSync(loaded.logoFile) : Buffer.from(logoTileSvg(loaded.config));
}

const MIME = { svg: "image/svg+xml", png: "image/png", webp: "image/webp" } as const;

export function logSwaps(loaded: LoadedCityConfig, log: (msg: string) => void = console.info): void {
  log(`${PREFIX} using config/${loaded.configRel} (${loaded.config.id})`);
  for (const swap of loaded.swaps) log(`${PREFIX} contrast swap: ${swap.message}`);
}

/**
 * Serves `virtual:theme-fonts` (the @fontsource CSS for weights 400-700 of
 * every configured package), emits the logo at a fixed public path, and
 * fills index.html placeholders plus the generated favicon.
 */
export default function cityConfigPlugin(loaded: LoadedCityConfig): Plugin {
  const { config } = loaded;
  const logoPath = config.logoSrc.replace(/^\//, "");
  return {
    name: "city-config",
    resolveId(id) {
      return id === FONTS_ID ? RESOLVED_FONTS_ID : null;
    },
    load(id) {
      if (id !== RESOLVED_FONTS_ID) return null;
      return loaded.fontPackages
        .flatMap((pkg) => FONT_WEIGHTS.map((w) => `import ${JSON.stringify(`${pkg}/${w}.css`)};`))
        .join("\n");
    },
    transformIndexHtml(html) {
      const favicon = faviconSvg(config.theme.colors);
      return html
        .replaceAll("%APP_NAME%", escapeHtml(config.appName))
        .replaceAll("%APP_DESCRIPTION%", escapeHtml(config.serviceGuide.description))
        .replace(
          "</head>",
          `  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,${encodeURIComponent(favicon)}" />\n  </head>`,
        );
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: logoPath, source: logoBytes(loaded) });
    },
    configureServer(server) {
      server.middlewares.use(config.logoSrc, (_req, res) => {
        res.setHeader("Content-Type", MIME[loaded.logoExt]);
        res.end(logoBytes(loaded));
      });
      // The config is read when vite.config.ts loads; restart so edits apply.
      const watched = [loaded.configPath, SCHEMA_PATH, ...(loaded.logoFile ? [loaded.logoFile] : [])];
      server.watcher.add(watched);
      server.watcher.on("change", (file) => {
        if (watched.includes(file)) void server.restart();
      });
    },
  };
}

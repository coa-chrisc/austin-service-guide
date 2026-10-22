// Parity between config/city.config.schema.json, the TypeScript CityConfig
// type and every preset, plus the build-time loader and Health Pulse
// compatibility.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CONFIG_DIR,
  CityConfigError,
  listPresets,
  loadCityConfig,
  categoriesPath,
  readCategorySlugs,
  schemaErrors,
  selectConfig,
} from "../../plugins/cityConfigPlugin";
import {
  HEALTH_PULSE_ONLY_KEYS,
  THEME_COLOR_KEYS,
  categoryColor,
  resolveServiceGuide,
  type CityConfig,
} from "./cityConfig";

const readJson = (file: string) => JSON.parse(fs.readFileSync(file, "utf8"));
const schema = readJson(path.join(CONFIG_DIR, "city.config.schema.json"));
const presetFiles = listPresets().map((id) => `presets/${id}.json`);
const allConfigs = ["city.config.json", ...presetFiles];
const sorted = (keys: Iterable<string>) => [...keys].sort();

const SHARED_KEYS = ["$schema", "id", "appName", "agency", "region", "brand", "theme", "map"];
const HP_FIXTURE = path.join(__dirname, "__fixtures__/health-pulse.city.config.json");
const HP_DIR = process.env.HEALTH_PULSE_DIR ?? path.resolve(CONFIG_DIR, "../../austin-health-pulse");
const HP_CONFIG = path.join(HP_DIR, "config/city.config.json");
const HP_SCHEMA = path.join(HP_DIR, "config/city.config.schema.json");

describe("schema <-> type <-> presets parity", () => {
  const colors = schema.properties.theme.properties.colors;

  it("theme.colors: schema required == schema properties == THEME_COLOR_KEYS (same order)", () => {
    expect(colors.required).toEqual([...THEME_COLOR_KEYS]);
    expect(Object.keys(colors.properties)).toEqual([...THEME_COLOR_KEYS]);
  });

  it("serviceGuide.darkColors has the same role keys, all optional", () => {
    const dark = schema.properties.serviceGuide.properties.darkColors;
    expect(Object.keys(dark.properties)).toEqual([...THEME_COLOR_KEYS]);
    expect(dark.required).toBeUndefined();
    expect(dark.additionalProperties).toBe(false);
  });

  it.each(allConfigs)("%s has exactly the 18 color roles", (rel) => {
    const config = readJson(path.join(CONFIG_DIR, rel));
    expect(sorted(Object.keys(config.theme.colors))).toEqual(sorted(THEME_COLOR_KEYS));
  });

  it("top-level keys are shared core + Health Pulse-only + serviceGuide", () => {
    expect(sorted(Object.keys(schema.properties))).toEqual(
      sorted([...SHARED_KEYS, ...HEALTH_PULSE_ONLY_KEYS, "serviceGuide"]),
    );
    expect(schema.additionalProperties).toBe(false);
  });

  it("config/city.config.json is the austin-travis-tx preset", () => {
    const { $schema: _a, ...active } = readJson(path.join(CONFIG_DIR, "city.config.json"));
    const { $schema: _b, ...austin } = readJson(path.join(CONFIG_DIR, "presets/austin-travis-tx.json"));
    expect(active).toEqual(austin);
  });
});

describe("Health Pulse compatibility", () => {
  it("validates the checked-in Health Pulse config fixture unchanged", () => {
    expect(schemaErrors(readJson(HP_FIXTURE))).toEqual([]);
  });

  it("loads the fixture end to end and drops Health Pulse-only keys", () => {
    const { config } = loadCityConfig(HP_FIXTURE);
    for (const key of HEALTH_PULSE_ONLY_KEYS) expect(config).not.toHaveProperty(key);
    expect(config.logoSrc).toBe("/brand/logo.svg"); // logoUrl null -> generated tile
    expect(config.serviceGuide.shortName).toBe("APH");
  });

  it.skipIf(!fs.existsSync(HP_CONFIG))("validates the live Health Pulse configs (sibling repo or HEALTH_PULSE_DIR)", () => {
    const presetsDir = path.join(HP_DIR, "config/presets");
    const files = [HP_CONFIG, ...fs.readdirSync(presetsDir).filter((f) => f.endsWith(".json")).map((f) => path.join(presetsDir, f))];
    for (const file of files) expect(schemaErrors(readJson(file)), file).toEqual([]);
  });

  it.skipIf(!fs.existsSync(HP_SCHEMA))("shares Health Pulse's core definitions verbatim", () => {
    const hp = readJson(HP_SCHEMA);
    for (const key of SHARED_KEYS) expect(schema.properties[key], key).toEqual(hp.properties[key]);
    for (const def of ["hex", "rem", "length"]) expect(schema.$defs[def]).toEqual(hp.$defs[def]);
  });
});

describe("loader", () => {
  it.each(allConfigs)("%s loads (schema, logo, fonts, contrast)", (rel) => {
    const loaded = loadCityConfig(rel);
    expect(loaded.config.fontStack).toContain(`"${loaded.config.theme.typography.family}"`);
    expect(Object.keys(loaded.config.serviceGuide.darkColors)).toHaveLength(THEME_COLOR_KEYS.length);
  });

  it("Austin font stack includes the extra Noto Sans package", () => {
    expect(loadCityConfig("presets/austin-travis-tx.json").config.fontStack).toBe(
      '"Geist", "Noto Sans", Helvetica, Aptos, sans-serif',
    );
  });

  it("selects configs from CITY_CONFIG / CITY_PRESET", () => {
    expect(selectConfig({})).toBe("city.config.json");
    expect(selectConfig({ CITY_PRESET: "", CITY_CONFIG: " " })).toBe("city.config.json");
    expect(selectConfig({ CITY_PRESET: "bchc-demo-city" })).toBe("presets/bchc-demo-city.json");
    expect(selectConfig({ CITY_CONFIG: "presets/austin-travis-tx.json" })).toBe("presets/austin-travis-tx.json");
    expect(() => selectConfig({ CITY_PRESET: "nope" })).toThrow(/Unknown CITY_PRESET "nope".*austin-travis-tx.*bchc-demo-city/);
    expect(() => selectConfig({ CITY_CONFIG: "../frontend/package.json" })).toThrow(CityConfigError);
  });

  it("lists every problem in one error", () => {
    const base = readJson(path.join(CONFIG_DIR, "presets/austin-travis-tx.json")) as CityConfig;
    const broken = {
      ...base,
      brand: { logoUrl: "brand/missing/logo.svg" },
      theme: {
        ...base.theme,
        colors: { ...base.theme.colors, primary: "#808080" },
        typography: { ...base.theme.typography, fontPackage: "@fontsource/not-installed-font" },
      },
      serviceGuide: { ...base.serviceGuide, categoryColors: { "not-a-category": "#44499C" } },
    };
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "city-config-")), "broken.json");
    fs.writeFileSync(file, JSON.stringify(broken));
    let message = "";
    try {
      loadCityConfig(file);
    } catch (err) {
      expect(err).toBeInstanceOf(CityConfigError);
      message = (err as Error).message;
    }
    expect(message).toContain("brand.logoUrl file not found: config/brand/missing/logo.svg");
    expect(message).toContain("@fontsource/not-installed-font is not installed");
    expect(message).toContain("unknown categories not-a-category");
    expect(message).toContain("contrast: text on primary #808080");
  });

  it("reports schema errors with their paths", () => {
    const errors = schemaErrors({ id: "Bad Id", serviceGuide: { nope: 1 } });
    expect(errors).toContain("/id must match pattern \"^[a-z0-9-]+$\"");
    expect(errors).toContain("/serviceGuide must NOT have additional properties (nope)");
    expect(errors).toContain("(root) must have required property 'theme'");
  });
});

describe("serviceGuide defaults and categories", () => {
  const austin = readJson(path.join(CONFIG_DIR, "presets/austin-travis-tx.json")) as CityConfig;

  it("fills every default from the shared keys when serviceGuide is absent", () => {
    const sg = resolveServiceGuide({ ...austin, serviceGuide: undefined });
    expect(sg.shortName).toBe("APH");
    expect(sg.description).toContain("Austin");
    expect(sg.copy.footerDisclaimer).toBe("Austin Public Health | City of Austin");
    expect(sg.pwa).toEqual({ themeColor: "#44499C", backgroundColor: "#f7f6f5" });
    expect(Object.keys(sg.darkColors)).toEqual([...THEME_COLOR_KEYS]);
  });

  it("reads category order from categories.yaml", () => {
    const slugs = readCategorySlugs();
    expect(slugs[0]).toBe("healthcare");
    expect(slugs).toContain("smoking_cessation");
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("resolves the categories file like the backend data pack", () => {
    expect(categoriesPath({})).toMatch(/backend[\\/]app[\\/]data[\\/]categories\.yaml$/);
    expect(categoriesPath({ CITY_DATA_DIR: "data/x" })).toBe(path.join(CONFIG_DIR, "data/x", "categories.yaml"));
    const abs = path.resolve("/tmp/pack");
    expect(categoriesPath({ CITY_DATA_DIR: abs })).toBe(path.join(abs, "categories.yaml"));
  });

  it("defaults serviceGuide timezone and languages, and rejects a language set without en", () => {
    const sg = resolveServiceGuide(readJson(path.join(CONFIG_DIR, "presets/bchc-demo-city.json")));
    expect(sg.timezone).toBe("America/Chicago");
    expect(sg.languages).toHaveLength(8);
    const cfg = readJson(path.join(CONFIG_DIR, "city.config.json"));
    cfg.serviceGuide.languages = ["es", "fr"];
    expect(schemaErrors(cfg).length).toBeGreaterThan(0);
    cfg.serviceGuide.languages = ["en", "es"];
    expect(schemaErrors(cfg)).toEqual([]);
  });

  it("colors categories by override, else series cycled in category order", () => {
    const slugs = ["a", "b", "c", "d"];
    const series = ["#000001", "#000002", "#000003"];
    expect(categoryColor("a", slugs, series, {})).toBe("#000001");
    expect(categoryColor("d", slugs, series, {})).toBe("#000001");
    expect(categoryColor("b", slugs, series, { b: "#abcdef" })).toBe("#abcdef");
  });
});

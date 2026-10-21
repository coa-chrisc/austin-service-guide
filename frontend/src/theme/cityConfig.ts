// City config types (mirror config/city.config.schema.json) and the pure
// resolver that fills serviceGuide defaults. Imported by the Vite plugin
// (frontend/plugins/cityConfigPlugin.ts) at build time, so this module uses
// relative imports only and touches no browser or build globals.
import { deriveDarkColors } from "./contrast";

/** The 18 semantic color roles, in schema order. ThemeColors is derived from this list. */
export const THEME_COLOR_KEYS = [
  "primary",
  "primarySoft",
  "accent",
  "accentSoft",
  "ink",
  "onBrand",
  "page",
  "surface",
  "subtle",
  "body",
  "muted",
  "line",
  "noData",
  "positive",
  "positiveFill",
  "negative",
  "warning",
  "scrim",
] as const;

export type ThemeColorKey = (typeof THEME_COLOR_KEYS)[number];

/** Semantic UI colors as "#rrggbb". */
export type ThemeColors = Record<ThemeColorKey, string>;

/** Text size steps, smallest to largest (same steps as Health Pulse). */
export type TextStep =
  | "3xs"
  | "2xs"
  | "xs"
  | "sm"
  | "base"
  | "lg"
  | "xl"
  | "2xl"
  | "3xl"
  | "4xl"
  | "5xl"
  | "6xl"
  | "7xl";

export interface Theme {
  colors: ThemeColors;
  /** Exactly five stops, worst to best. */
  dataScale: string[];
  /** Three to eight chart/compare series colors, in order. */
  series: string[];
  typography: {
    /** `@fontsource/<name>` package installed in frontend/; weights 400-700 are loaded. */
    fontPackage: string;
    family: string;
    fallback: string;
    /** px on <html>; scales every rem (text and spacing). */
    baseSize: number;
    /** rem overrides per step; unset steps keep the MUI defaults. */
    sizes?: Partial<Record<TextStep, number>>;
  };
  radius: { chip: string; control: string; card: string; panel: string };
}

export interface ServiceGuideSettings {
  shortName?: string;
  description?: string;
  copy?: { tagline?: string; footerDisclaimer?: string; privacyNotice?: string };
  contact?: { phone311?: string; agencyWebsite?: string; accessibilityUrl?: string };
  darkColors?: Partial<ThemeColors>;
  categoryColors?: Record<string, string>;
  extraFontPackages?: string[];
  pwa?: { themeColor?: string; backgroundColor?: string };
}

/** The config file as authored (Health Pulse-only keys are accepted and ignored). */
export interface CityConfig {
  id: string;
  appName: string;
  agency: { name: string; shortName: string; parent: string };
  region: { name: string; cityName: string; state: string };
  brand: { logoUrl: string | null };
  theme: Theme;
  map: { center: [number, number]; zoom: number; minZoom: number; maxZoom: number };
  serviceGuide?: ServiceGuideSettings;
}

/** serviceGuide with every default filled in. */
export interface ResolvedServiceGuide {
  shortName: string;
  description: string;
  copy: { tagline: string; footerDisclaimer: string; privacyNotice: string };
  contact: { phone311: string; agencyWebsite: string; accessibilityUrl: string };
  /** Complete dark-mode roles (explicit values plus derived ones). */
  darkColors: ThemeColors;
  categoryColors: Record<string, string>;
  extraFontPackages: string[];
  pwa: { themeColor: string; backgroundColor: string };
}

/** What the app receives as __CITY_CONFIG__ (useBrandConfig()). */
export interface ResolvedCityConfig extends Omit<CityConfig, "serviceGuide"> {
  serviceGuide: ResolvedServiceGuide;
  /** Public URL of the logo (the configured file, or a generated tile when brand.logoUrl is null). */
  logoSrc: string;
  /** CSS font-family: typography.family, extra font families, then typography.fallback. */
  fontStack: string;
  /** Category slugs in backend/app/data/categories.yaml order (drives palette.brand.category). */
  categorySlugs: string[];
}

/** Health Pulse-only top-level keys: accepted by the schema, dropped before the app sees the config. */
export const HEALTH_PULSE_ONLY_KEYS = [
  "showBuildStory",
  "featuredZips",
  "dataQualityNotes",
  "serviceGuideUrl",
  "data",
  "dataSources",
  "dataAsOf",
  "pipeline",
] as const;

const DEFAULT_PRIVACY_NOTICE =
  "Privacy protection: do not enter your name, street address, phone number, or Social Security number. Pick a category or describe your needs in general terms.";

/** Fill every serviceGuide default from the shared keys. Pure. */
export function resolveServiceGuide(config: CityConfig): ResolvedServiceGuide {
  const sg = config.serviceGuide ?? {};
  const { agency, region, appName, theme } = config;
  return {
    shortName: sg.shortName ?? agency.shortName,
    description:
      sg.description ??
      `${appName}: find services you may be eligible for in ${region.cityName}. A tool by ${agency.name}.`,
    copy: {
      tagline: sg.copy?.tagline ?? "Find services you may qualify for — in minutes",
      footerDisclaimer: sg.copy?.footerDisclaimer ?? `${agency.name} | ${agency.parent}`,
      privacyNotice: sg.copy?.privacyNotice ?? DEFAULT_PRIVACY_NOTICE,
    },
    contact: {
      phone311: sg.contact?.phone311 ?? "311",
      agencyWebsite: sg.contact?.agencyWebsite ?? "",
      accessibilityUrl: sg.contact?.accessibilityUrl ?? "",
    },
    darkColors: deriveDarkColors(theme.colors, sg.darkColors),
    categoryColors: sg.categoryColors ?? {},
    extraFontPackages: sg.extraFontPackages ?? [],
    pwa: {
      themeColor: sg.pwa?.themeColor ?? theme.colors.primary,
      backgroundColor: sg.pwa?.backgroundColor ?? theme.colors.page,
    },
  };
}

/** Category color: categoryColors override, else series cycled in category order. */
export function categoryColor(
  slug: string,
  slugs: readonly string[],
  series: readonly string[],
  overrides: Readonly<Record<string, string>>,
): string {
  const override = overrides[slug];
  if (override) return override;
  const index = slugs.indexOf(slug);
  return series[(index < 0 ? 0 : index) % series.length];
}

/**
 * Active city brand configuration.
 *
 * The JSON is chosen at build time by vite.config.ts (CITY_PRESET=<name>
 * selects config/presets/<name>.brand.json; unset uses config/brand.config.json),
 * validated against config/brand.schema.json, and injected as __BRAND_CONFIG__.
 */

export interface BrandColorRole {
  main: string;
  light: string;
  dark: string;
  contrastText: string;
}

export interface BrandPalette {
  primary: BrandColorRole;
  secondary: BrandColorRole;
  background: { default: string; paper: string };
  text: { primary: string; secondary: string };
  error: string;
  warning: string;
  success: string;
  info: string;
}

export interface BrandConfig {
  appName: string;
  shortName: string;
  agencyName: string;
  cityName: string;
  description: string;
  logo: { src: string; alt: string };
  palette: BrandPalette;
  darkPalette: BrandPalette;
  fontFamily: string;
  copy: {
    tagline: string;
    footerDisclaimer: string;
    privacyNotice: string;
  };
  contact: {
    phone311: string;
    agencyWebsite: string;
    accessibilityUrl: string;
  };
  pwa: { themeColor: string; backgroundColor: string };
}

export const brandConfig: BrandConfig = __BRAND_CONFIG__;

export function useBrandConfig(): BrandConfig {
  return brandConfig;
}

/**
 * Active city configuration.
 *
 * The JSON is chosen at build time (CITY_CONFIG=presets/<id>.json, or the
 * CITY_PRESET=<id> alias; unset uses config/city.config.json), validated by
 * frontend/plugins/cityConfigPlugin.ts against config/city.config.schema.json,
 * resolved (serviceGuide defaults, dark colors, logo URL, font stack) and
 * injected as __CITY_CONFIG__.
 */
import type { ResolvedCityConfig } from "@/theme/cityConfig";

export type {
  CityConfig,
  ResolvedCityConfig,
  ResolvedServiceGuide,
  ThemeColors,
} from "@/theme/cityConfig";

/** The active config with every serviceGuide default filled in. */
export const brandConfig: ResolvedCityConfig = __CITY_CONFIG__;

export function useBrandConfig(): ResolvedCityConfig {
  return brandConfig;
}

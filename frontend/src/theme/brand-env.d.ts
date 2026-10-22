import type { ResolvedCityConfig } from "./cityConfig";

declare global {
  /** Injected by vite.config.ts from the selected city config JSON (resolved). */
  const __CITY_CONFIG__: ResolvedCityConfig;
}

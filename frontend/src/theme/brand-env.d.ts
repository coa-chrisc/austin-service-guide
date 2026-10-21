import type { BrandConfig } from "@/hooks/useBrandConfig";

declare global {
  /** Injected by vite.config.ts from the selected brand config JSON. */
  const __BRAND_CONFIG__: BrandConfig;
}

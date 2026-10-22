// palette.brand: city-config tokens that have no standard MUI palette slot.
// Built per mode in brandTheme.ts.
import "@mui/material/styles";

export interface BrandPalette {
  ink: string;
  onBrand: string;
  primarySoft: string;
  accentSoft: string;
  subtle: string;
  noData: string;
  scrim: string;
  positive: string;
  /** Text color for error/"worse" messages on surface: negative when it reaches 4.5:1, else the contrast-resolved preset color. */
  negativeText: string;
  /** Ink-colored text that reads on page, surface and primarySoft: ink, else primary, else the contrast-resolved preset color. */
  inkText: string;
  /** Five stops, worst to best. */
  dataScale: readonly string[];
  /** Chart/compare series colors in order. */
  series: readonly string[];
  /** series[i], cycling with lighter tints after the preset colors run out (for charts with many slices). */
  seriesAt: (i: number) => string;
  /** CSS gradient primary -> primary.dark -> accent shade; primary.contrastText reads on every stop. */
  heroGradient: string;
  /** Color for a service category slug: serviceGuide.categoryColors, else series cycled in categories.yaml order. */
  category: (slug: string) => string;
  /** Preset text color that reaches 4.5:1 on `fill` (same resolution as contrastText; the build checks preset fills). */
  textOn: (fill: string) => string;
}

declare module "@mui/material/styles" {
  interface Palette {
    brand: BrandPalette;
  }
  interface PaletteOptions {
    brand?: BrandPalette;
  }
}

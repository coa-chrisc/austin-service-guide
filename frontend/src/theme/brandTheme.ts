// MUI themes (light and dark) built from the active city config.
//
// Mapping (config role -> MUI):
//   primary.main=primary, primary.dark=ink (shaded in dark mode, see primaryShades), secondary.main=accent,
//   secondary.light=accentSoft, background.default=page, background.paper=surface,
//   text.primary=body, text.secondary=muted, divider=line, error.main=negative,
//   warning.main=warning, success.main=positiveFill, success.dark=positive,
//   info.main=series[3] (else primary). Every contrastText comes from
//   resolveTextOn(), the same resolution the build gate checks.
//   Roles without an MUI slot live in theme.palette.brand (see palette.d.ts).
// Radius: chip -> MuiChip, control -> Button/TextField/Select (and
// shape.borderRadius), card -> MuiCard, panel -> Paper/Dialog/Drawer.
import "virtual:theme-fonts";
import { createTheme, alpha, type Theme } from "@mui/material/styles";
import type { TypographyVariantsOptions } from "@mui/material/styles";
import { brandConfig } from "@/hooks/useBrandConfig";
import { categoryColor, type TextStep, type ThemeColors } from "./cityConfig";
import { mixHex, primaryShades, resolveInkText, resolveTextOn, textCandidates } from "./contrast";
import type { BrandPalette } from "./palette";

const { theme: cityTheme, serviceGuide, fontStack, categorySlugs } = brandConfig;
const ROOT_PX = 16;

/** "0.5rem" / "8px" -> px number (rem at the 16px browser default). */
const toPx = (length: string) =>
  length.endsWith("rem") ? parseFloat(length) * ROOT_PX : parseFloat(length);

const radius = {
  chip: toPx(cityTheme.radius.chip),
  control: toPx(cityTheme.radius.control),
  card: toPx(cityTheme.radius.card),
  panel: toPx(cityTheme.radius.panel),
};

/**
 * typography.sizes steps -> MUI variants. Only steps set in the config are
 * applied; unset steps keep MUI's defaults.
 */
const VARIANT_STEPS: [variant: keyof TypographyVariantsOptions, step: TextStep][] = [
  ["h1", "5xl"],
  ["h2", "4xl"],
  ["h3", "3xl"],
  ["h4", "2xl"],
  ["h5", "xl"],
  ["h6", "lg"],
  ["subtitle1", "base"],
  ["subtitle2", "sm"],
  ["body1", "base"],
  ["body2", "sm"],
  ["button", "sm"],
  ["caption", "xs"],
  ["overline", "2xs"],
];

function sizeFor(step: TextStep) {
  const rem = cityTheme.typography.sizes?.[step];
  return rem === undefined ? {} : { fontSize: `${rem}rem` };
}

function buildTheme(mode: "light" | "dark", colors: ThemeColors): Theme {
  const { series, dataScale } = cityTheme;
  // Dark mode may fall back to the light roles: they are preset colors too.
  const candidates = textCandidates(colors, mode === "dark" ? cityTheme.colors : undefined);
  const textOn = (fill: string) => resolveTextOn(fill, candidates).color;
  const tone = (main: string, extra: { light?: string; dark?: string } = {}) => ({
    main,
    ...extra,
    contrastText: textOn(main),
  });
  const ink = colors.ink;
  const primaryText = textOn(colors.primary);
  const shades = primaryShades(colors, primaryText);

  const brand: BrandPalette = {
    ink,
    onBrand: colors.onBrand,
    primarySoft: colors.primarySoft,
    accentSoft: colors.accentSoft,
    subtle: colors.subtle,
    noData: colors.noData,
    scrim: colors.scrim,
    positive: colors.positive,
    // Same resolution as checkPreset's "negative text on surface".
    negativeText: resolveTextOn(colors.surface, [{ role: "negative", color: colors.negative }, ...candidates]).color,
    inkText: resolveInkText(colors, candidates).color,
    dataScale,
    series,
    // First pass uses the preset colors as-is; later passes are tints toward
    // the surface so more slices than colors stay distinguishable.
    seriesAt: (i) => {
      const pass = Math.floor(i / series.length);
      const base = series[i % series.length];
      return pass === 0 ? base : mixHex(base, colors.surface, Math.min(0.75, 0.35 * pass));
    },
    heroGradient: `linear-gradient(135deg, ${shades.hero[0]} 0%, ${shades.hero[1]} 60%, ${shades.hero[2]} 100%)`,
    category: (slug) => categoryColor(slug, categorySlugs, series, serviceGuide.categoryColors),
    textOn,
  };

  const typography: TypographyVariantsOptions = {
    fontFamily: fontStack,
    h1: { fontWeight: 700 },
    h2: { fontWeight: 700 },
    h3: { fontWeight: 600 },
    h4: { fontWeight: 600 },
    h5: { fontWeight: 600 },
    h6: { fontWeight: 600 },
    subtitle1: { fontWeight: 600 },
    body1: { fontWeight: 400 },
    body2: { fontWeight: 400 },
    button: { textTransform: "none" as const, fontWeight: 600 },
  };
  for (const [variant, step] of VARIANT_STEPS) {
    Object.assign(typography, { [variant]: { ...(typography[variant] as object), ...sizeFor(step) } });
  }

  const drawerEdge = (corners: string[]) =>
    Object.fromEntries(corners.map((c) => [`border${c}Radius`, radius.panel]));

  return createTheme({
    palette: {
      mode,
      primary: { main: colors.primary, dark: shades.dark, contrastText: primaryText },
      secondary: tone(colors.accent, { light: colors.accentSoft }),
      background: { default: colors.page, paper: colors.surface },
      text: { primary: colors.body, secondary: colors.muted },
      divider: colors.line,
      error: tone(colors.negative),
      warning: tone(colors.warning),
      success: tone(colors.positiveFill, { dark: colors.positive }),
      info: tone(series[3] ?? colors.primary),
      brand,
    },
    shape: {
      borderRadius: radius.control,
    },
    typography,
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          // Root size from the config, as a percentage so visitor font settings still apply.
          html: { fontSize: `${(cityTheme.typography.baseSize / ROOT_PX) * 100}%` },
          ".leaflet-container": {
            fontFamily: "inherit",
          },
          ".leaflet-container *, .leaflet-container *::before, .leaflet-container *::after":
            {
              boxSizing: "content-box",
            },
          ".leaflet-tile-pane img": {
            maxWidth: "none !important",
            maxHeight: "none !important",
          },
          ".leaflet-control-container .leaflet-control": {
            boxSizing: "content-box",
          },
        },
      },
      MuiButton: {
        defaultProps: {
          disableElevation: true,
        },
        styleOverrides: {
          root: {
            borderRadius: radius.control,
            textTransform: "none" as const,
            fontWeight: 600,
            padding: "8px 20px",
          },
          sizeLarge: {
            padding: "12px 28px",
            fontSize: "1rem",
          },
        },
      },
      MuiCard: {
        styleOverrides: {
          root: {
            borderRadius: radius.card,
            border: `1px solid ${alpha(ink, 0.08)}`,
            boxShadow: `0 2px 8px ${alpha(ink, 0.08)}`,
            transition: "box-shadow 0.2s ease, transform 0.2s ease",
            "&:hover": {
              boxShadow: `0 4px 16px ${alpha(ink, 0.12)}`,
            },
          },
        },
      },
      MuiChip: {
        styleOverrides: {
          root: {
            borderRadius: radius.chip,
            fontWeight: 500,
          },
        },
      },
      MuiTextField: {
        styleOverrides: {
          root: {
            "& .MuiOutlinedInput-root": {
              borderRadius: radius.control,
            },
          },
        },
      },
      MuiSelect: {
        styleOverrides: {
          root: {
            borderRadius: radius.control,
          },
        },
      },
      MuiPaper: {
        styleOverrides: {
          // `rounded` only: square papers (AppBar, Drawer) stay square.
          rounded: {
            borderRadius: radius.panel,
          },
        },
      },
      MuiDialog: {
        styleOverrides: {
          paper: {
            borderRadius: radius.panel,
          },
        },
      },
      MuiAppBar: {
        styleOverrides: {
          root: {
            boxShadow: `0 1px 3px ${alpha(ink, 0.08)}`,
          },
        },
      },
      MuiDrawer: {
        styleOverrides: {
          paper: {
            borderRight: `1px solid ${alpha(ink, 0.08)}`,
          },
          // Round only the edge that faces the page.
          paperAnchorLeft: drawerEdge(["TopRight", "BottomRight"]),
          paperAnchorRight: drawerEdge(["TopLeft", "BottomLeft"]),
          paperAnchorTop: drawerEdge(["BottomLeft", "BottomRight"]),
          paperAnchorBottom: drawerEdge(["TopLeft", "TopRight"]),
        },
      },
    },
  });
}

const brandTheme = buildTheme("light", cityTheme.colors);

export const darkTheme = buildTheme("dark", serviceGuide.darkColors);

export default brandTheme;

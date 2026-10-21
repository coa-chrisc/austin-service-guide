import { createTheme, alpha } from "@mui/material/styles";
import { brandConfig } from "@/hooks/useBrandConfig";

const { palette, darkPalette, fontFamily } = brandConfig;
const ink = palette.text.primary;

const brandTheme = createTheme({
  palette: {
    primary: palette.primary,
    secondary: palette.secondary,
    background: palette.background,
    text: palette.text,
    error: { main: palette.error },
    warning: { main: palette.warning },
    success: { main: palette.success },
    info: { main: palette.info },
    divider: alpha(ink, 0.12),
  },
  shape: {
    borderRadius: 8,
  },
  typography: {
    fontFamily,
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
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
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
          borderRadius: 6,
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
          borderRadius: 8,
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
          borderRadius: 6,
          fontWeight: 500,
        },
      },
    },
    MuiTextField: {
      styleOverrides: {
        root: {
          "& .MuiOutlinedInput-root": {
            borderRadius: 6,
          },
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
      },
    },
  },
});

export const darkTheme = createTheme({
  ...brandTheme,
  palette: {
    mode: "dark",
    primary: darkPalette.primary,
    secondary: darkPalette.secondary,
    background: darkPalette.background,
    text: darkPalette.text,
    error: { main: darkPalette.error },
    warning: { main: darkPalette.warning },
    success: { main: darkPalette.success },
    info: { main: darkPalette.info },
  },
});

export default brandTheme;

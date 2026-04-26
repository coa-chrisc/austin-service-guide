import { createTheme } from "@mui/material/styles";

const fontFamily = ["Geist", "Helvetica", "Aptos", "sans-serif"].join(",");

const brandTheme = createTheme({
  palette: {
    primary: {
      main: "#44499C",
      light: "#6e72b8",
      dark: "#22254E",
      contrastText: "#FFFFFF",
    },
    secondary: {
      main: "#009F4D",
      light: "#dff0e3",
      dark: "#005027",
      contrastText: "#FFFFFF",
    },
    background: {
      default: "#f7f6f5",
      paper: "#FFFFFF",
    },
    text: {
      primary: "#22254E",
      secondary: "#636262",
    },
    error: {
      main: "#F83125",
    },
    warning: {
      main: "#FF8F00",
    },
    success: {
      main: "#008743",
    },
    info: {
      main: "#009CDE",
    },
    divider: "rgba(34, 37, 78, 0.12)",
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
          border: "1px solid rgba(34, 37, 78, 0.08)",
          boxShadow: "0 2px 8px rgba(34, 37, 78, 0.08)",
          transition: "box-shadow 0.2s ease, transform 0.2s ease",
          "&:hover": {
            boxShadow: "0 4px 16px rgba(34, 37, 78, 0.12)",
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
          boxShadow: "0 1px 3px rgba(34, 37, 78, 0.08)",
        },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paper: {
          borderRight: "1px solid rgba(34, 37, 78, 0.08)",
        },
      },
    },
  },
});

export const darkTheme = createTheme({
  ...brandTheme,
  palette: {
    mode: "dark",
    primary: {
      main: "#8b8fd4",
      light: "#b0b3e6",
      dark: "#44499C",
      contrastText: "#000000",
    },
    secondary: {
      main: "#4dd68f",
      light: "#dff0e3",
      dark: "#009F4D",
      contrastText: "#000000",
    },
    background: {
      default: "#121214",
      paper: "#1e1e24",
    },
    text: {
      primary: "#e8e8ec",
      secondary: "#a0a0a8",
    },
    error: {
      main: "#ff6b63",
    },
    warning: {
      main: "#ffb040",
    },
    success: {
      main: "#4dd68f",
    },
    info: {
      main: "#40c4f0",
    },
  },
});

export default brandTheme;

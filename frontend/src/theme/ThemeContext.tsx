import React, {
  createContext,
  useContext,
  useMemo,
  useState,
  useCallback,
} from "react";
import { ThemeProvider, CssBaseline } from "@mui/material";
import brandTheme, { darkTheme } from "./brandTheme";

interface ThemeModeContextValue {
  mode: "light" | "dark";
  toggleMode: () => void;
}

const ThemeModeContext = createContext<ThemeModeContextValue>({
  mode: "light",
  toggleMode: () => {},
});

export function useThemeMode() {
  return useContext(ThemeModeContext);
}

interface BrandThemeProviderProps {
  children: React.ReactNode;
}

export function BrandThemeProvider({ children }: BrandThemeProviderProps) {
  const [mode, setMode] = useState<"light" | "dark">(() => {
    try {
      const stored = localStorage.getItem("asg-theme-mode");
      return stored === "dark" ? "dark" : "light";
    } catch {
      return "light";
    }
  });

  const toggleMode = useCallback(() => {
    setMode((prev) => {
      const next = prev === "light" ? "dark" : "light";
      try {
        localStorage.setItem("asg-theme-mode", next);
      } catch {
        /* no-op */
      }
      return next;
    });
  }, []);

  const theme = useMemo(
    () => (mode === "dark" ? darkTheme : brandTheme),
    [mode],
  );

  const value = useMemo(() => ({ mode, toggleMode }), [mode, toggleMode]);

  return (
    <ThemeModeContext.Provider value={value}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </ThemeModeContext.Provider>
  );
}

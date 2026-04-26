import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { BrandThemeProvider } from "@/theme/ThemeContext";
import { AuthProvider } from "@/hooks/useAuth";
import App from "@/App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <BrandThemeProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrandThemeProvider>
    </BrowserRouter>
  </React.StrictMode>,
);

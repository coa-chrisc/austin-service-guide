import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";
import cityConfigPlugin, { loadCityConfig, logSwaps } from "./plugins/cityConfigPlugin";

/* ------------------------------------------------------------------ */
/*  City config: CITY_CONFIG=presets/<id>.json or CITY_PRESET=<id>;     */
/*  unset -> config/city.config.json. Validated (schema, files, fonts,  */
/*  WCAG contrast) by plugins/cityConfigPlugin.ts; any error fails.     */
/* ------------------------------------------------------------------ */

const city = loadCityConfig();
logSwaps(city);
const { config: brand } = city;

export default defineConfig({
  define: {
    __CITY_CONFIG__: JSON.stringify(brand),
  },
  plugins: [
    react(),
    cityConfigPlugin(city),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: brand.appName,
        short_name: brand.serviceGuide.shortName,
        description: brand.serviceGuide.description,
        theme_color: brand.serviceGuide.pwa.themeColor,
        background_color: brand.serviceGuide.pwa.backgroundColor,
        display: "standalone",
        start_url: "/",
        scope: "/",
        icons:
          city.logoExt === "svg"
            ? [{ src: brand.logoSrc, sizes: "any", type: "image/svg+xml", purpose: "any" }]
            : [
                { src: brand.logoSrc, sizes: "192x192", type: `image/${city.logoExt}`, purpose: "any maskable" },
                { src: brand.logoSrc, sizes: "512x512", type: `image/${city.logoExt}`, purpose: "any maskable" },
              ],
      },
      workbox: {
        // Default app shell plus the logo the city-config plugin emits.
        globPatterns: ["**/*.{js,wasm,css,html}", "brand/logo.*"],
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: /\/api\/v1\/services\b/,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "services-catalog",
              expiration: { maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
          {
            // Self-hosted @fontsource files (hashed names, so cache-first is safe).
            urlPattern: /\/assets\/[^/]+\.woff2?$/,
            handler: "CacheFirst",
            options: {
              cacheName: "fonts",
              expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            // OSM tiles come from the a/b/c subdomains.
            urlPattern: /^https:\/\/[abc]\.tile\.openstreetmap\.org\/.*/,
            handler: "CacheFirst",
            options: {
              cacheName: "external-assets",
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 60,
              },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
});

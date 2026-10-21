import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";
import fs from "fs";

/* ------------------------------------------------------------------ */
/*  Brand config: CITY_PRESET=<name> -> config/presets/<name>.brand.json */
/*  unset -> config/brand.config.json. Validated against brand.schema.   */
/* ------------------------------------------------------------------ */

const CONFIG_DIR = path.resolve(__dirname, "../config");

type JsonObj = Record<string, any>;

function readJson(file: string): JsonObj {
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch (err) {
    throw new Error(`[brand] Cannot read ${file}: ${(err as Error).message}`);
  }
}

/** Minimal validator for the schema keywords brand.schema.json uses. */
function checkSchema(
  node: JsonObj,
  value: any,
  at: string,
  root: JsonObj,
  errors: string[],
): void {
  if (node.$ref) {
    const target = node.$ref
      .replace(/^#\//, "")
      .split("/")
      .reduce((o: JsonObj, k: string) => o[k], root);
    node = { ...target, ...node, $ref: undefined };
  }
  if (node.type === "object") {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      errors.push(`${at}: expected an object`);
      return;
    }
    for (const key of node.required ?? []) {
      if (!(key in value)) errors.push(`${at}.${key}: missing required field`);
    }
    for (const key of Object.keys(value)) {
      const sub = node.properties?.[key];
      if (sub) checkSchema(sub, value[key], `${at}.${key}`, root, errors);
      else if (node.additionalProperties === false)
        errors.push(`${at}.${key}: unknown field`);
    }
  } else if (node.type === "string") {
    if (typeof value !== "string") errors.push(`${at}: expected a string`);
    else {
      if (node.minLength && value.length < node.minLength)
        errors.push(`${at}: must not be empty`);
      if (node.pattern && !new RegExp(node.pattern).test(value))
        errors.push(`${at}: "${value}" does not match ${node.pattern}`);
    }
  }
}

function loadBrandConfig(): JsonObj {
  const preset = process.env.CITY_PRESET?.trim();
  let file = path.join(CONFIG_DIR, "brand.config.json");
  if (preset) {
    file = path.join(CONFIG_DIR, "presets", `${preset}.brand.json`);
    if (!/^[a-z0-9-]+$/i.test(preset) || !fs.existsSync(file)) {
      const known = fs
        .readdirSync(path.join(CONFIG_DIR, "presets"))
        .filter((f) => f.endsWith(".brand.json"))
        .map((f) => f.replace(".brand.json", ""));
      throw new Error(
        `[brand] Unknown CITY_PRESET "${preset}". Available presets: ${known.join(", ")}. ` +
          `Unset CITY_PRESET to use config/brand.config.json.`,
      );
    }
  }
  const brand = readJson(file);
  const schema = readJson(path.join(CONFIG_DIR, "brand.schema.json"));
  const errors: string[] = [];
  checkSchema(schema, brand, "brand", schema, errors);
  if (errors.length) {
    throw new Error(
      `[brand] ${path.relative(CONFIG_DIR, file)} is invalid:\n  ${errors.join("\n  ")}`,
    );
  }
  const logoFile = path.join(__dirname, "public", brand.logo.src);
  if (!fs.existsSync(logoFile)) {
    throw new Error(`[brand] logo.src ${brand.logo.src} not found in frontend/public`);
  }
  return brand;
}

const brand = loadBrandConfig();
const isPngLogo = brand.logo.src.toLowerCase().endsWith(".png");
const escapeAttr = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

const brandHtmlPlugin = (): Plugin => ({
  name: "brand-html",
  transformIndexHtml: (html) =>
    html
      .replaceAll("%BRAND_APP_NAME%", escapeAttr(brand.appName))
      .replaceAll("%BRAND_DESCRIPTION%", escapeAttr(brand.description)),
});

export default defineConfig({
  define: {
    __BRAND_CONFIG__: JSON.stringify(brand),
  },
  plugins: [
    react(),
    brandHtmlPlugin(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [brand.logo.src.replace(/^\//, ""), "vite.svg"],
      manifest: {
        name: brand.appName,
        short_name: brand.shortName,
        description: brand.description,
        theme_color: brand.pwa.themeColor,
        background_color: brand.pwa.backgroundColor,
        display: "standalone",
        start_url: "/",
        scope: "/",
        icons: isPngLogo
          ? [
              { src: brand.logo.src, sizes: "192x192", type: "image/png", purpose: "any maskable" },
              { src: brand.logo.src, sizes: "512x512", type: "image/png", purpose: "any maskable" },
            ]
          : [
              { src: brand.logo.src, sizes: "any", type: "image/svg+xml", purpose: "any" },
            ],
      },
      workbox: {
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
            urlPattern:
              /^https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|unpkg\.com|\{s\}\.tile\.openstreetmap\.org)\/.*/,
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

#!/usr/bin/env node
/**
 * Pre-render the PDF admin reports into public/reports/<city id>/<report id>.pdf,
 * which Vite copies into dist/ and the "Download PDF" button fetches.
 *
 * It prints each /admin/reports/<id> page with headless Chromium, so it needs a
 * running app built with the same city config (for example the backend serving
 * dist/ via STATIC_DIR, or `npm run preview` with the API proxied).
 *
 *   node scripts/render-reports.mjs [base URL, default http://127.0.0.1:8000]
 *
 * Playwright is not a project dependency. Install it somewhere else and point
 * PLAYWRIGHT_PATH at the package (for example /tmp/pw/node_modules/playwright/index.mjs).
 * The city id comes from CITY_PRESET, CITY_CONFIG or config/city.config.json,
 * the same choice the build makes. Rebuild after rendering so dist/ picks up the PDFs.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const frontendRoot = path.resolve(here, "..");
const configDir = path.resolve(frontendRoot, "..", "config");

function cityId() {
  const preset = process.env.CITY_PRESET?.trim();
  if (preset) return preset;
  const rel = process.env.CITY_CONFIG?.trim() || "city.config.json";
  const file = path.isAbsolute(rel) ? rel : path.resolve(configDir, rel);
  return JSON.parse(fs.readFileSync(file, "utf8")).id;
}

const base = (process.argv[2] ?? "http://127.0.0.1:8000").replace(/\/$/, "");
const { chromium } = await import(process.env.PLAYWRIGHT_PATH ?? "playwright");

const reportsRes = await fetch(`${base}/api/v1/admin/reports`);
if (!reportsRes.ok) throw new Error(`GET /api/v1/admin/reports returned ${reportsRes.status}`);
const reports = (await reportsRes.json()).filter((r) => String(r.format).includes("PDF"));
if (reports.length === 0) throw new Error("No PDF reports listed by /api/v1/admin/reports.");

const outDir = path.join(frontendRoot, "public", "reports", cityId());
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 1000 } });
  for (const report of reports) {
    await page.goto(`${base}/admin/reports/${encodeURIComponent(report.id)}`, {
      waitUntil: "networkidle",
    });
    await page.waitForSelector('[data-report-ready="true"]', { timeout: 20000 });
    // Charts animate in; let them settle before printing.
    await page.waitForTimeout(1000);
    const file = path.join(outDir, `${report.id}.pdf`);
    await page.pdf({ path: file, format: "Letter", preferCSSPageSize: true, printBackground: true });
    console.log(`wrote ${path.relative(frontendRoot, file)}`);
  }
} finally {
  await browser.close();
}

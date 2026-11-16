#!/usr/bin/env node
/**
 * First-load size budget. Reads dist/index.html, gzips every script and
 * modulepreload it loads, and fails when their total is over the limit.
 * `npm run build` runs it after `vite build`; it also runs on its own:
 *
 *   node scripts/check-bundle-size.mjs
 *
 * The limit is the measured first load plus about 10% headroom. If a change
 * pushes past it, move the new code into a lazy chunk (see src/App.tsx)
 * before raising the number.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

/** gzip kB (1000 bytes, as Vite reports) of JavaScript that index.html loads up front. */
const LIMIT_KB = 177;

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");
const html = fs.readFileSync(path.join(DIST, "index.html"), "utf8");

function attrUrls(pattern) {
  return [...html.matchAll(pattern)].map((m) => m[1]);
}

function gzipKb(url) {
  const file = path.join(DIST, url.replace(/^\//, ""));
  return gzipSync(fs.readFileSync(file)).length / 1000;
}

const scripts = [
  ...attrUrls(/<script[^>]*\btype="module"[^>]*\bsrc="([^"]+)"/g),
  ...attrUrls(/<link[^>]*\brel="modulepreload"[^>]*\bhref="([^"]+)"/g),
].filter((url) => url.startsWith("/assets/"));
const styles = attrUrls(/<link[^>]*\brel="stylesheet"[^>]*\bhref="([^"]+)"/g).filter((url) =>
  url.startsWith("/assets/"),
);

if (scripts.length === 0) {
  console.error("check-bundle-size: no entry script found in dist/index.html");
  process.exit(1);
}

let total = 0;
for (const url of scripts) {
  const kb = gzipKb(url);
  total += kb;
  console.log(`  js   ${url}  ${kb.toFixed(1)} kB gzip`);
}
for (const url of styles) {
  console.log(`  css  ${url}  ${gzipKb(url).toFixed(1)} kB gzip (not budgeted)`);
}

const summary = `first-load JS ${total.toFixed(1)} kB gzip (limit ${LIMIT_KB} kB)`;
if (total > LIMIT_KB) {
  console.error(`check-bundle-size: FAIL, ${summary}. Lazy-load the new code or justify raising LIMIT_KB.`);
  process.exit(1);
}
console.log(`check-bundle-size: ok, ${summary}`);

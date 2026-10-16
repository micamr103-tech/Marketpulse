/**
 * Generates the PWA icon set from one SVG, using headless Edge.
 * Run: node scripts/make-icons.mjs
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const EDGE = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].find((p) => existsSync(p));

const OUT = resolve("public");
mkdirSync(OUT, { recursive: true });

/** The app mark: a rising market line inside a rounded square. */
const svg = (size) => `<!doctype html><html><body style="margin:0">
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0d1a1c"/>
      <stop offset="55%" stop-color="#0a0e15"/>
      <stop offset="100%" stop-color="#101826"/>
    </linearGradient>
    <linearGradient id="line" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0%" stop-color="#1b9c7a"/>
      <stop offset="100%" stop-color="#3ff0bd"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="112" fill="url(#bg)"/>
  <rect x="10" y="10" width="492" height="492" rx="104" fill="none" stroke="#ffffff" stroke-opacity="0.10" stroke-width="2"/>
  <g opacity="0.22" stroke="#7aa2ff" stroke-width="3" stroke-linecap="round">
    <line x1="96" y1="360" x2="416" y2="360"/>
    <line x1="96" y1="280" x2="416" y2="280" stroke-dasharray="6 12"/>
    <line x1="96" y1="200" x2="416" y2="200" stroke-dasharray="6 12"/>
  </g>
  <path d="M96 336 L168 288 L232 312 L304 220 L360 246 L416 168"
        fill="none" stroke="url(#line)" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="416" cy="168" r="22" fill="#3ff0bd"/>
</svg></body></html>`;

const tmp = resolve("icon-temp.html");
const sizes = [16, 32, 48, 64, 72, 96, 108, 128, 144, 152, 180, 192, 256, 384, 512];

for (const size of sizes) {
  writeFileSync(tmp, svg(size));
  const out = resolve("public", `icon-${size}.png`);
  execFileSync(EDGE, [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--hide-scrollbars",
    `--window-size=${size},${size}`,
    `--screenshot=${out}`,
    `file:///${tmp.replace(/\\/g, "/")}`,
  ]);
  console.log("icon", size);
}
console.log("done");

/** Confirms the service worker registers and the manifest is installable-shaped. */
import puppeteer from "puppeteer-core";
import { existsSync } from "node:fs";

const EDGE = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].find(existsSync);

const url = process.argv[2] || "http://localhost:4180";
const browser = await puppeteer.launch({ executablePath: EDGE, headless: "new", args: ["--no-sandbox", "--disable-gpu"] });
const page = await browser.newPage();
await page.goto(url, { waitUntil: "load", timeout: 60_000 });
await new Promise((r) => setTimeout(r, 6000));

const reg = await page.evaluate(async () => {
  const regs = await navigator.serviceWorker.getRegistrations();
  return { count: regs.length, scope: regs[0]?.scope ?? null, active: Boolean(regs[0]?.active) };
});
console.log("service worker:", JSON.stringify(reg));

const manifest = await page.evaluate(async () => {
  const link = document.querySelector('link[rel="manifest"]');
  if (!link) return null;
  const m = await (await fetch(link.href)).json();
  return {
    name: m.name,
    display: m.display,
    start_url: m.start_url,
    icons: m.icons.length,
    has192: m.icons.some((i) => i.sizes === "192x192"),
    has512: m.icons.some((i) => i.sizes === "512x512"),
    maskable: m.icons.some((i) => (i.purpose || "").includes("maskable")),
  };
});
console.log("manifest:", JSON.stringify(manifest, null, 1));

// Cached shell for offline?
const cached = await page.evaluate(async () => {
  const keys = await caches.keys();
  const out = {};
  for (const k of keys) out[k] = (await (await caches.open(k)).keys()).length;
  return out;
});
console.log("caches:", JSON.stringify(cached));

await browser.close();

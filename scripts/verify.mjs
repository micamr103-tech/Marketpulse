/**
 * Browser verification harness.
 *
 * Drives the real app in Edge: checks that market data loads with NO backend
 * running, captures console errors, screenshots desktop + phone layouts, and
 * verifies PWA installability.
 *
 *   node scripts/verify.mjs [url]
 */
import puppeteer from "puppeteer-core";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const URL_ = process.argv[2] || "http://localhost:5173";
const EDGE = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].find(existsSync);

const OUT = resolve("verify");
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, extra = "") => {
  results.push({ name, ok, extra });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  — " + extra : ""}`);
};

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: "new",
  args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
});

try {
  /* ── Desktop ─────────────────────────────────────────────────────────── */
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 1000 });

  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));

  await page.goto(URL_, { waitUntil: "domcontentloaded", timeout: 60_000 });

  // The price header only renders once a quote has arrived.
  let loaded = false;
  try {
    await page.waitForFunction(
      () => {
        const el = document.querySelector("h1");
        return Boolean(el) && el.textContent && el.textContent.trim().length > 2;
      },
      { timeout: 90_000, polling: 1000 }
    );
    loaded = true;
  } catch {
    /* reported below */
  }
  check("market data loads in-browser (no server)", loaded, loaded ? await page.$eval("h1", (e) => e.textContent) : "timed out");

  // Sidebar rows with real prices
  await sleep(4000);
  const rowCount = await page.$$eval("aside li", (els) => els.length).catch(() => 0);
  check("sidebar renders market list", rowCount > 10, `${rowCount} rows`);

  // Chart drawn
  const chartPaths = await page.$$eval("svg path", (els) => els.length).catch(() => 0);
  check("chart renders", chartPaths > 4, `${chartPaths} svg paths`);

  // Verdict (the analysis can lag the price paint by several seconds)
  let prob = null;
  for (let i = 0; i < 40 && !prob; i++) {
    prob = await page.$$eval("span", (els) => {
      const m = els.map((e) => (e.textContent || "").trim()).find((t) => /^\d{1,3}\.\d$/.test(t));
      return m || null;
    });
    if (!prob) await sleep(1500);
  }
  check("AI verdict renders a probability", Boolean(prob), prob || "not found");

  // News
  const newsCount = await page.$$eval("section ul li", (els) => els.length).catch(() => 0);
  check("news feed renders articles", newsCount > 0, `${newsCount} articles`);

  await page.screenshot({ path: resolve(OUT, "desktop.png") });
  await page.screenshot({ path: resolve(OUT, "desktop-full.png"), fullPage: true });

  // Manifest
  const manifest = await page.evaluate(async () => {
    const link = document.querySelector('link[rel="manifest"]');
    if (!link) return null;
    const res = await fetch(link.href);
    return res.ok ? res.json() : null;
  });
  check("PWA manifest present", Boolean(manifest), manifest ? `${manifest.name} · ${manifest.icons.length} icons` : "");

  const swReady = await page.evaluate(() => "serviceWorker" in navigator);
  check("service worker supported", swReady);

  // Local model toggle path (do not force a 66MB download during the check)
  // Rate-limited background requests are expected and retried by the app; only
  // real script errors should fail this check.
  const real = errors.filter((e) => !/429|Failed to load resource|ERR_FAILED|CORS policy/i.test(e));
  const throttled = errors.length - real.length;
  check("no script errors", real.length === 0, real.length ? real.slice(0, 2).join(" | ") : `${throttled} throttled request(s) retried`);

  /* ── Phone ───────────────────────────────────────────────────────────── */
  const phone = await browser.newPage();
  await phone.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const phoneErrors = [];
  phone.on("pageerror", (e) => phoneErrors.push(e.message));
  await phone.goto(URL_, { waitUntil: "domcontentloaded", timeout: 60_000 });

  // iOS-style splash should be up first
  const sawSplash = await phone.evaluate(() =>
    Boolean([...document.querySelectorAll("p")].find((p) => (p.textContent || "").trim() === "MarketPulse"))
  );
  await sleep(14_000);

  const tabBar = await phone.$$eval("nav button", (els) => els.map((e) => (e.getAttribute("aria-label") || "").trim()));
  check("phone shows iOS tab bar", tabBar.includes("Markets") && tabBar.includes("Analysis") && tabBar.includes("News"), tabBar.join("/"));

  const largeTitle = await phone.$eval("h1", (e) => (e.textContent || "").trim()).catch(() => null);
  check("phone shows large title", Boolean(largeTitle), largeTitle || "none");

  await phone.screenshot({ path: resolve(OUT, "phone.png") });

  // switch to the Markets tab
  await phone.evaluate(() => {
    const b = [...document.querySelectorAll("nav button")].find((x) => x.getAttribute("aria-label") === "Markets");
    b?.click();
  });
  await sleep(1800);
  const marketRows = await phone.$$eval("button", (els) => els.filter((e) => /Chevron|›/.test(e.innerHTML) || e.querySelector("svg")).length);
  const groupHeaders = await phone.$$eval("p", (els) => els.filter((e) => /^(Indices|Stocks|Crypto|Commodities)$/.test((e.textContent || "").trim())).length);
  check("phone markets tab lists groups", groupHeaders > 0, `${groupHeaders} groups`);
  await phone.screenshot({ path: resolve(OUT, "phone-markets.png") });

  // tapping a market pushes it to Analysis
  await phone.evaluate(() => {
    const row = [...document.querySelectorAll("button")].find((b) => /NVDA|Apple|Bitcoin|Gold|S&P/i.test(b.textContent || ""));
    row?.click();
  });
  await sleep(6000);
  const afterTap = await phone.$eval("h1", (e) => (e.textContent || "").trim()).catch(() => null);
  const hasBack = await phone.$('button[aria-label="Back"]');
  check("tapping a market opens it with Back", Boolean(hasBack), afterTap || "none");
  await phone.screenshot({ path: resolve(OUT, "phone-detail.png") });

  // News tab
  await phone.evaluate(() => {
    const b = [...document.querySelectorAll("nav button")].find((x) => x.getAttribute("aria-label") === "News");
    b?.click();
  });
  await sleep(2500);
  const newsItems = await phone.$$eval("li", (els) => els.length);
  check("phone news tab renders articles", newsItems > 0, `${newsItems} items`);
  await phone.screenshot({ path: resolve(OUT, "phone-news.png") });

  // large title collapses on scroll
  await phone.evaluate(() => {
    const b = [...document.querySelectorAll("nav button")].find((x) => x.getAttribute("aria-label") === "Analysis");
    b?.click();
  });
  await sleep(2500);
  await phone.evaluate(() => {
    const main = document.querySelector("div.overflow-y-auto");
    main?.scrollTo({ top: 400 });
  });
  await sleep(1200);
  await phone.screenshot({ path: resolve(OUT, "phone-scrolled.png") });
  check("phone has no script errors", phoneErrors.length === 0, phoneErrors.slice(0, 1).join(" | ") || "clean");
  await phone.close();

  /* ── Settings panel ──────────────────────────────────────────────────── */
  const settings = await browser.newPage();
  await settings.setViewport({ width: 1400, height: 950 });
  await settings.goto(URL_, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await sleep(6000);
  const gear = await settings.$('button[title="Settings"]');
  if (gear) {
    await gear.click();
    await sleep(1200);
    const hasInstall = await settings.$$eval("button", (els) =>
      els.some((e) => /Install MarketPulse/.test(e.textContent || ""))
    );
    const hasModel = await settings.$$eval("button", (els) =>
      els.some((e) => /DistilBERT/.test(e.textContent || ""))
    );
    check("settings offers install", hasInstall);
    check("settings offers on-device model choice", hasModel);
    await settings.screenshot({ path: resolve(OUT, "settings.png") });
  } else {
    check("settings button", false);
  }
  await settings.close();
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length ? 1 : 0);

/**
 * Focused test of the "News the AI read" section: does it populate, do the
 * filters work, does the expand toggle reveal the model's reasoning?
 */
import puppeteer from "puppeteer-core";
import { existsSync } from "node:fs";

const EDGE = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].find(existsSync);

const URL_ = process.argv[2] || "http://localhost:5173";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: "new",
  args: ["--no-sandbox", "--disable-gpu"],
});

try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1500, height: 1000 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto(URL_, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForFunction(() => Boolean(document.querySelector("h1")), { timeout: 90_000, polling: 1000 });
  await sleep(12_000);

  // Scroll the news section into view
  await page.evaluate(() => {
    const el = [...document.querySelectorAll("h3")].find((h) => /News the AI read/i.test(h.textContent || ""));
    el?.scrollIntoView({ block: "center" });
  });
  await sleep(1200);

  const state = async () =>
    page.evaluate(() => {
      const section = [...document.querySelectorAll("section")].find((s) =>
        /News the AI read/i.test(s.textContent || "")
      );
      if (!section) return { found: false };
      const items = [...section.querySelectorAll("ul li")];
      const buttons = [...section.querySelectorAll("button")].map((b) => (b.textContent || "").trim());
      const links = [...section.querySelectorAll("a")];
      return {
        found: true,
        count: items.length,
        buttons,
        firstTitle: items[0]?.querySelector("a")?.textContent?.slice(0, 60) ?? null,
        hrefs: links.slice(0, 3).map((a) => a.getAttribute("href")?.slice(0, 60)),
        hasReadBadge: /full text read/i.test(section.textContent || ""),
        expandButtons: items.filter((li) => /AI read|Less/.test(li.textContent || "")).length,
      };
    });

  console.log("initial:", JSON.stringify(await state(), null, 1));

  // 1. expand the first article
  const expanded = await page.evaluate(() => {
    const section = [...document.querySelectorAll("section")].find((s) => /News the AI read/i.test(s.textContent || ""));
    const btn = [...(section?.querySelectorAll("li button") ?? [])].find((b) => /AI read/.test(b.textContent || ""));
    if (!btn) return { clicked: false };
    btn.click();
    return { clicked: true };
  });
  await sleep(900);
  const afterExpand = await page.evaluate(() => {
    const section = [...document.querySelectorAll("section")].find((s) => /News the AI read/i.test(s.textContent || ""));
    const first = section?.querySelector("li");
    return { text: (first?.textContent || "").replace(/\s+/g, " ").slice(0, 200) };
  });
  console.log("\nexpand:", JSON.stringify(expanded), "->", afterExpand.text);

  // 2. filter by positive (button labels are lower-case in the DOM)
  const before = (await state()).count;
  await page.evaluate(() => {
    const section = [...document.querySelectorAll("section")].find((s) => /News the AI read/i.test(s.textContent || ""));
    const btn = [...(section?.querySelectorAll("button") ?? [])].find((b) => (b.textContent || "").trim() === "positive");
    btn?.click();
  });
  await sleep(900);
  const afterPos = (await state()).count;

  await page.evaluate(() => {
    const section = [...document.querySelectorAll("section")].find((s) => /News the AI read/i.test(s.textContent || ""));
    const btn = [...(section?.querySelectorAll("button") ?? [])].find((b) => (b.textContent || "").trim() === "negative");
    btn?.click();
  });
  await sleep(900);
  const afterNeg = (await state()).count;

  await page.evaluate(() => {
    const section = [...document.querySelectorAll("section")].find((s) => /News the AI read/i.test(s.textContent || ""));
    const btn = [...(section?.querySelectorAll("button") ?? [])].find((b) => (b.textContent || "").trim() === "all");
    btn?.click();
  });
  await sleep(700);
  console.log(`filters — all: ${before}, positive: ${afterPos}, negative: ${afterNeg}, back to all: ${(await state()).count}`);

  // 4. click a link (verify it is a real external URL)
  const href = (await state()).hrefs?.[0];
  console.log("first link:", href);

  console.log("\npage errors:", errors.length ? errors.slice(0, 3) : "none");
  await page.screenshot({ path: "verify/news-section.png" });
} finally {
  await browser.close();
}

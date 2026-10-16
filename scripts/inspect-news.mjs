/** Shows exactly which stories survive the filter for a given market. */
import puppeteer from "puppeteer-core";
import { existsSync } from "node:fs";

const EDGE = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].find(existsSync);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: EDGE, headless: "new", args: ["--no-sandbox", "--disable-gpu"] });
const page = await browser.newPage();
await page.setViewport({ width: 1500, height: 1000 });
await page.goto("http://localhost:5173/", { waitUntil: "domcontentloaded", timeout: 60_000 });
await page.waitForFunction(() => Boolean(document.querySelector("h1")), { timeout: 90_000, polling: 1000 });
await sleep(16_000);

const rows = await page.evaluate(() => {
  const section = [...document.querySelectorAll("section")].find((s) => /News the AI read/i.test(s.textContent || ""));
  if (!section) return [];
  return [...section.querySelectorAll("ul li")].map((li) => {
    const t = li.textContent || "";
    const rel = /relevance (\d+)%/.exec(t)?.[1] ?? "?";
    const general = /general market/.test(t);
    const title = li.querySelector("a")?.textContent?.trim() ?? "";
    const source = (t.split("·")[0] || "").trim().slice(0, 22);
    return { source, rel, general, title: title.slice(0, 74) };
  });
});

console.log(`${rows.length} articles shown\n`);
for (const r of rows) {
  console.log(`  rel ${String(r.rel).padStart(3)}%  ${r.general ? "general " : "ON-TOPIC"}  ${r.source.padEnd(14)} ${r.title}`);
}
const junky = rows.filter((r) => /sister|mother|renting|divorce|quiz|crossword|family/i.test(r.title));
console.log(`\nlifestyle junk remaining: ${junky.length}`);
await browser.close();

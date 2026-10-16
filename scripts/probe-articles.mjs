/** Checks what the article reader actually gets back for real news URLs. */
import puppeteer from "puppeteer-core";
import { existsSync } from "node:fs";

const EDGE = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].find(existsSync);

const urls = [
  "https://www.cnbc.com/2026/10/07/here-comes-third-quarter-earnings-season.html",
  "https://www.cnbc.com/2026/10/12/the-bull-market-just-turned-cautious-heres-what-that-means-for-the-rest-of-2026.html",
  "https://www.marketwatch.com/story/economic-data",
];

const browser = await puppeteer.launch({ executablePath: EDGE, headless: "new", args: ["--no-sandbox", "--disable-gpu"] });
const page = await browser.newPage();
await page.goto("http://localhost:5173/", { waitUntil: "domcontentloaded" });

for (const url of urls) {
  const r = await page.evaluate(async (u) => {
    const t0 = performance.now();
    try {
      const res = await fetch(`https://r.jina.ai/${u}`);
      const t = await res.text();
      const i = t.indexOf("Markdown Content:");
      const body = i !== -1 ? t.slice(i + 17).trim() : t;
      return { status: res.status, ms: Math.round(performance.now() - t0), len: body.length, head: body.slice(0, 220).replace(/\s+/g, " ") };
    } catch (e) {
      return { status: "ERR", ms: 0, len: 0, head: e.message };
    }
  }, url);
  console.log(`\n${r.status}  ${r.len} chars  ${r.ms}ms  ${url.slice(0, 60)}`);
  console.log(`  ${r.head}`);
}
await browser.close();

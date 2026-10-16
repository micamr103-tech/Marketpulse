/** Can the relay fetch Google News RSS for a specific company? */
import puppeteer from "puppeteer-core";
import { existsSync } from "node:fs";

const EDGE = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].find(existsSync);

const QUERIES = [
  ["NVDA", '"NVIDIA" stock OR shares OR earnings when:5d'],
  ["AAPL", '"Apple" iPhone OR stock OR shares when:5d'],
  ["^GSPC", '"S&P 500" stocks OR market when:5d'],
  ["BTC-USD", "Bitcoin price OR market when:5d"],
  ["JPM", "JPMorgan stock OR shares OR earnings when:5d"],
];

const browser = await puppeteer.launch({ executablePath: EDGE, headless: "new", args: ["--no-sandbox", "--disable-gpu"] });
const page = await browser.newPage();
await page.goto("http://localhost:5173/", { waitUntil: "domcontentloaded" });

for (const [sym, q] of QUERIES) {
  const r = await page.evaluate(async (query) => {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
    try {
      const res = await fetch(`https://r.jina.ai/${url}`);
      const t = await res.text();
      const i = t.indexOf("Markdown Content:");
      const xml = i !== -1 ? t.slice(i + 17) : t;
      const titles = [...xml.matchAll(/<title>([\s\S]*?)<\/title>/gi)]
        .map((m) => m[1].replace(/^<!\[CDATA\[|\]\]>$/g, "").trim())
        .filter((x) => x && !x.includes("Google News"));
      return { status: res.status, count: titles.length, titles: titles.slice(0, 4) };
    } catch (e) {
      return { status: "ERR", count: 0, titles: [e.message] };
    }
  }, q);

  console.log(`\n${sym}  status=${r.status}  ${r.count} items`);
  r.titles.forEach((t) => console.log(`   · ${t.slice(0, 92)}`));
}
await browser.close();

/** Identifies which CNBC feed IDs are live and what each one covers. */
import puppeteer from "puppeteer-core";
import { existsSync } from "node:fs";

const EDGE = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].find(existsSync);

const IDS = [
  ["100003114", "Top News"],
  ["20910258", "Economy?"],
  ["19854910", "Technology?"],
  ["10001147", "Finance?"],
  ["10000664", "Business?"],
  ["15839135", "Small Business?"],
  ["100727362", "Investing?"],
  ["19836768", "Healthcare?"],
  ["10000108", "Retail?"],
  ["101050272", "?"],
  ["100002166", "?"],
  ["100003242", "?"],
  ["10001147", "dup"],
  ["16018764", "?"],
  ["10072490", "?"],
  ["20048385", "?"],
  ["1454167680", "?"],
];

const browser = await puppeteer.launch({ executablePath: EDGE, headless: "new", args: ["--no-sandbox", "--disable-gpu"] });
const page = await browser.newPage();
await page.goto("http://localhost:5173/", { waitUntil: "domcontentloaded" });

const out = await page.evaluate(async (list) => {
  const res = [];
  for (const [id, label] of list) {
    const url = `https://www.cnbc.com/id/${id}/device/rss/rss.html`;
    try {
      const r = await fetch(url);
      const t = await r.text();
      const titles = [...t.matchAll(/<title>([\s\S]*?)<\/title>/gi)].map((m) => m[1].replace(/<!\[CDATA\[|\]\]>/g, "").trim());
      res.push({ id, label, status: r.status, items: (t.match(/<item[\s>]/gi) || []).length, sample: titles.slice(1, 3) });
    } catch (e) {
      res.push({ id, label, status: "ERR", items: 0, sample: [] });
    }
  }
  return res;
}, IDS);

for (const r of out) {
  if (r.items > 3) {
    console.log(`${r.id}  ${String(r.items).padStart(3)} items  (${r.label})`);
    r.sample.forEach((s) => console.log(`        · ${s.slice(0, 82)}`));
  }
}
await browser.close();

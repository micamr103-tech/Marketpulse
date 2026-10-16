/**
 * Finds news feeds that (a) actually return items and (b) allow browser CORS.
 * Run in a real browser, because Node cannot tell us about CORS.
 */
import puppeteer from "puppeteer-core";
import { existsSync } from "node:fs";

const EDGE = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].find(existsSync);

const CANDIDATES = [
  ["cnbc wrss", "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss&id=100003114"],
  ["cnbc device", "https://www.cnbc.com/id/100003114/device/rss/rss.html"],
  ["cnbc markets2", "https://www.cnbc.com/id/20910258/device/rss/rss.html"],
  ["cnbc econ", "https://www.cnbc.com/id/20910258/device/rss/rss.html"],
  ["marketwatch top", "https://feeds.content.dowjones.io/public/rss/mw_topstories"],
  ["marketwatch mkt", "https://feeds.content.dowjones.io/public/rss/mw_marketstories"],
  ["marketwatch reals", "https://feeds.content.dowjones.io/public/rss/mw_realtimeheadlines"],
  ["benzinga", "https://www.benzinga.com/feed"],
  ["benzinga news", "https://www.benzinga.com/feed/news"],
  ["benzinga economy", "https://www.benzinga.com/feed/economy"],
  ["coindesk", "https://www.coindesk.com/arc/outboundfeeds/rss/"],
  ["fed press", "https://www.federalreserve.gov/feeds/press_all.xml"],
  ["bls", "https://www.bls.gov/feed/news_release.rss"],
  ["treasury", "https://home.treasury.gov/system/files/126/rss.xml"],
  ["ecb", "https://www.ecb.europa.eu/rss/press.html"],
  ["seekingalpha", "https://seekingalpha.com/market_currents.xml"],
  ["investing", "https://www.investing.com/rss/news_25.rss"],
  ["ft", "https://www.ft.com/rss/home"],
  ["bbc biz", "http://feeds.bbci.co.uk/news/business/rss.xml"],
  ["nyt biz", "https://rss.nytimes.com/services/xml/rss/nyt/Business.xml"],
  ["guardian biz", "https://www.theguardian.com/uk/business/rss"],
  ["yahoo rss", "https://finance.yahoo.com/news/rssindex"],
  ["stockanalysis", "https://stockanalysis.com/rss/news/"],
  ["tradingview", "https://www.tradingview.com/news/rss/"],
  ["appletoday", "https://www.apple.com/newsroom/rss-feed.rss"],
  ["nasdaq rss", "https://www.nasdaq.com/feed/rssoutbound?category=Markets"],
  ["etf db", "https://www.etfdb.com/feed/"],
  ["morningstar", "https://www.morningstar.com/feeds/all.xml"],
  ["tipranks", "https://www.tipranks.com/rss/news.xml"],
];

const browser = await puppeteer.launch({ executablePath: EDGE, headless: "new", args: ["--no-sandbox", "--disable-gpu"] });
const page = await browser.newPage();
await page.goto("http://localhost:5173/", { waitUntil: "domcontentloaded" });

const results = await page.evaluate(async (urls) => {
  const out = [];
  for (const [name, url] of urls) {
    const t0 = performance.now();
    try {
      const res = await fetch(url);
      const text = await res.text();
      const items = (text.match(/<item[\s>]/gi) || []).length;
      const entries = (text.match(/<entry[\s>]/gi) || []).length;
      out.push({ name, status: res.status, bytes: text.length, items, entries, ms: Math.round(performance.now() - t0) });
    } catch (e) {
      out.push({ name, status: "CORS/blocked", bytes: 0, items: 0, entries: 0, ms: 0, error: e.message.slice(0, 40) });
    }
  }
  return out;
}, CANDIDATES);

const good = results.filter((r) => (r.items > 3 || r.entries > 3) && r.status === 200);
const blocked = results.filter((r) => r.status !== 200);
const empty = results.filter((r) => r.status === 200 && r.items <= 3 && r.entries <= 3);

console.log(`\n=== WORKING (${good.length}) ===`);
good.forEach((r) => console.log(`  ${r.items || r.entries} items  ${String(r.bytes).padStart(7)}b ${r.name}`));
console.log(`\n=== EMPTY (${empty.length}) ===`);
empty.forEach((r) => console.log(`  ${String(r.items || r.entries).padStart(3)} items  ${r.name}`));
console.log(`\n=== BLOCKED (${blocked.length}) ===`);
blocked.forEach((r) => console.log(`  ${r.status}  ${r.name}  ${r.error ?? ""}`));

await browser.close();

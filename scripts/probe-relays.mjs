/** Probes batch endpoints and alternative CORS relays. */
import puppeteer from "puppeteer-core";
import { existsSync } from "node:fs";

const EDGE = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].find(existsSync);

const browser = await puppeteer.launch({ executablePath: EDGE, headless: "new", args: ["--no-sandbox", "--disable-gpu"] });
const page = await browser.newPage();
await page.goto("http://localhost:5173/?nodevice=1", { waitUntil: "domcontentloaded" });

const tests = [
  ["batch v7 quote (jina)", "https://r.jina.ai/https://query1.finance.yahoo.com/v7/finance/quote?symbols=AAPL,MSFT,NVDA"],
  ["v6 quote (jina)", "https://r.jina.ai/https://query1.finance.yahoo.com/v6/finance/quote?symbols=AAPL,MSFT"],
  ["spark batch (jina)", "https://r.jina.ai/https://query1.finance.yahoo.com/v7/finance/spark?symbols=AAPL,MSFT&range=1mo&interval=1d"],
  ["cors.isomorphic-git", "https://cors.isomorphic-git.org/https://query1.finance.yahoo.com/v8/finance/chart/AAPL?range=5d%26interval=1d"],
  ["cors.workers.dev", "https://test.cors.workers.dev/?https://query1.finance.yahoo.com/v8/finance/chart/AAPL?range=5d%26interval=1d"],
  ["codetabs", "https://api.codetabs.com/v1/proxy?quest=https://query1.finance.yahoo.com/v8/finance/chart/AAPL%3Frange%3D5d%26interval%3D1d"],
  ["whateverorigin", "https://whateverorigin.org/get?url=" + encodeURIComponent("https://query1.finance.yahoo.com/v8/finance/chart/AAPL?range=5d&interval=1d")],
  ["allorigins", "https://api.allorigins.win/raw?url=" + encodeURIComponent("https://query1.finance.yahoo.com/v8/finance/chart/AAPL?range=5d&interval=1d")],
  ["fmp demo", "https://financialmodelingprep.com/api/v3/quote/AAPL?apikey=demo"],
  ["coingecko markets", "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=bitcoin,ethereum&price_change_percentage=24h"],
];

for (const [name, url] of tests) {
  const t0 = Date.now();
  const r = await page.evaluate(async (u) => {
    try {
      const res = await fetch(u);
      const t = await res.text();
      return { ok: res.ok, status: res.status, head: t.slice(0, 130).replace(/\s+/g, " ") };
    } catch (e) {
      return { ok: false, status: 0, head: e.message.slice(0, 60) };
    }
  }, url);
  console.log(`${r.ok ? "OK  " : "FAIL"} ${String(r.status).padEnd(4)} ${String(Date.now() - t0).padStart(6)}ms ${name.padEnd(22)} ${r.head.slice(0, 80)}`);
}

await browser.close();

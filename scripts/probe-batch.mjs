/** Inspects the batch endpoints' actual payloads. */
import puppeteer from "puppeteer-core";
import { existsSync } from "node:fs";

const EDGE = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].find(existsSync);

const browser = await puppeteer.launch({ executablePath: EDGE, headless: "new", args: ["--no-sandbox", "--disable-gpu"] });
const page = await browser.newPage();
await page.goto("http://localhost:5173/?nodevice=1", { waitUntil: "domcontentloaded" });

const grab = async (url, label, wait = 0) => {
  if (wait) await new Promise((r) => setTimeout(r, wait));
  const r = await page.evaluate(async (u) => {
    try {
      const res = await fetch(u);
      const t = await res.text();
      const i = t.indexOf("Markdown Content:");
      return { status: res.status, text: (i !== -1 ? t.slice(i + 17) : t).trim() };
    } catch (e) {
      return { status: 0, text: e.message };
    }
  }, url);
  console.log(`\n=== ${label} (${r.status}) ===`);
  console.log(r.text.slice(0, 700));
};

await grab(
  "https://r.jina.ai/https://query1.finance.yahoo.com/v7/finance/quote?symbols=AAPL,MSFT,NVDA,%5EGSPC",
  "v7 batch quote"
);
await grab(
  "https://r.jina.ai/https://query1.finance.yahoo.com/v7/finance/spark?symbols=AAPL,MSFT&range=1mo&interval=1d",
  "v7 batch spark",
  3000
);

await browser.close();

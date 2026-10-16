/** Which source gives genuinely company-specific news for a ticker? */
import puppeteer from "puppeteer-core";
import { existsSync } from "node:fs";

const EDGE = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].find(existsSync);

const browser = await puppeteer.launch({ executablePath: EDGE, headless: "new", args: ["--no-sandbox", "--disable-gpu"] });
const page = await browser.newPage();
await page.goto("http://localhost:5173/", { waitUntil: "domcontentloaded" });

const yahooSearch = async (q) =>
  page.evaluate(async (query) => {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&newsCount=12&quotesCount=0&listsCount=0`;
    try {
      const res = await fetch(`https://r.jina.ai/${url}`);
      const t = await res.text();
      const i = t.indexOf("{");
      const j = JSON.parse(t.slice(i));
      return (j.news || []).map((n) => ({ title: n.title, pub: n.publisher, tickers: n.relatedTickers }));
    } catch (e) {
      return [{ title: "ERR " + e.message, pub: "", tickers: [] }];
    }
  }, q);

for (const q of ["NVDA", "AAPL"]) {
  console.log(`\n===== Yahoo search q=${q} =====`);
  const rows = await yahooSearch(q);
  rows.forEach((r) => console.log(`  [${r.pub}] ${r.title.slice(0, 84)}  tickers=${JSON.stringify(r.tickers)}`));
}

// Yahoo's own quote-news page, rendered through the relay
const newsPage = await page.evaluate(async () => {
  const url = "https://finance.yahoo.com/quote/NVDA/news";
  try {
    const res = await fetch(`https://r.jina.ai/${url}`);
    const t = await res.text();
    const i = t.indexOf("Markdown Content:");
    return { status: res.status, len: t.length, sample: t.slice(i + 17, i + 700).replace(/\s+/g, " ") };
  } catch (e) {
    return { status: "ERR", len: 0, sample: e.message };
  }
});
console.log(`\n===== Yahoo quote news page via relay (${newsPage.status}, ${newsPage.len} chars) =====`);
console.log(newsPage.sample.slice(0, 500));

// StockTwits — ticker-specific, CORS-enabled
const st = await page.evaluate(async () => {
  try {
    const res = await fetch("https://api.stocktwits.com/api/2/streams/symbol/NVDA.json?limit=10");
    const j = await res.json();
    return { status: res.status, count: j.messages?.length ?? 0, sample: (j.messages || []).slice(0, 3).map((m) => m.body?.slice(0, 80)) };
  } catch (e) {
    return { status: "ERR", count: 0, sample: [e.message] };
  }
});
console.log(`\n===== StockTwits (${st.status}, ${st.count}) =====`);
st.sample.forEach((s) => console.log(`  · ${s}`));

await browser.close();

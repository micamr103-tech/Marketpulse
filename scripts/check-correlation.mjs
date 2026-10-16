/**
 * Checks the thing that matters most: for each market, is the news actually
 * about that market? Prints the top stories and flags any that aren't.
 */
import puppeteer from "puppeteer-core";
import { existsSync } from "node:fs";

const EDGE = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].find(existsSync);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SYMBOLS = ["NVDA", "AAPL", "TSLA", "BTC-USD", "^GSPC", "GC=F"];

const browser = await puppeteer.launch({ executablePath: EDGE, headless: "new", args: ["--no-sandbox", "--disable-gpu"] });
const page = await browser.newPage();
await page.setViewport({ width: 1500, height: 1000 });
await page.goto("http://localhost:5173/", { waitUntil: "domcontentloaded", timeout: 60_000 });
await page.waitForFunction(() => Boolean(document.querySelector("h1")), { timeout: 90_000, polling: 1000 });
await sleep(10_000);

for (const sym of SYMBOLS) {
  let prevName = "";
  const handle = await page.$(`aside li[data-symbol="${sym}"] button`);
  if (handle) {
    await handle.evaluate((el) => el.scrollIntoView({ block: "center" }));
    await sleep(300);
    await handle.click();
    // wait for the header to actually change
    for (let i = 0; i < 25; i++) {
      await sleep(1000);
      const now = await page.$eval("h1", (e) => e.textContent || "").catch(() => "");
      if (now !== prevName) break;
    }
  } else {
    console.log(`  (no row for ${sym})`);
  }
  prevName = await page.$eval("h1", (e) => e.textContent || "").catch(() => prevName);
  await sleep(14_000);

  const out = await page.evaluate(() => {
    const section = [...document.querySelectorAll("section")].find((s) => /News the AI read/i.test(s.textContent || ""));
    const name = document.querySelector("h1")?.textContent?.trim();
    if (!section) return { name, rows: [] };
    return {
      name,
      rows: [...section.querySelectorAll("ul li")].map((li) => {
        const t = li.textContent || "";
        return {
          rel: Number(/relevance (\d+)%/.exec(t)?.[1] ?? -1),
          strong: !/general market/.test(t),
          title: li.querySelector("a")?.textContent?.trim()?.slice(0, 72) ?? "",
        };
      }),
    };
  });

  const strong = out.rows.filter((r) => r.strong);
  console.log(`\n=== ${out.name} — ${out.rows.length} articles, ${strong.length} ticker-matched ===`);
  out.rows.slice(0, 6).forEach((r) => console.log(`   ${r.strong ? "TICKER" : "general"} ${String(r.rel).padStart(3)}%  ${r.title}`));
}
await browser.close();

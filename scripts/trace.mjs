/** Network trace: shows exactly what the app requests and what comes back. */
import puppeteer from "puppeteer-core";
import { existsSync } from "node:fs";

const EDGE = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
].find(existsSync);

const browser = await puppeteer.launch({
  executablePath: EDGE,
  headless: "new",
  args: ["--no-sandbox", "--disable-gpu"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 900 });

const rows = [];
page.on("request", (r) => rows.push({ t: Date.now(), ev: ">>", url: r.url().slice(0, 110) }));
page.on("response", (r) => rows.push({ t: Date.now(), ev: String(r.status()), url: r.url().slice(0, 110) }));
page.on("requestfailed", (r) =>
  rows.push({ t: Date.now(), ev: "FAIL " + (r.failure()?.errorText || "").slice(0, 30), url: r.url().slice(0, 110) })
);
page.on("pageerror", (e) => rows.push({ t: Date.now(), ev: "JS-ERR", url: e.message.slice(0, 110) }));

await page.goto(process.argv[2] || "http://localhost:5173/?nodevice=1", {
  waitUntil: "domcontentloaded",
  timeout: 60_000,
});
await new Promise((r) => setTimeout(r, 40_000));

const h1 = await page.$eval("h1", (e) => e.textContent).catch(() => "(no h1)");
const rootText = await page.$eval("#root", (e) => e.innerText.replace(/\s+/g, " ").slice(0, 420)).catch(() => "(no root)");
console.log("H1:", h1);
console.log("ROOT TEXT:", rootText || "(empty)");
console.log("\n--- last 25 network events ---");
const t0 = rows[0]?.t || 0;
for (const r of rows.slice(-25)) console.log(`${String(r.t - t0).padStart(6)}ms ${r.ev.padEnd(10)} ${r.url}`);

const jina = rows.filter((r) => r.url.includes("r.jina.ai"));
console.log(`\njina calls: ${jina.length}`);
for (const r of jina.slice(0, 8)) console.log(`  ${r.ev} ${r.url.slice(0, 95)}`);

await browser.close();

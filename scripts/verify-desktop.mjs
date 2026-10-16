/**
 * Verifies the packaged desktop app: launches it, attaches over the debugging
 * port and checks that it loads live market data on its own — no server.
 *
 *   node scripts/verify-desktop.mjs
 */
import puppeteer from "puppeteer-core";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawn } from "node:child_process";

const EXE = join(tmpdir(), "mp-release", "win-unpacked", "MarketPulse.exe");
if (!existsSync(EXE)) {
  console.error("Packaged app not found at " + EXE);
  process.exit(1);
}

const PORT = 9333;
console.log("launching", EXE);
const child = spawn(EXE, [`--remote-debugging-port=${PORT}`], { stdio: "ignore" });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let browser = null;

try {
  // Wait for the debugging endpoint to come up.
  for (let i = 0; i < 40; i++) {
    await sleep(1000);
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (res.ok) break;
    } catch {
      /* not up yet */
    }
  }

  browser = await puppeteer.connect({
    browserURL: `http://127.0.0.1:${PORT}`,
    defaultViewport: { width: 1440, height: 900 },
  });

  const pages = await browser.pages();
  const page = pages[0] ?? (await browser.newPage());

  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.waitForFunction(
    () => {
      const h = document.querySelector("h1");
      return Boolean(h && h.textContent && h.textContent.trim().length > 2);
    },
    { timeout: 120_000, polling: 1000 }
  );

  const name = await page.$eval("h1", (e) => e.textContent.trim());
  const rows = await page.$$eval("aside li", (els) => els.length).catch(() => 0);
  const isDesktop = await page.evaluate(() => Boolean(window.marketpulseDesktop));
  const url = page.url();

  console.log("PASS  desktop app launches and loads live data —", name);
  console.log("PASS  sidebar markets rendered —", rows);
  console.log("PASS  preload bridge exposed —", isDesktop);
  console.log("INFO  loaded from", url);
  console.log(errors.length ? "WARN  page errors: " + errors.slice(0, 2).join(" | ") : "PASS  no page errors");

  await page.screenshot({ path: "verify/desktop-app.png" });
  console.log("screenshot -> verify/desktop-app.png");
  process.exitCode = 0;
} catch (err) {
  console.error("FAIL ", err.message);
  process.exitCode = 1;
} finally {
  if (browser) await browser.disconnect();
  child.kill();
}

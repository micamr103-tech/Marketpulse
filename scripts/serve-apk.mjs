/**
 * Serves the APK over the local network so a phone can download it directly.
 * Copying the file through chat apps often corrupts or re-compresses it, which
 * is a common cause of "App not installed" errors.
 *
 *   node scripts/serve-apk.mjs
 */
import http from "node:http";
import { createReadStream, statSync, existsSync } from "node:fs";
import { join } from "node:path";
import { networkInterfaces } from "node:os";

const DIR = "C:\\Users\\Marko\\Desktop";
const PORT = 8080;
const FILE = join(DIR, "MarketPulse.apk");

if (!existsSync(FILE)) {
  console.error("APK not found at " + FILE);
  process.exit(1);
}

const page = `<!doctype html><html><head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>MarketPulse</title>
<style>
 body{background:#05070b;color:#e8eef7;font-family:system-ui,-apple-system,sans-serif;
      display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px}
 .card{max-width:420px;width:100%;text-align:center}
 img{width:96px;height:96px;border-radius:22px;margin-bottom:16px}
 h1{font-size:24px;margin:0 0 6px}
 p{color:#7d8ba1;font-size:14px;line-height:1.6;margin:0 0 24px}
 a{display:block;background:#22d3a5;color:#05070b;text-decoration:none;font-weight:700;
   font-size:17px;padding:16px;border-radius:14px}
 small{display:block;margin-top:18px;color:#4a5568;font-size:12px}
</style></head><body>
<div class="card">
  <img src="/icon.png" alt="">
  <h1>MarketPulse 2.0</h1>
  <p>AI market intelligence.<br>${(statSync(FILE).size / 1048576).toFixed(1)} MB &middot; Android 8.0+</p>
  <a href="/MarketPulse.apk" download>Download the app</a>
  <small>Then allow &ldquo;install unknown apps&rdquo; when Android asks.</small>
</div></body></html>`;

const ip =
  Object.values(networkInterfaces())
    .flat()
    .find((i) => i && i.family === "IPv4" && !i.internal)?.address ?? "localhost";

http
  .createServer((req, res) => {
    const path = (req.url || "/").split("?")[0];
    if (path === "/" || path === "/index.html") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(page);
    }
    if (path === "/icon.png") {
      const icon = join("C:\\Users\\Marko\\marketpulse\\public", "icon-192.png");
      res.writeHead(200, { "Content-Type": "image/png" });
      return createReadStream(icon).pipe(res);
    }
    if (path === "/MarketPulse.apk") {
      res.writeHead(200, {
        "Content-Type": "application/vnd.android.package-archive",
        "Content-Disposition": 'attachment; filename="MarketPulse.apk"',
        "Content-Length": statSync(FILE).size,
      });
      return createReadStream(FILE).pipe(res);
    }
    res.writeHead(404).end("not found");
  })
  .listen(PORT, () => {
    console.log(`\n  On your phone, open:  http://${ip}:${PORT}\n`);
    console.log(`  (also reachable at http://localhost:${PORT} on this PC)\n`);
  });

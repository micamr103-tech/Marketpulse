/**
 * Serves dist/ exactly as a static host would, so the production build can be
 * verified before it is deployed anywhere.
 *
 *   node scripts/serve-dist.mjs [port]
 */
import http from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { join, extname, normalize } from "node:path";

const ROOT = join(process.cwd(), "dist");
const PORT = Number(process.argv[2] || 4180);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

http
  .createServer((req, res) => {
    const url = decodeURIComponent((req.url || "/").split("?")[0]);
    let file = join(ROOT, normalize(url).replace(/^(\.\.[/\\])+/, ""));

    if (!existsSync(file) || statSync(file).isDirectory()) {
      // SPA fallback
      file = join(ROOT, "index.html");
    }

    res.writeHead(200, {
      "Content-Type": TYPES[extname(file)] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    createReadStream(file).pipe(res);
  })
  .listen(PORT, () => console.log(`dist/ served on http://localhost:${PORT}`));

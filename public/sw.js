/**
 * MarketPulse service worker.
 *
 *  • app shell + icons + the ONNX runtime  → cache first (instant, offline)
 *  • the AI model on HuggingFace          → cache first (huge, immutable)
 *  • market/news data                     → network first, cache as fallback
 *  • navigations                          → network first, cached shell offline
 */

const VERSION = "mp-v1";
const SHELL = `${VERSION}-shell`;
const DATA = `${VERSION}-data`;
const MODEL = `${VERSION}-model`;

const SHELL_ASSETS = [
  "/",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/icon-180.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll(SHELL_ASSETS).catch(() => undefined))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const isModelAsset = (url) =>
  url.hostname.includes("huggingface.co") || url.hostname.includes("cdn-lfs") || url.pathname.endsWith(".onnx");

const isStatic = (url) =>
  url.origin === self.location.origin &&
  (url.pathname.startsWith("/assets/") ||
    url.pathname.startsWith("/icon-") ||
    url.pathname === "/manifest.webmanifest");

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res && (res.ok || res.type === "opaque")) cache.put(request, res.clone());
  return res;
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(request);
    if (hit) return hit;
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }

  // Never touch non-GET or unsupported schemes.
  if (!url.protocol.startsWith("http")) return;

  if (req.mode === "navigate") {
    event.respondWith(networkFirst(req, SHELL).catch(() => caches.match("/")));
    return;
  }

  if (isModelAsset(url)) {
    event.respondWith(cacheFirst(req, MODEL).catch(() => fetch(req)));
    return;
  }

  if (isStatic(url)) {
    event.respondWith(cacheFirst(req, SHELL).catch(() => fetch(req)));
    return;
  }

  // Live market/news data: fresh when online, last-known when not.
  event.respondWith(networkFirst(req, DATA).catch(() => new Response("[]", { status: 503 })));
});

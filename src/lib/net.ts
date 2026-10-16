/**
 * Browser-side networking.
 *
 * The public market endpoints we need do not send CORS headers, so requests are
 * routed through a CORS-friendly relay (r.jina.ai) that returns the raw body.
 * Everything is paced: the free relay allows ~20 requests per burst and answers
 * 429 beyond that, so a small scheduler with backoff keeps the app reliable.
 */

export interface NetOptions {
  timeoutMs?: number;
  retries?: number;
  signal?: AbortSignal;
  /** 0 = jump the queue (the market the user is viewing), 1 = normal. */
  priority?: number;
}

/**
 * Relay order matters: most of our hosts (CNBC, CoinGecko, Ollama, HuggingFace)
 * are CORS-enabled, so trying direct first costs nothing and is instant. The
 * ones that block CORS are sent straight to the relay — attempting them
 * directly only produces a console error and a wasted round trip.
 */
const CORS_OPEN = /(^|\.)(cnbc\.com|coingecko\.com|huggingface\.co|huggingface\.co|jsdelivr\.net|localhost|127\.0\.0\.1)$/i;

const DIRECT = { id: "direct", wrap: (u: string) => u, unwrap: false };
const JINA = { id: "jina", wrap: (u: string) => `https://r.jina.ai/${u}`, unwrap: true };
const CODETABS = { id: "codetabs", wrap: (u: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`, unwrap: false };

function relaysFor(url: string) {
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    return [JINA, CODETABS, DIRECT];
  }
  if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/i.test(host)) return [DIRECT, JINA, CODETABS];
  if (CORS_OPEN.test(host)) return [DIRECT, JINA, CODETABS];
  return [JINA, CODETABS, DIRECT];
}

/* ── Paced scheduler ───────────────────────────────────────────────────────────
 * The free relay rejects bursts with 429, so requests are spaced and capped.
 * High-priority work (the market the user is looking at) jumps the queue.     */
const MAX_CONCURRENT = 3;
const MIN_GAP_MS = 320;
let inFlight = 0;
let lastStart = 0;
let cooldownUntil = 0;
const queue: { priority: number; run: () => void }[] = [];

function drain() {
  while (inFlight < MAX_CONCURRENT && queue.length > 0) {
    queue.shift()?.run();
  }
}

function acquire(priority: number): Promise<void> {
  return new Promise((resolve) => {
    queue.push({
      priority,
      run: () => {
        // Reserve the slot synchronously so drain() cannot over-subscribe.
        inFlight++;
        const gap = Math.max(0, lastStart + MIN_GAP_MS - Date.now());
        const wait = Math.max(gap, 0, cooldownUntil - Date.now());
        setTimeout(() => {
          lastStart = Date.now();
          resolve();
        }, wait);
      },
    });
    queue.sort((a, b) => a.priority - b.priority);
    drain();
  });
}

function release() {
  inFlight = Math.max(0, inFlight - 1);
  drain();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Normal work; `netFetch` callers for the visible market pass priority 0. */
export const PRIORITY = { high: 0, normal: 1 };

/* ── Relay-aware fetch ───────────────────────────────────────────────────── */

/** r.jina.ai wraps the payload in a small markdown preamble — strip it. */
export function unwrapRelay(text: string): string {
  const marker = text.indexOf("Markdown Content:");
  if (marker !== -1) return text.slice(marker + "Markdown Content:".length).trim();
  return text;
}

export interface NetResult {
  ok: boolean;
  status: number;
  text: string;
  via: string;
  error?: string;
}

export async function netFetch(url: string, opts: NetOptions = {}): Promise<NetResult> {
  const { timeoutMs = 14_000, retries = 1, priority = 1 } = opts;
  let lastError = "unreachable";
  const relays = relaysFor(url);

  for (let attempt = 0; attempt <= retries; attempt++) {
    for (const relay of relays) {
      await acquire(priority);
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), timeoutMs);
        const onAbort = () => ctrl.abort();
        if (opts.signal) {
          if (opts.signal.aborted) throw new Error("aborted");
          opts.signal.addEventListener("abort", onAbort, { once: true });
        }
        const res = await fetch(relay.wrap(url), { signal: ctrl.signal, headers: { Accept: "*/*" } });
        clearTimeout(timer);

        if (res.status === 429) {
          // The relay tells us exactly how long to wait — respect it.
          let waitMs = 1800;
          try {
            const body = JSON.parse(await res.text()) as { retryAfter?: number };
            if (typeof body.retryAfter === "number") {
              waitMs = Math.max(waitMs, body.retryAfter * 1000 + 500);
            }
          } catch {
            /* body was not the usual JSON error */
          }
          lastError = "rate limited";
          cooldownUntil = Date.now() + waitMs;
          continue;
        }
        if (!res.ok) {
          lastError = `HTTP ${res.status}`;
          continue;
        }
        const raw = await res.text();
        const text = relay.unwrap ? unwrapRelay(raw) : raw;
        return { ok: true, status: res.status, text, via: relay.id };
      } catch (err) {
        lastError = (err as Error).name === "AbortError" ? "timeout" : (err as Error).message;
      } finally {
        release();
      }
    }
    if (attempt < retries) await sleep(500 * (attempt + 1));
  }

  return { ok: false, status: 0, text: "", via: "none", error: lastError };
}

/** Fetch and parse JSON, trying every relay until one yields valid JSON. */
export async function fetchJson<T>(url: string, opts: NetOptions = {}): Promise<T | null> {  const r = await netFetch(url, opts);
  if (!r.ok) return null;
  try {
    const start = r.text.indexOf("{");
    const arr = r.text.indexOf("[");
    let from = start;
    if (from === -1 || (arr !== -1 && arr < from)) from = arr;
    if (from === -1) return null;
    const end = Math.max(r.text.lastIndexOf("}"), r.text.lastIndexOf("]"));
    if (end <= from) return null;
    return JSON.parse(r.text.slice(from, end + 1)) as T;
  } catch {
    return null;
  }
}

/* ── In-flight de-duplication ──────────────────────────────────────────────
 * React re-renders and the background sweep can ask for the same thing at the
 * same moment; one request should serve both callers. */
const pending = new Map<string, Promise<unknown>>();

export function dedupe<T>(key: string, task: () => Promise<T>): Promise<T> {
  const hit = pending.get(key) as Promise<T> | undefined;
  if (hit) return hit;
  const run = task().finally(() => pending.delete(key));
  pending.set(key, run as Promise<unknown>);
  return run;
}

export async function fetchText(url: string, opts: NetOptions = {}): Promise<string | null> {
  const r = await netFetch(url, opts);
  return r.ok ? r.text : null;
}

/* ── Tiny TTL cache (localStorage) so reloads are instant and offline-ish ── */
interface Entry<T> {
  at: number;
  value: T;
}

const mem = new Map<string, Entry<unknown>>();

export const memoryCache = {
  get<T>(key: string, maxAgeMs: number): T | null {
    const hit = mem.get(key);
    if (hit && Date.now() - hit.at < maxAgeMs) return hit.value as T;
    if (hit) {
      mem.delete(key);
    }
    return null;
  },
  set<T>(key: string, value: T) {
    mem.set(key, { at: Date.now(), value });
  },
  clear() {
    mem.clear();
  },
};

const LS_PREFIX = "mp:";
const LS_MAX = 180; // entries kept

export const diskCache = {
  get<T>(key: string, maxAgeMs: number): T | null {
    try {
      const raw = localStorage.getItem(LS_PREFIX + key);
      if (!raw) return null;
      const e = JSON.parse(raw) as Entry<T>;
      if (Date.now() - e.at > maxAgeMs) {
        localStorage.removeItem(LS_PREFIX + key);
        return null;
      }
      return e.value;
    } catch {
      return null;
    }
  },
  set<T>(key: string, value: T) {
    try {
      localStorage.setItem(LS_PREFIX + key, JSON.stringify({ at: Date.now(), value } satisfies Entry<T>));
      const keys = Object.keys(localStorage).filter((k) => k.startsWith(LS_PREFIX));
      if (keys.length > LS_MAX) {
        // drop the oldest quarter
        const withTime = keys
          .map((k) => [k, (JSON.parse(localStorage.getItem(k) || "{}").at ?? 0)] as const)
          .sort((a, b) => a[1] - b[1]);
        withTime.slice(0, Math.floor(keys.length / 4)).forEach(([k]) => localStorage.removeItem(k));
      }
    } catch {
      /* quota — ignore */
    }
  },
  clear() {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(LS_PREFIX))
      .forEach((k) => localStorage.removeItem(k));
    mem.clear();
  },
};

export const cache = {
  /** Memory first (instant), then disk (survives reload). */
  get<T>(key: string, maxAgeMs: number): T | null {
    return memoryCache.get<T>(key, maxAgeMs) ?? diskCache.get<T>(key, maxAgeMs);
  },
  set<T>(key: string, value: T) {
    memoryCache.set(key, value);
    diskCache.set(key, value);
  },
  clear() {
    diskCache.clear();
  },
};

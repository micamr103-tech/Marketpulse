import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { MARKETS, MARKET_MAP, MACRO_FEED } from "./markets.mjs";
import { cached, TTL } from "./cache.mjs";
import { fetchChart, fetchWatchlist } from "./providers/yahoo.mjs";
import { gatherNews, relevance } from "./providers/news.mjs";
import { computeStats } from "./stats.mjs";
import { analyse } from "./ai/analyze.mjs";
import { detectOllama, aiStatus } from "./ai/ollama.mjs";
import { neutralNews, aggregateNews } from "./ai/heuristic.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 8787;

app.use(cors());
app.use(express.json());

const resolve = (symbol) => MARKET_MAP.get(decodeURIComponent(symbol).toUpperCase());

/* ── Sentiment + analysis caches (analysis is expensive, keep it warm) ────── */
const analysisCache = new Map(); // symbol -> { at, payload, promise }
const convictionCache = new Map();

/**
 * A cached verdict is only usable if it was produced by the engine that is
 * available NOW — otherwise the UI would keep showing "built-in" results after
 * Ollama is switched on.
 */
function isFresh(entry) {
  if (!entry?.payload) return false;
  if (Date.now() - entry.at > TTL.analysis) return false;
  const wantLlm = aiStatus().online;
  const gotLlm = entry.payload.verdict?.engine === "ollama";
  return wantLlm === gotLlm;
}

async function getNews(def) {
  return cached(`news:${def.symbol}`, TTL.news, async () => {
    const items = await gatherNews(def, { limit: 14 });
    const agg = aggregateNews(items);
    items.sort((a, b) => b.impact - a.impact || b.publishedAt - a.publishedAt);
    return { items, agg };
  });
}

async function getContext(symbol, range = "1mo", interval = "1d") {
  const def = MARKET_MAP.get(symbol);
  const quote = await cached(`quote:${symbol}:${range}:${interval}`, TTL.candles, () =>
    fetchChart(symbol, range, interval)
  );
  const stats = computeStats(quote.candles);
  const { items, agg } = await getNews(def);
  return { def, quote, stats, news: items, newsAgg: agg };
}

/* ── Health ─────────────────────────────────────────────────────────────── */
app.get("/api/health", async (_req, res) => {
  res.json({ ok: true, ai: await detectOllama(), markets: MARKETS.length, uptime: process.uptime() });
});

/* ── Sidebar: quotes + sparklines ───────────────────────────────────────── */
app.get("/api/markets", async (_req, res) => {
  try {
    const rows = await cached("watchlist", TTL.quotes, () => fetchWatchlist(MARKETS));
    res.json({
      markets: rows,
      updatedAt: Date.now(),
      conviction: Object.fromEntries(convictionCache),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── Conviction strip (filled in progressively in the background) ────────── */
let convictionRunning = false;

async function runConvictionSweep() {
  if (convictionRunning) return;
  convictionRunning = true;
  try {
    const list = MARKETS.filter((m) => !convictionCache.has(m.symbol) || Date.now() - convictionCache.get(m.symbol).at > 20 * 60_000);
    for (const def of list) {
      try {
        const { quote, stats, news, newsAgg } = await getContext(def.symbol, "3mo", "1d");
        const { verdict } = await analyse({ def, quote, stats, news, newsAgg });
        convictionCache.set(def.symbol, {
          at: Date.now(),
          probabilityUp: verdict.probabilityUp,
          confidence: verdict.confidence,
          direction: verdict.direction,
          headline: verdict.headline,
          engine: verdict.engine,
        });
      } catch (err) {
        convictionCache.set(def.symbol, { at: Date.now(), probabilityUp: null, error: err.message });
      }
    }
  } finally {
    convictionRunning = false;
  }
}

app.post("/api/conviction/refresh", (_req, res) => {
  runConvictionSweep();
  res.json({ started: true });
});

app.get("/api/conviction", (_req, res) => {
  res.json({ conviction: Object.fromEntries(convictionCache), running: convictionRunning });
});

/* ── Market detail: fast path (no LLM) ──────────────────────────────────── */
app.get("/api/market/:symbol", async (req, res) => {
  const def = resolve(req.params.symbol);
  if (!def) return res.status(404).json({ error: "Unknown market" });
  try {
    const range = req.query.range || "1mo";
    const interval = req.query.interval || "1d";
    const { quote, stats, news, newsAgg } = await getContext(def.symbol, range, interval);
    const cachedAnalysis = analysisCache.get(def.symbol);

    res.json({
      def,
      quote,
      stats: {
        rsi14: Number(stats.rsi14.toFixed(1)),
        annualizedVol: Number(stats.annualizedVol.toFixed(1)),
        ret5: Number(stats.ret5.toFixed(2)),
        ret20: Number(stats.ret20.toFixed(2)),
        vsMa20: Number(stats.vsMa20.toFixed(2)),
        volTrend: Number(stats.volTrend.toFixed(1)),
      },
      news: news.slice(0, 14),
      newsAgg: { newsScore: newsAgg.newsScore, breadth: newsAgg.breadth, readCount: newsAgg.readCount },
      analysis: isFresh(cachedAnalysis) ? cachedAnalysis.payload : null,
      ai: aiStatus(),
      updatedAt: Date.now(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── Deep analysis: may take 5-60s with a local LLM ─────────────────────── */
app.get("/api/analysis/:symbol", async (req, res) => {
  const def = resolve(req.params.symbol);
  if (!def) return res.status(404).json({ error: "Unknown market" });

  const hit = analysisCache.get(def.symbol);
  if (isFresh(hit)) {
    return res.json({ ...hit.payload, cached: true });
  }
  if (hit?.promise) return res.json({ ...(await hit.promise), shared: true });

  const task = (async () => {
    try {
      const { quote, stats, news, newsAgg } = await getContext(def.symbol, "3mo", "1d");
      const payload = await analyse({ def, quote, stats, news, newsAgg });
      analysisCache.set(def.symbol, { at: Date.now(), payload });
      convictionCache.set(def.symbol, {
        at: Date.now(),
        probabilityUp: payload.verdict.probabilityUp,
        confidence: payload.verdict.confidence,
        direction: payload.verdict.direction,
        headline: payload.verdict.headline,
        engine: payload.verdict.engine,
      });
      return payload;
    } catch (err) {
      console.warn(`[analysis] ${def.symbol} failed:`, err.message);
      // Deliberately NOT cached: a transient failure shouldn't stick for 10 minutes.
      return {
        verdict: { ...neutralNews(def.short), probabilityUp: 50, error: err.message },
        forecast: null,
        news: [],
      };
    }
  })();

  analysisCache.set(def.symbol, { at: Date.now(), payload: null, promise: task });
  try {
    const done = await task;
    if (!done.forecast) analysisCache.delete(def.symbol);
    res.json(done);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── Macro / overall market mood strip ───────────────────────────────────── */
app.get("/api/briefing", async (_req, res) => {
  try {
    const payload = await cached("briefing", TTL.news, async () => {
      const seen = new Map();
      for (const feed of MACRO_FEED) {
        const def = MARKET_MAP.get(feed.symbol);
        const news = await gatherNews(def, { limit: 5, deep: false });
        for (const n of news) {
          // dedupe on the headline itself — syndicators reuse the same story
          const key = n.title.toLowerCase().split(" - ")[0].slice(0, 55);
          if (!seen.has(key)) seen.set(key, { ...n, market: def.short, symbol: def.symbol });
        }
      }
      const items = [...seen.values()]
        .sort((a, b) => b.publishedAt - a.publishedAt)
        .slice(0, 18);
      return { items };
    });
    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ── Search ─────────────────────────────────────────────────────────────── */
app.get("/api/search", async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) return res.json({ results: [] });
  const lower = q.toLowerCase();
  const results = MARKETS.filter(
    (m) =>
      m.name.toLowerCase().includes(lower) ||
      m.short.toLowerCase().includes(lower) ||
      m.symbol.toLowerCase().includes(lower) ||
      m.aliases.some((a) => a.toLowerCase().includes(lower))
  ).map((m) => ({ symbol: m.symbol, name: m.name, short: m.short, category: m.category }));
  res.json({ results });
});

/* ── Serve the production build ─────────────────────────────────────────── */
const dist = path.join(__dirname, "..", "dist");
app.use(express.static(dist));
app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, "index.html")));

app.listen(PORT, () => {
  console.log(`\n  ▸ MarketPulse API  http://localhost:${PORT}`);
  detectOllama().then((s) =>
    console.log(`  ▸ AI engine: ${s.online ? `Ollama (${s.model})` : `built-in fallback — ${s.error}`}\n`)
  );
});
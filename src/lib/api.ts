/**
 * The app's data API — entirely in the browser.
 *
 * Same surface the old server exposed, so the UI components are unchanged.
 * Includes a background conviction sweep so sidebar rows fill in with their
 * own AI probability over the first minute, exactly like before.
 */

import { MARKETS, MARKET_MAP, BRIEFING_MARKETS } from "../app/markets";
import { analyse } from "../app/analyze";
import { applyVolumeStats, computeStats } from "../app/stats";
import { cache } from "./net";
import { fetchChart, fetchWatchlist } from "./data/quotes";
import { gatherBriefing, gatherNews } from "./data/news";
import { detectOllama, ollamaInfo } from "../app/ai/ollama";
import type { Analysis, Conviction, MarketDetail, MarketRow, NewsItem, Watchlist } from "../types";

const VERDICT_TTL = 10 * 60_000;
const QUOTE_TTL = 45_000;

/* ── Conviction sweep ────────────────────────────────────────────────────── */
const conviction = new Map<string, Conviction>();
const sweepListeners = new Set<() => void>();
const rowListeners = new Set<(rows: MarketRow[]) => void>();

export const getConviction = () => Object.fromEntries(conviction);
export const onConviction = (fn: () => void) => {
  sweepListeners.add(fn);
  return () => sweepListeners.delete(fn);
};
/** Lets the sidebar show partial results while a batch is still streaming. */
export const onRows = (fn: (rows: MarketRow[]) => void) => {
  rowListeners.add(fn);
  return () => rowListeners.delete(fn);
};
const emitConviction = () => sweepListeners.forEach((fn) => fn());
const emitRows = (rows: MarketRow[]) => rowListeners.forEach((fn) => fn(rows));

let sweeping = false;

async function sweepOnBackground(preloaded?: MarketRow[]) {
  if (sweeping || document.hidden) return;
  sweeping = true;
  try {
    // One batched request fills every row; the per-market news pull is skipped
    // here so the sweep costs almost nothing. Opening a market upgrades it.
    const rows = preloaded ?? (await fetchWatchlist(MARKETS));
    emitRows(rows);

    const stale = (c?: Conviction) => !c || Date.now() - c.at > 20 * 60_000;
    for (const def of MARKETS) {
      if (!stale(conviction.get(def.symbol))) continue;
      try {
        const quote = rows.find((r) => r.symbol === def.symbol);
        const full = quote
          ? await fetchChart(def.symbol, "3mo", "1d", { priority: 1 })
          : null;
        if (!full) continue;
        const news = await gatherNews(def, { limit: 8, deep: false, quick: true });
        const { verdict } = await analyse({ def, quote: full, news, llm: false });
        conviction.set(def.symbol, {
          at: Date.now(),
          probabilityUp: verdict.probabilityUp,
          confidence: verdict.confidence,
          direction: verdict.direction,
          headline: verdict.headline,
          engine: verdict.engine,
        });
        emitConviction();
      } catch {
        /* keep going through the rest */
      }
    }
  } finally {
    sweeping = false;
  }
}

export const api = {
  async health() {
    await detectOllama();
    return { ok: true, ai: ollamaInfo(), markets: MARKETS.length };
  },

  async watchlist(): Promise<Watchlist> {
    const markets = await fetchWatchlist(MARKETS);
    void sweepOnBackground(markets);
    return { markets, updatedAt: Date.now(), conviction: getConviction() };
  },

  startSweep: sweepOnBackground,

  async market(symbol: string, range = "1mo"): Promise<MarketDetail> {
    const def = MARKET_MAP.get(symbol);
    if (!def) throw new Error("Unknown market");
    // The market the user is looking at jumps the request queue.
    const quote = await fetchChart(symbol, range, "1d", { priority: 0 });
    if (!quote) throw new Error("Could not load prices for " + def.short);
    const news = await gatherNews(def, { limit: 12, deep: true, priority: 0 });
    const s = applyVolumeStats(computeStats(quote.candles.map((c) => c.close)), quote.candles.map((c) => c.volume || 0));
    const agg = await cachedAnalysis(symbol);
    return {
      def,
      quote,
      stats: {
        rsi14: Number(s.rsi14.toFixed(1)),
        annualizedVol: Number(s.annualizedVol.toFixed(1)),
        ret5: Number(s.ret5.toFixed(2)),
        ret20: Number(s.ret20.toFixed(2)),
        vsMa20: Number(s.vsMa20.toFixed(2)),
        volTrend: Number(s.volTrend.toFixed(1)),
      },
      news,
      newsAgg: { newsScore: 0, breadth: 0.5, readCount: news.filter((n) => n.read).length },
      analysis: agg,
      ai: ollamaInfo(),
      updatedAt: Date.now(),
    };
  },

  async analysis(symbol: string, { force = false } = {}): Promise<Analysis> {
    const def = MARKET_MAP.get(symbol);
    if (!def) throw new Error("Unknown market");
    if (!force) {
      const hit = cache.get<Analysis>(`analysis:${symbol}`, VERDICT_TTL);
      if (hit) return hit;
    }
    const quote = await fetchChart(symbol, "3mo", "1d", { priority: 0 });
    if (!quote) throw new Error("Could not load prices for " + def.short);
    const news = await gatherNews(def, { limit: 12, deep: true, priority: 0 });
    const result = await analyse({ def, quote, news });
    cache.set(`analysis:${symbol}`, result);
    conviction.set(symbol, {
      at: Date.now(),
      probabilityUp: result.verdict.probabilityUp,
      confidence: result.verdict.confidence,
      direction: result.verdict.direction,
      headline: result.verdict.headline,
      engine: result.verdict.engine,
    });
    emitConviction();
    return result;
  },

  async briefing(): Promise<{ items: NewsItem[] }> {
    const key = "briefing";
    const hit = cache.get<NewsItem[]>(key, 10 * 60_000);
    if (hit?.length) return { items: hit };
    const items = await gatherBriefing(BRIEFING_MARKETS);
    if (items.length) cache.set(key, items);
    return { items };
  },
};

async function cachedAnalysis(symbol: string): Promise<Analysis | null> {
  const hit = cache.get<Analysis>(`analysis:${symbol}`, VERDICT_TTL);
  return hit ?? null;
}

export { QUOTE_TTL };

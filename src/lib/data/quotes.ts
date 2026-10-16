/** Live quotes + candles. Runs entirely in the browser. */

import { cache, dedupe, fetchJson, netFetch } from "../net";
import type { Candle, MarketRow, Quote } from "../../types";

const Y = (symbol: string) => `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`;
const SPARK = "https://query1.finance.yahoo.com/v7/finance/spark";

const round = (n: number | undefined | null, d = 2): number | null =>
  typeof n === "number" && Number.isFinite(n) ? Math.round(n * 10 ** d) / 10 ** d : null;

interface ChartResult {
  meta?: Record<string, unknown>;
  timestamp?: number[];
  indicators?: {
    quote?: {
      open?: (number | null)[];
      high?: (number | null)[];
      low?: (number | null)[];
      close?: (number | null)[];
      volume?: (number | null)[];
    }[];
  };
}

function toCandles(r: ChartResult): Candle[] {
  const ts = r.timestamp ?? [];
  const q = r.indicators?.quote?.[0] ?? {};
  const out: Candle[] = [];
  for (let i = 0; i < ts.length; i++) {
    const close = q.close?.[i];
    if (close == null) continue;
    out.push({
      t: ts[i] * 1000,
      open: round(q.open?.[i]),
      high: round(q.high?.[i]),
      low: round(q.low?.[i]),
      close: round(close)!,
      volume: q.volume?.[i] ?? 0,
    });
  }
  return out;
}

function toQuote(symbol: string, r: ChartResult): Quote {
  const meta = (r.meta ?? {}) as Record<string, any>;
  const candles = toCandles(r);
  const last = candles.at(-1);
  const price = meta.regularMarketPrice ?? last?.close ?? null;
  const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? candles.at(-2)?.close ?? null;
  const change = price != null && prevClose != null ? price - prevClose : 0;

  const regular = meta.currentTradingPeriod?.regular;
  const nowSec = Date.now() / 1000;
  const marketState =
    regular?.start && regular?.end
      ? nowSec >= regular.start && nowSec <= regular.end
        ? "REGULAR"
        : "CLOSED"
      : (meta.marketState ?? null);

  return {
    symbol,
    name: meta.shortName || meta.longName || symbol,
    price: round(price) ?? 0,
    prevClose: round(prevClose) ?? 0,
    change: round(change) ?? 0,
    changePct: prevClose ? round((change / prevClose) * 100) ?? 0 : 0,
    currency: meta.currency || "USD",
    exchange: meta.fullExchangeName || meta.exchangeName || null,
    dayHigh: round(meta.regularMarketDayHigh),
    dayLow: round(meta.regularMarketDayLow),
    fiftyTwoWeekHigh: round(meta.fiftyTwoWeekHigh),
    fiftyTwoWeekLow: round(meta.fiftyTwoWeekLow),
    marketState,
    nextOpen: regular?.start ? regular.start * 1000 : null,
    regularMarketTime: meta.regularMarketTime ? meta.regularMarketTime * 1000 : null,
    volume: meta.regularMarketVolume ?? last?.volume ?? null,
    candles,
  };
}

export async function fetchChart(
  symbol: string,
  range = "1mo",
  interval = "1d",
  { signal, priority }: { signal?: AbortSignal; priority?: number } = {}
): Promise<Quote | null> {
  const key = `q:${symbol}:${range}:${interval}`;
  const fresh = cache.get<Quote>(key, 45_000);
  if (fresh) return fresh;

  return dedupe(key, async () => {
    const data = await fetchJson<{ chart?: { result?: ChartResult[] } }>(
      `${Y(symbol)}?range=${range}&interval=${interval}`,
      { signal, retries: 2, priority }
    );
    const result = data?.chart?.result?.[0];
    if (!result) return cache.get<Quote>(key, 1000 * 60 * 60 * 6);

    const quote = toQuote(symbol, result);
    cache.set(key, quote);
    return quote;
  });
}

interface SparkResponse {
  spark?: {
    result?: { symbol: string; response?: ChartResult[] }[];
    error?: unknown;
  };
}

/**
 * The whole sidebar in ONE request.
 *
 * Yahoo's /v7/finance/spark endpoint accepts many symbols at once and returns
 * the same price + chart payload as the single-symbol endpoint. That turns 22
 * requests per refresh into 1, which matters a lot against a rate-limited
 * relay — and makes the first paint feel instant.
 */
export async function fetchWatchlist(
  defs: { symbol: string; name: string; short: string; category: string; currency: string }[],
  { signal }: { signal?: AbortSignal } = {}
): Promise<MarketRow[]> {
  const symbols = defs.map((d) => d.symbol);
  const rows = new Map<string, MarketRow>();

  // Show whatever we already know from cache while the batch is in flight.
  for (const def of defs) {
    const hit = cache.get<Quote>(`q:${def.symbol}:1mo:1d`, 15 * 60_000);
    if (hit) {
      rows.set(def.symbol, {
        symbol: def.symbol,
        name: def.name,
        short: def.short,
        category: def.category as MarketRow["category"],
        currency: def.currency,
        price: hit.price,
        change: hit.change,
        changePct: hit.changePct,
        marketState: hit.marketState as string | null,
        spark: hit.candles.map((c) => c.close).slice(-30),
      });
    }
  }

  const key = `spark:${symbols.join(",")}`;

  return dedupe(key, async () => {
    // Yahoo caps the symbol list per call; chunk defensively.
    const chunks = chunk(symbols, 20);
    for (const group of chunks) {
      const data = await fetchJson<SparkResponse>(
        `${SPARK}?symbols=${encodeURIComponent(group.join(","))}&range=1mo&interval=1d`,
        { signal, retries: 2 }
      );
      const results = data?.spark?.result ?? [];
      for (const entry of results) {
        const chart = entry.response?.[0];
        if (!chart) continue;
        const def = defs.find((d) => d.symbol === entry.symbol);
        if (!def) continue;

        const quote = toQuote(entry.symbol, chart);
        cache.set(`q:${entry.symbol}:1mo:1d`, quote);
        rows.set(entry.symbol, {
          symbol: entry.symbol,
          name: def.name,
          short: def.short,
          category: def.category as MarketRow["category"],
          currency: quote.currency || def.currency,
          price: quote.price,
          change: quote.change,
          changePct: quote.changePct,
          marketState: quote.marketState as string | null,
          spark: quote.candles.map((c) => c.close).slice(-30),
        });
      }
      // One chunk is enough on the happy path; stop early rather than burn quota.
      if (rows.size >= defs.length - 1) break;
    }

    return defs.map((d) => rows.get(d.symbol)).filter((r): r is MarketRow => Boolean(r));
  });
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/* ── Crypto via CoinGecko — a direct, CORS-friendly second source ────────── */
const CG_IDS: Record<string, string> = {
  "BTC-USD": "bitcoin",
  "ETH-USD": "ethereum",
  "SOL-USD": "solana",
};

export async function fetchCryptoQuote(symbol: string): Promise<{ price: number; changePct: number } | null> {
  const id = CG_IDS[symbol];
  if (!id) return null;
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd&include_24hr_change=true`;
  const res = await netFetch(url, { timeoutMs: 10_000, retries: 0, priority: 0 });
  if (!res.ok) return null;
  try {
    const json = JSON.parse(res.text);
    return { price: json[id].usd, changePct: json[id].usd_24h_change ?? 0 };
  } catch {
    return null;
  }
}

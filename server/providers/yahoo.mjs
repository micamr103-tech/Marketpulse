/**
 * Yahoo Finance data provider (no API key required).
 * Docs/behaviour notes: /v8/finance/chart returns metadata + OHLCV series in one call.
 */

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const BASE = "https://query1.finance.yahoo.com";

export async function yfetch(url, { timeout = 12_000, headers = {} } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": UA, Accept: "application/json", ...headers },
    });
    if (!res.ok) throw new Error(`Yahoo responded ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Run async tasks with a bounded number in flight at once. */
export async function pooled(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      try {
        results[i] = await worker(items[i], i);
      } catch {
        results[i] = null;
      }
    }
  });
  await Promise.all(runners);
  return results;
}

const round = (n, d = 2) =>
  typeof n === "number" && Number.isFinite(n) ? Math.round(n * 10 ** d) / 10 ** d : null;

/**
 * Fetch quote + daily candles in a single request.
 * @param {string} symbol e.g. "AAPL", "^GSPC", "BTC-USD"
 */
export async function fetchChart(symbol, range = "1mo", interval = "1d") {
  const url = `${BASE}/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=false`;
  const data = await yfetch(url);
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error(`No data for ${symbol}`);

  const meta = result.meta || {};
  const ts = result.timestamp || [];
  const q = result.indicators?.quote?.[0] || {};
  const adj = result.indicators?.adjclose?.[0]?.adjclose;

  const candles = [];
  for (let i = 0; i < ts.length; i++) {
    const close = adj?.[i] ?? q.close?.[i];
    if (close == null) continue;
    candles.push({
      t: ts[i] * 1000,
      open: round(q.open?.[i]),
      high: round(q.high?.[i]),
      low: round(q.low?.[i]),
      close: round(close),
      volume: q.volume?.[i] ?? 0,
    });
  }

  const last = candles.at(-1);
  const price = meta.regularMarketPrice ?? last?.close ?? null;
  const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? candles.at(-2)?.close ?? null;
  const change = price != null && prevClose != null ? price - prevClose : 0;
  const changePct = prevClose ? (change / prevClose) * 100 : 0;

  // Derive open/closed from the trading calendar rather than a possibly-absent flag.
  const regular = meta.currentTradingPeriod?.regular;
  const nowSec = Date.now() / 1000;
  let marketState = meta.marketState || null;
  if (regular?.start && regular?.end) {
    marketState = nowSec >= regular.start && nowSec <= regular.end ? "REGULAR" : "CLOSED";
  }

  return {
    symbol,
    name: meta.shortName || meta.longName || symbol,
    price: round(price),
    prevClose: round(prevClose),
    change: round(change),
    changePct: round(changePct),
    currency: meta.currency || "USD",
    exchange: meta.fullExchangeName || meta.exchangeName || null,
    dayHigh: round(meta.regularMarketDayHigh),
    dayLow: round(meta.regularMarketDayLow),
    fiftyTwoWeekHigh: round(meta.fiftyTwoWeekHigh),
    fiftyTwoWeekLow: round(meta.fiftyTwoWeekLow),
    marketState,
    nextOpen: meta.currentTradingPeriod?.regular?.start ? meta.currentTradingPeriod.regular.start * 1000 : null,
    regularMarketTime: meta.regularMarketTime ? meta.regularMarketTime * 1000 : null,
    volume: meta.regularMarketVolume ?? last?.volume ?? null,
    candles,
  };
}

/** Quote + sparkline for every sidebar row. One request per symbol. */
export async function fetchWatchlist(marketDefs) {
  const rows = await pooled(marketDefs, 6, async (def) => {
    const data = await fetchChart(def.symbol, "1mo", "1d");
    const closes = data.candles.map((c) => c.close);
    return {
      symbol: def.symbol,
      name: def.name,
      short: def.short,
      category: def.category,
      currency: def.currency,
      price: data.price,
      change: data.change,
      changePct: data.changePct,
      marketState: data.marketState,
      spark: closes.slice(-30),
    };
  });

  return rows.filter(Boolean);
}
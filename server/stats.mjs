/** Pure technical statistics used by both the heuristic and AI analysis paths. */

export function logReturns(closes) {
  const out = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0 && closes[i] > 0) out.push(Math.log(closes[i] / closes[i - 1]));
  }
  return out;
}

export function stdev(xs) {
  if (xs.length < 2) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1));
}

export const sma = (xs, n) => (xs.length < n ? null : xs.slice(-n).reduce((a, b) => a + b, 0) / n);

export function rsi(closes, period = 14) {
  if (closes.length < period + 1) return 50;
  let gain = 0;
  let loss = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gain += d;
    else loss -= d;
  }
  const rs = loss === 0 ? 100 : gain / loss;
  return 100 - 100 / (1 + rs);
}

/** One-stop technical summary for a symbol. */
export function computeStats(candles) {
  const closes = candles.map((c) => c.close).filter((n) => typeof n === "number");
  const rets = logReturns(closes);
  const price = closes.at(-1) ?? 0;

  const ret = (days) =>
    closes.length > days && closes.at(-days - 1)
      ? ((price - closes.at(-days - 1)) / closes.at(-days - 1)) * 100
      : 0;

  const dailyVol = stdev(rets);
  const ma20 = sma(closes, 20);
  const ma50 = sma(closes, 50);

  // Trend strength: short move measured in units of its own noise.
  const r5 = ret(5) / 100;
  const r20 = ret(20) / 100;
  const noise = dailyVol * Math.sqrt(5) || 1e-6;
  const momentum = Math.tanh(r5 / noise);
  const trend = Math.tanh(r20 / ((dailyVol * Math.sqrt(20)) || 1e-6));

  const vsMa20 = ma20 ? ((price - ma20) / ma20) * 100 : 0;
  const vsMa50 = ma50 ? ((price - ma50) / ma50) * 100 : 0;
  const rsi14 = rsi(closes, 14);

  const volumes = candles.map((c) => c.volume || 0);
  const avgVol = volumes.length ? volumes.slice(-21, -1).reduce((a, b) => a + b, 0) / Math.max(1, volumes.slice(-21, -1).length) : 0;
  const volTrend = avgVol ? ((volumes.at(-1) - avgVol) / avgVol) * 100 : 0;

  const periodHigh = Math.max(...closes);
  const periodLow = Math.min(...closes);

  return {
    price,
    ret1: ret(1),
    ret5: ret(5),
    ret20: ret(20),
    ret60: ret(60),
    dailyVol: dailyVol * 100,
    annualizedVol: dailyVol * Math.sqrt(252) * 100,
    ma20,
    ma50,
    vsMa20,
    vsMa50,
    rsi14,
    momentum,
    trend,
    volTrend,
    periodHigh,
    periodLow,
    avgVolume: avgVol,
    candles,
  };
}
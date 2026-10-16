/** Technical statistics. Pure functions, runs anywhere (browser/server). */

export function logReturns(closes: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0 && closes[i] > 0) out.push(Math.log(closes[i] / closes[i - 1]));
  }
  return out;
}

export function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1));
}

export const sma = (xs: number[], n: number): number | null =>
  xs.length < n ? null : xs.slice(-n).reduce((a, b) => a + b, 0) / n;

export function rsi(closes: number[], period = 14): number {
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

export interface Stats {
  price: number;
  ret1: number;
  ret5: number;
  ret20: number;
  ret60: number;
  dailyVol: number;
  annualizedVol: number;
  ma20: number | null;
  ma50: number | null;
  vsMa20: number;
  vsMa50: number;
  rsi14: number;
  momentum: number;
  trend: number;
  volTrend: number;
  periodHigh: number;
  periodLow: number;
  avgVolume: number;
  closes: number[];
}

export function computeStats(closesIn: number[]): Stats {
  const closes = closesIn.filter((n) => typeof n === "number" && Number.isFinite(n));
  const rets = logReturns(closes);
  const price = closes.at(-1) ?? 0;

  const ret = (days: number) =>
    closes.length > days && closes.at(-days - 1)
      ? ((price - closes.at(-days - 1)!) / closes.at(-days - 1)!) * 100
      : 0;

  const dailyVol = stdev(rets);
  const ma20 = sma(closes, 20);
  const ma50 = sma(closes, 50);

  const r5 = ret(5) / 100;
  const r20 = ret(20) / 100;
  const noise = dailyVol * Math.sqrt(5) || 1e-6;
  const momentum = Math.tanh(r5 / noise);
  const trend = Math.tanh(r20 / (dailyVol * Math.sqrt(20) || 1e-6));

  const vsMa20 = ma20 ? ((price - ma20) / ma20) * 100 : 0;
  const vsMa50 = ma50 ? ((price - ma50) / ma50) * 100 : 0;
  const rsi14 = rsi(closes, 14);

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
    volTrend: 0,
    periodHigh: closes.length ? Math.max(...closes) : 0,
    periodLow: closes.length ? Math.min(...closes) : 0,
    avgVolume: 0,
    closes,
  };
}

/** Volume trend needs the raw candles, so it is applied separately. */
export function applyVolumeStats(stats: Stats, volumes: number[]): Stats {
  const recent = volumes.slice(-21, -1);
  const avgVol = recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : 0;
  const last = volumes.at(-1) ?? 0;
  return {
    ...stats,
    avgVolume: avgVol,
    volTrend: avgVol ? ((last - avgVol) / avgVol) * 100 : 0,
  };
}

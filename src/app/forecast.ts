/** Probabilistic price forecast — the "cone". */

import type { Stats } from "./stats";
import type { NewsAgg } from "./lexicon";
import type { Forecast, ForecastPoint } from "../types";

const Z = { p10: -1.2816, p25: -0.6745, p75: 0.6745, p90: 1.2816 };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const round = (n: number) => (Number.isFinite(n) ? Math.round(n * 100) / 100 : 0);

export function buildForecast({
  price,
  pUp,
  stats,
  newsAgg,
  horizon = 20,
}: {
  price: number;
  pUp: number;
  stats: Stats;
  newsAgg: NewsAgg;
  horizon?: number;
}): Forecast {
  const dailyVol = Math.max((stats?.dailyVol || 1) / 100, 0.004);
  const edge = (pUp - 50) / 50;

  // Drift is conviction-scaled, damped, then capped at 1.5x daily volatility.
  const newsDrift = (newsAgg?.newsScore || 0) * 0.5;
  const signal = edge * newsDrift + 0.3 * (stats?.momentum || 0) + 0.15 * (stats?.trend || 0);
  const drift = clamp(0.55 * signal * dailyVol, -1.5 * dailyVol, 1.5 * dailyVol);

  const path: ForecastPoint[] = [];
  for (let k = 1; k <= horizon; k++) {
    const median = price * Math.exp(drift * k);
    const sigma = dailyVol * Math.sqrt(k);
    path.push({
      day: k,
      median: round(median),
      p10: round(median * Math.exp(Z.p10 * sigma)),
      p25: round(median * Math.exp(Z.p25 * sigma)),
      p75: round(median * Math.exp(Z.p75 * sigma)),
      p90: round(median * Math.exp(Z.p90 * sigma)),
    });
  }

  const end = path.at(-1)!;
  return {
    horizon,
    driftPctPerDay: Number((drift * 100).toFixed(4)),
    volatilityPctPerDay: Number((dailyVol * 100).toFixed(4)),
    medianEnd: end.median,
    expectedLow: end.p10,
    expectedHigh: end.p90,
    expectedChangePct: round(((end.median / price - 1) * 100)),
    rangeChangePct: round(((end.p90 / price - 1) * 100)),
    bandWidthPct: round(((end.p90 - end.p10) / price) * 100),
    path,
  };
}

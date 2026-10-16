/**
 * Probabilistic price forecast ("the cone").
 * Produces a median path plus p10/p25/p75/p90 bands for a given horizon so the
 * chart can show *where it could go* and *how likely* each path is.
 */

const Z = { p10: -1.2816, p25: -0.6745, p75: 0.6745, p90: 1.2816 };

/**
 * @param {number} price    last close
 * @param {number} pUp      model probability that price is higher at the horizon (0-100)
 * @param {object} stats    technical stats (dailyVol, momentum, trend)
 * @param {object} newsAgg  aggregate news signal
 * @param {number} horizon  trading days to project
 */
export function buildForecast({ price, pUp, stats, newsAgg, horizon = 20 }) {
  const dailyVol = Math.max((stats?.dailyVol || 1) / 100, 0.004);
  const edge = (pUp - 50) / 50; // -1 … 1

  // Drift = conviction-scaled and damped. Markets rarely hand over full momentum,
  // so the signal is attenuated, then capped at 1.5x daily volatility per session.
  const newsDrift = (newsAgg?.newsScore || 0) * 0.5;
  const signal =
    edge * newsDrift + 0.3 * (stats?.momentum || 0) + 0.15 * (stats?.trend || 0);
  const drift = clamp(0.55 * signal * dailyVol, -1.5 * dailyVol, 1.5 * dailyVol);

  const path = [];
  for (let k = 1; k <= horizon; k++) {
    const median = price * Math.exp(drift * k);
    const sigma = dailyVol * Math.sqrt(k);
    path.push({
      k,
      day: k,
      median,
      p10: median * Math.exp(Z.p10 * sigma),
      p25: median * Math.exp(Z.p25 * sigma),
      p75: median * Math.exp(Z.p75 * sigma),
      p90: median * Math.exp(Z.p90 * sigma),
      sigma,
    });
  }

  const end = path.at(-1);
  return {
    horizon,
    driftPctPerDay: Number((drift * 100).toFixed(4)),
    volatilityPctPerDay: Number((dailyVol * 100).toFixed(4)),
    medianEnd: round(medianOf(end.median)),
    expectedLow: round(end.p10),
    expectedHigh: round(end.p90),
    expectedChangePct: round(((end.median / price - 1) * 100)),
    rangeChangePct: round(((end.p90 / price - 1) * 100)),
    bandWidthPct: round(((end.p90 - end.p10) / price) * 100),
    path: path.map((p) => ({
      day: p.day,
      median: round(p.median),
      p10: round(p.p10),
      p25: round(p.p25),
      p75: round(p.p75),
      p90: round(p.p90),
    })),
  };
}

const medianOf = (v) => v;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const round = (n) => (Number.isFinite(n) ? Math.round(n * 100) / 100 : null);
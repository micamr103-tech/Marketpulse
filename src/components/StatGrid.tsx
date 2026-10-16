import { motion } from "framer-motion";
import { cx, fmtCompact, fmtNum, fmtPct, fmtPrice } from "../lib/format";
import type { Analysis, Forecast, MarketDetail } from "../types";

interface Props {
  detail: MarketDetail;
  analysis: Analysis | null;
  forecast: Forecast | null;
}

/** Key figures under the chart — the numbers a trader actually scans. */
export default function StatGrid({ detail, analysis, forecast }: Props) {
  const { quote } = detail;
  // The deep-analysis payload carries the full stat set (MA, daily vol, momentum).
  const stats = { ...detail.stats, ...(analysis?.stats ?? {}) };
  const range = (quote.fiftyTwoWeekHigh ?? 0) - (quote.fiftyTwoWeekLow ?? 0);
  const pos = range > 0 ? ((quote.price - (quote.fiftyTwoWeekLow ?? 0)) / range) * 100 : 50;

  const tiles = [
    {
      label: "Day range",
      value: `${fmtPrice(quote.dayLow, quote.currency)} – ${fmtPrice(quote.dayHigh, quote.currency)}`,
      sub: quote.exchange ?? "",
      tone: 0,
    },
    {
      label: "52-week range",
      value: `${fmtPrice(quote.fiftyTwoWeekLow, quote.currency)} – ${fmtPrice(quote.fiftyTwoWeekHigh, quote.currency)}`,
      sub: `${pos.toFixed(0)}% of range`,
      bar: pos,
      tone: pos > 55 ? 1 : pos < 45 ? -1 : 0,
    },
    {
      label: "Volume",
      value: fmtCompact(quote.volume),
      sub: stats.volTrend ? `${fmtPct(stats.volTrend, 0)} vs 20d avg` : "",
      tone: stats.volTrend > 15 ? 1 : stats.volTrend < -15 ? -1 : 0,
    },
    {
      label: "RSI (14)",
      value: fmtNum(stats.rsi14, 0),
      sub: stats.rsi14 > 70 ? "overbought" : stats.rsi14 < 30 ? "oversold" : "neutral",
      bar: stats.rsi14,
      tone: stats.rsi14 > 70 ? -1 : stats.rsi14 < 30 ? 1 : 0,
    },
    {
      label: "Volatility (ann.)",
      value: `${fmtNum(stats.annualizedVol, 0)}%`,
      sub: `${fmtNum(stats.dailyVol, 2)}% per day`,
      tone: (stats.annualizedVol ?? 0) > 50 ? -1 : 0,
    },
    {
      label: "vs 20-day MA",
      value: fmtPct(stats.vsMa20),
      sub: stats.ma20 ? `MA20 ${fmtPrice(stats.ma20, quote.currency)}` : "",
      tone: stats.vsMa20 > 0 ? 1 : -1,
    },
    {
      label: "Expected move",
      value: forecast ? fmtPct(forecast.expectedChangePct) : "—",
      sub: forecast ? `${forecast.horizon} trading days` : "",
      tone: forecast ? (forecast.expectedChangePct > 0 ? 1 : -1) : 0,
      accent: true,
    },
    {
      label: "80% confidence band",
      value: forecast ? `${fmtPrice(forecast.expectedLow, quote.currency)} – ${fmtPrice(forecast.expectedHigh, quote.currency)}` : "—",
      sub: forecast ? `±${fmtNum(forecast.bandWidthPct / 2, 1)}% from spot` : "",
      tone: 0,
      accent: true,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((t, i) => (
        <motion.div
          key={t.label}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.045, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          whileHover={{ y: -3 }}
          className={cx(
            "glass-soft rounded-2xl p-3.5 transition-colors hover:border-white/12",
            t.accent && "border-[#7aa2ff]/18 bg-[#7aa2ff]/[0.04]"
          )}
        >
          <p className="text-[10.5px] uppercase tracking-[0.14em] text-mute">{t.label}</p>
          <p
            className={cx(
              "tnum mt-1.5 text-[15px] font-semibold leading-tight",
              t.tone > 0 ? "text-bull" : t.tone < 0 ? "text-bear" : "text-chalk"
            )}
          >
            {t.value}
          </p>
          {typeof t.bar === "number" && (
            <div className="relative mt-2 h-1 overflow-hidden rounded-full bg-white/8">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, Math.max(2, t.bar))}%` }}
                transition={{ delay: 0.2 + i * 0.045, duration: 0.8, ease: "easeOut" }}
                className={cx("h-full rounded-full", t.tone > 0 ? "bg-bull" : t.tone < 0 ? "bg-bear" : "bg-white/45")}
              />
            </div>
          )}
          {t.sub && <p className="tnum mt-1.5 text-[11px] text-mute">{t.sub}</p>}
        </motion.div>
      ))}
    </div>
  );
}
import { motion } from "framer-motion";
import { ArrowDownRight, ArrowUpRight, CandlestickChart, LineChart, Radio } from "lucide-react";
import VerdictCard from "./VerdictCard";
import PriceChart from "./PriceChart";
import StatGrid from "./StatGrid";
import NewsFeed from "./NewsFeed";
import { cx, fmtPrice, fmtPct } from "../lib/format";
import { useCountUp } from "../lib/hooks";
import { useIsPhone } from "../lib/useIsPhone";
import type { EngineStatus } from "../App";
import type { Analysis, MarketDetail } from "../types";

const RANGES = [
  { key: "1mo", label: "1M" },
  { key: "3mo", label: "3M" },
  { key: "6mo", label: "6M" },
  { key: "1y", label: "1Y" },
  { key: "5y", label: "5Y" },
];

interface Props {
  detail: MarketDetail;
  analysis: Analysis | null;
  loading: boolean;
  analysisLoading: boolean;
  range: string;
  setRange: (r: string) => void;
  mode: "line" | "candles";
  setMode: (m: "line" | "candles") => void;
  engine: EngineStatus;
}

export default function MarketView({
  detail,
  analysis,
  loading,
  analysisLoading,
  range,
  setRange,
  mode,
  setMode,
  engine,
}: Props) {
  const { quote, def } = detail;
  const price = useCountUp(quote.price ?? 0, 800, 2);
  const up = quote.changePct >= 0;
  const phone = useIsPhone();
  const pad = phone ? "px-3" : "";
  const chartHeight = phone ? 250 : 380;

  return (
    <div className={cx("space-y-4 pb-10", pad)}>
      {/* Market header */}
      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-wrap items-end justify-between gap-4"
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <h1 className="truncate text-2xl font-extrabold tracking-tight sm:text-3xl">{def.name}</h1>
            <span className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-[10.5px] text-mute">
              {def.symbol}
            </span>
            <span
              className={cx(
                "hidden items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] capitalize sm:flex",
                quote.marketState === "REGULAR"
                  ? "border-bull/25 bg-bull/8 text-bull"
                  : "border-white/10 bg-white/4 text-mute"
              )}
            >
              <Radio className="h-2.5 w-2.5" />
              {quote.marketState === "REGULAR" ? "Market open" : "Closed"}
            </span>
          </div>
          <p className="mt-1 text-xs text-mute">
            {def.category} · {quote.currency}
            {quote.exchange ? ` · ${quote.exchange}` : ""}
          </p>
        </div>

        <div className="text-right">
          <motion.p
            key={quote.symbol}
            initial={{ opacity: 0, x: 14 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.45 }}
            className={cx("tnum text-3xl font-extrabold leading-none tracking-tight sm:text-[38px]", up ? "text-bull" : "text-bear")}
          >
            {fmtPrice(price, quote.currency)}
          </motion.p>
          <p className={cx("mt-1.5 flex items-center justify-end gap-1 text-sm font-semibold", up ? "text-bull" : "text-bear")}>
            {up ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
            <span className="tnum">
              {quote.change >= 0 ? "+" : ""}
              {quote.change?.toFixed(2)}
            </span>
            <span className="tnum">({fmtPct(quote.changePct)})</span>
            <span className="text-[11px] font-normal text-mute">today</span>
          </p>
        </div>
      </motion.header>

      {/* Verdict */}
      <VerdictCard detail={detail} analysis={analysis} loading={analysisLoading} />

      {/* Chart */}
      <motion.section
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        className="glass rounded-3xl p-4 sm:p-5"
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1 rounded-xl border border-white/8 bg-white/[0.03] p-0.5">
            {RANGES.map((r) => (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                className={cx(
                  "relative rounded-[10px] px-2.5 py-1.5 text-[11.5px] font-semibold transition-colors",
                  range === r.key ? "text-chalk" : "text-mute hover:text-chalk"
                )}
              >
                {range === r.key && (
                  <motion.span
                    layoutId="range-pill"
                    className="absolute inset-0 rounded-[10px] bg-white/10"
                    transition={{ type: "spring", stiffness: 420, damping: 32 }}
                  />
                )}
                <span className="relative">{r.label}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            {analysis?.forecast && (
              <span className="tnum hidden rounded-full border border-[#7aa2ff]/20 bg-[#7aa2ff]/8 px-2.5 py-1 text-[11px] text-[#7aa2ff] sm:inline">
                {analysis.forecast.horizon}d projection · {fmtPct(analysis.forecast.expectedChangePct)} median
              </span>
            )}            <div className="flex items-center gap-1 rounded-xl border border-white/8 bg-white/[0.03] p-0.5">
              {([
                { k: "line", icon: LineChart, label: "Line" },
                { k: "candles", icon: CandlestickChart, label: "Candles" },
              ] as const).map((m) => (
                <button
                  key={m.k}
                  onClick={() => setMode(m.k)}
                  title={m.label}
                  className={cx(
                    "relative rounded-[10px] p-1.5 transition-colors",
                    mode === m.k ? "text-chalk" : "text-mute hover:text-chalk"
                  )}
                >
                  {mode === m.k && (
                    <motion.span
                      layoutId="mode-pill"
                      className="absolute inset-0 rounded-[10px] bg-white/10"
                      transition={{ type: "spring", stiffness: 420, damping: 32 }}
                    />
                  )}
                  <m.icon className="relative h-3.5 w-3.5" />
                </button>
              ))}
            </div>
          </div>
        </div>

        {loading && !quote.candles.length ? (
          <div className="h-[250px] w-full rounded-2xl skeleton sm:h-[380px]" />
        ) : (
          <PriceChart
            quote={quote}
            forecast={analysis?.forecast ?? null}
            currency={quote.currency}
            mode={mode}
            height={chartHeight}
          />
        )}
      </motion.section>

      {/* Stats */}
      <StatGrid detail={detail} analysis={analysis} forecast={analysis?.forecast ?? null} />

      {/* News */}
      <motion.div
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.14, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      >
        <NewsFeed
          items={analysis?.news ?? detail.news}
          loading={loading}
          aiScored={analysis?.verdict.engine === "ollama"}
          model={analysis?.verdict.model ?? null}
        />
      </motion.div>

      {/* Engine status strip */}
      <p className="mt-6 text-center text-[11px] text-mute/70">
        Analysis by {engine.label} · {engine.ondevice.status === "ready" && "on-device model cached for offline use"} 
      </p>
    </div>
  );
}

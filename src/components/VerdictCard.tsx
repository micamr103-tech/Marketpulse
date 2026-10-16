import { motion } from "framer-motion";
import { Sparkles, TrendingUp, TrendingDown, Minus, ShieldAlert, Loader2 } from "lucide-react";
import ProbabilityGauge from "./ProbabilityGauge";
import { cx, timeAgo } from "../lib/format";
import type { Analysis, Driver, MarketDetail } from "../types";

interface Props {
  detail: MarketDetail;
  analysis: Analysis | null;
  loading: boolean;
}

/** The AI verdict: a dial, a narrative, and the reasons behind it. */
export default function VerdictCard({ detail, analysis, loading }: Props) {
  const v = analysis?.verdict;

  return (
    <motion.section
      layout
      className="glass relative overflow-hidden rounded-3xl p-5 sm:p-6"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
    >
      <AmbientTint direction={v?.direction} />

      <div className="relative grid gap-6 lg:grid-cols-[288px_1fr]">
        {/* Dial */}
        <div className="flex flex-col items-center justify-center">
          <div className="flex items-center gap-2 self-start rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[10.5px] uppercase tracking-[0.16em] text-mute">
            <Sparkles className="h-3 w-3 text-[#7aa2ff]" />
            AI verdict
          </div>

          {v && !loading ? (
            <>
              <ProbabilityGauge
                probability={v.probabilityUp}
                confidence={v.confidence}
                direction={v.direction}
              />
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                <DirectionPill direction={v.direction} />
                <span className="tnum rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-mute">
                  {v.confidence.toFixed(0)}% confidence
                </span>
                <span className="tnum rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-mute">
                  {v.articlesScored ?? v.sources} on topic
                </span>
              </div>
            </>
          ) : (
            <div className="flex h-[200px] w-[280px] flex-col items-center justify-center gap-3">
              <Loader2 className="h-7 w-7 animate-spin text-[#7aa2ff]" />
              <p className="text-sm text-mute">
                {detail.news.length
                  ? `Reading ${detail.news.length} articles…`
                  : "Fetching coverage…"}
              </p>
              <div className="flex gap-1.5">
                {[0, 1, 2].map((i) => (
                  <motion.span
                    key={i}
                    className="h-1.5 w-1.5 rounded-full bg-[#7aa2ff]"
                    animate={{ opacity: [0.2, 1, 0.2], y: [0, -4, 0] }}
                    transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.16 }}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Narrative */}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-mute">
            <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5">
              {v?.engine === "ollama"
                ? `Ollama · ${v.model}`
                : v?.engine === "on-device"
                ? "On-device AI"
                : v
                ? "Built-in engine"
                : "Analysing"}
            </span>
            {v?.timeHorizon && (
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5">{v.timeHorizon}</span>
            )}
            {v && <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5">updated {timeAgo(v.generatedAt)}</span>}
          </div>

          <h2 className="mt-3 text-balance text-2xl font-bold leading-snug tracking-tight sm:text-[28px]">
            {v ? (
              <motion.span
                key={v.headline}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45 }}
              >
                {v.headline}
              </motion.span>
            ) : (
              <span className="text-mute">Reading the tape on {detail.def.name}…</span>
            )}
          </h2>

          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-mute">
            {v?.summary ?? "Gathering headlines and price action. The model is weighing what is genuinely new information against what the market has already priced in."}
          </p>

          {/* Drivers */}
          <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
            {(v?.drivers ?? [0, 1].map(() => null)).map((d, i) =>
              d ? (
                <DriverRow key={d.title + i} d={d} index={i} />
              ) : (
                <div key={i} className="h-[68px] rounded-2xl border border-white/5 skeleton" />
              )
            )}
          </div>

          {/* Risks */}
          {v && v.risks.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.25 }}
              className="mt-4 rounded-2xl border border-white/6 bg-white/[0.02] p-3.5"
            >
              <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-mute">
                <ShieldAlert className="h-3.5 w-3.5" />
                What would break this call
              </p>
              <ul className="space-y-1">
                {v.risks.map((r) => (
                  <li key={r} className="flex gap-2 text-[13px] leading-relaxed text-mute">
                    <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-white/25" />
                    <span className="text-balance">{r}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          )}
        </div>
      </div>
    </motion.section>
  );
}

function AmbientTint({ direction }: { direction?: string }) {
  const color = direction === "bullish" ? "34,211,165" : direction === "bearish" ? "255,77,109" : "122,162,255";
  return (
    <div
      className="pointer-events-none absolute -right-24 -top-32 h-80 w-80 rounded-full opacity-[0.18] blur-[90px]"
      style={{ background: `radial-gradient(circle, rgba(${color},1) 0%, transparent 70%)` }}
    />
  );
}

function DirectionPill({ direction }: { direction: string }) {
  const Icon = direction === "bullish" ? TrendingUp : direction === "bearish" ? TrendingDown : Minus;
  return (
    <span
      className={cx(
        "flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize",
        direction === "bullish" && "bg-bull/12 text-bull",
        direction === "bearish" && "bg-bear/12 text-bear",
        direction === "neutral" && "bg-white/6 text-mute"
      )}
    >
      <Icon className="h-3 w-3" />
      {direction}
    </span>
  );
}

function DriverRow({ d, index }: { d: Driver; index: number }) {
  const tone =
    d.impact === "positive" ? "text-bull" : d.impact === "negative" ? "text-bear" : "text-mute";
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 + index * 0.07, duration: 0.4 }}
      className="group relative overflow-hidden rounded-2xl border border-white/6 bg-white/[0.02] p-3 transition-colors hover:border-white/12 hover:bg-white/[0.04]"
    >
      <div className="flex items-start gap-2">
        <span className={cx("mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full", tone === "text-bull" ? "bg-bull" : tone === "text-bear" ? "bg-bear" : "bg-mute")} />
        <div className="min-w-0">
          <p className="text-[13.5px] font-semibold leading-snug text-chalk">{d.title}</p>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-mute">{d.detail}</p>
        </div>
      </div>
      <div className="mt-2 h-[3px] overflow-hidden rounded-full bg-white/6">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.round(d.weight * 100)}%` }}
          transition={{ delay: 0.25 + index * 0.07, duration: 0.7, ease: "easeOut" }}
          className={cx("h-full rounded-full", d.impact === "positive" ? "bg-bull" : d.impact === "negative" ? "bg-bear" : "bg-white/35")}
        />
      </div>
    </motion.div>
  );
}
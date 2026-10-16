import { useEffect, useMemo, useRef, useState } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { motion } from "framer-motion";
import { fmtPrice, fmtPct, cx } from "../lib/format";
import type { Forecast, ForecastPoint, Quote } from "../types";

const M = { top: 18, right: 16, bottom: 10, left: 10 };
const YW_WIDE = 62; // YAxis width on desktop
const YW_NARROW = 46; // …and on a phone, where every pixel counts
const XH = 26; // XAxis height

interface Props {
  quote: Quote;
  forecast: Forecast | null;
  currency: string;
  mode: "line" | "candles";
  height?: number;
}


interface Row {
  t: number;
  close: number | null;
  o?: number | null;
  h?: number | null;
  l?: number | null;
  c?: number | null;
  volume?: number;
}

export default function PriceChart({ quote, forecast, currency, mode, height = 380 }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: height });
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width } = entry.contentRect;
      if (width > 0) setSize((s) => (s.w === width ? s : { ...s, w: width }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const rows = useMemo<Row[]>(
    () =>
      quote.candles.map((c) => ({
        t: c.t,
        close: c.close,
        o: c.open,
        h: c.high,
        l: c.low,
        c: c.close,
        volume: c.volume,
      })),
    [quote.candles]
  );

  const domain = useMemo<[number, number]>(() => {
    const vals: number[] = [];
    for (const r of rows) {
      if (typeof r.close === "number") vals.push(r.close);
      if (typeof r.h === "number") vals.push(r.h);
      if (typeof r.l === "number") vals.push(r.l);
    }
    if (forecast) {
      for (const p of forecast.path) vals.push(p.p10, p.p90, p.median);
    }
    if (!vals.length) return [0, 1];
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const pad = (max - min) * 0.09 || Math.abs(max) * 0.05 || 1;
    return [min - pad, max + pad];
  }, [rows, forecast]);

  const narrow = size.w < 520;
  const YW = narrow ? YW_NARROW : YW_WIDE;
  const plotW = Math.max(10, size.w - M.left - M.right - YW);
  const plotH = Math.max(10, size.h - M.top - M.bottom - XH);
  const startT = rows[0]?.t ?? 0;
  const endT = forecast && rows.length ? rows.at(-1)!.t + (forecast.horizon + 2) * 86_400_000 : rows.at(-1)?.t ?? 1;

  const xs = (t: number) => M.left + ((t - startT) / (endT - startT || 1)) * plotW;
  const ys = (v: number) => M.top + ((domain[1] - v) / (domain[1] - domain[0] || 1)) * plotH;

  const maxVol = Math.max(...rows.map((r) => r.volume ?? 0), 1);

  /* ── Cone geometry ─────────────────────────────────────────────────── */
  const cone = useMemo(() => {
    if (!forecast || !rows.length) return null;
    const lastT = rows.at(-1)!.t;
    const spot = rows.at(-1)!.close ?? 0;
    const pts: ForecastPoint[] = [
      { day: 0, median: spot, p10: spot, p25: spot, p75: spot, p90: spot },
      ...forecast.path,
    ];
    const px = (day: number) => xs(lastT + day * 86_400_000);

    const outerTop = pts.map((p) => `${px(p.day).toFixed(1)},${ys(p.p90).toFixed(1)}`);
    const outerBottom = [...pts].reverse().map((p) => `${px(p.day).toFixed(1)},${ys(p.p10).toFixed(1)}`);
    const innerTop = pts.map((p) => `${px(p.day).toFixed(1)},${ys(p.p75).toFixed(1)}`);
    const innerBottom = [...pts].reverse().map((p) => `${px(p.day).toFixed(1)},${ys(p.p25).toFixed(1)}`);
    const median = pts.map((p) => `${px(p.day).toFixed(1)},${ys(p.median).toFixed(1)}`);

    return {
      outerPath: `M${outerTop.join("L")}L${outerBottom.join("L")}Z`,
      innerPath: `M${innerTop.join("L")}L${innerBottom.join("L")}Z`,
      medianPath: `M${median.join("L")}`,
      splitX: px(0),
      endX: px(forecast.horizon),
      endTop: ys(pts.at(-1)!.p90),
      endBottom: ys(pts.at(-1)!.p10),
      endMedian: ys(pts.at(-1)!.median),
      end: pts.at(-1)!,
      lastT,
    };
  }, [forecast, rows, plotW, plotH, domain, size.w]);

  /* ── Candles, drawn with our own pixel mapping ─────────────────────── */
  const candles = useMemo(() => {
    if (mode !== "candles") return null;
    const slot = plotW / Math.max(1, rows.length);
    const bw = Math.max(2, Math.min(14, slot * 0.62));
    return rows
      .map((r) => {
        if (r.o == null || r.h == null || r.l == null || r.c == null) return null;
        const cx = xs(r.t);
        const yO = ys(r.o);
        const yC = ys(r.c);
        const up = r.c >= r.o;
        return {
          cx,
          wickTop: ys(r.h),
          wickBottom: ys(r.l),
          bodyTop: Math.min(yO, yC),
          bodyH: Math.max(1.5, Math.abs(yC - yO)),
          bw,
          up,
          t: r.t,
        };
      })
      .filter(Boolean) as {
      cx: number;
      wickTop: number;
      wickBottom: number;
      bodyTop: number;
      bodyH: number;
      bw: number;
      up: boolean;
      t: number;
    }[];
  }, [mode, rows, plotW, domain, size.w]);

  const tone = quote.changePct >= 0 ? "#22d3a5" : "#ff4d6d";

  return (
    <div ref={wrapRef} className="relative w-full" style={{ height }}>
      <div className="wipe-in h-full w-full">
        <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={rows}
          margin={M}
          onMouseMove={(state) => {
            const idx = state?.activeTooltipIndex;
            setHover(typeof idx === "number" ? idx : null);
          }}
          onMouseLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id="price-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={tone} stopOpacity={0.3} />
              <stop offset="100%" stopColor={tone} stopOpacity={0} />
            </linearGradient>
          </defs>

          <CartesianGrid stroke="rgba(255,255,255,0.045)" vertical={false} />

          <XAxis
            dataKey="t"
            type="number"
            domain={[startT, endT]}
            scale="time"
            height={XH}
            tickFormatter={(t) =>
              new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" })
            }
            tick={{ fill: "#6b7a90", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            minTickGap={46}
          />
          <YAxis
            domain={domain}
            orientation="right"
            width={YW}
            tick={{ fill: "#6b7a90", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => {
              const abs = Math.abs(v);
              if (abs >= 1000) return v.toLocaleString("en-US", { maximumFractionDigits: 0 });
              if (abs >= 1) return v.toFixed(2);
              return v.toFixed(abs >= 0.01 ? 4 : 6);
            }}
          />
          <YAxis yAxisId="vol" domain={[0, maxVol * 6]} hide />

          <Bar yAxisId="vol" dataKey="volume" fill="rgba(255,255,255,0.07)" isAnimationActive={false} />

          {mode === "line" && (
            <Area
              dataKey="close"
              stroke={tone}
              strokeWidth={2}
              fill="url(#price-fill)"
              isAnimationActive={false}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 0, fill: tone }}
            />
          )}

          <Tooltip
            cursor={{ stroke: "rgba(255,255,255,0.22)", strokeWidth: 1, strokeDasharray: "3 3" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const r = payload[0].payload as Row;
              const idx = rows.findIndex((x) => x.t === r.t);
              const base = rows[Math.max(0, idx - 1)]?.close;
              const chg = typeof r.close === "number" && base ? ((r.close - base) / base) * 100 : 0;
              return (
                <div className="glass rounded-xl px-3 py-2 text-xs shadow-2xl">
                  <p className="mb-1 font-medium text-chalk">
                    {new Date(r.t).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                  <p className={cx("tnum text-sm font-semibold", r.close != null && r.close < (base ?? r.close) ? "text-bear" : "text-bull")}>
                    {fmtPrice(r.close, currency)}
                  </p>
                  <p className={cx("tnum mt-0.5 text-[11px]", chg >= 0 ? "text-bull" : "text-bear")}>
                    {fmtPct(chg)} vs prev
                  </p>
                </div>
              );
            }}
          />
        </ComposedChart>
      </ResponsiveContainer>
      </div>

      {/* ── Candles / cone overlay ─────────────────────────────────── */}
      {(candles || (cone && size.w > 0)) && (
        <svg
          className="pointer-events-none absolute inset-0"
          width={size.w}
          height={size.h}
          style={{ overflow: "visible" }}
        >
          <defs>
            <clipPath id="hist-clip">
              <motion.rect
                x={0}
                y={0}
                width={cone ? cone.splitX : size.w}
                height={size.h}
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
                style={{ transformOrigin: "left center" }}
              />
            </clipPath>
            {cone && (
              <>
                <linearGradient id="cone-outer" x1={cone.splitX} y1="0" x2={size.w} y2="0" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#7aa2ff" stopOpacity={0.06} />
                  <stop offset="100%" stopColor="#7aa2ff" stopOpacity={0.2} />
                </linearGradient>
                <linearGradient id="cone-inner" x1={cone.splitX} y1="0" x2={size.w} y2="0" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#7aa2ff" stopOpacity={0.1} />
                  <stop offset="100%" stopColor="#7aa2ff" stopOpacity={0.4} />
                </linearGradient>
                <linearGradient id="cone-veil" x1={cone.splitX} y1="0" x2={size.w} y2="0" gradientUnits="userSpaceOnUse">
                  <stop offset="0%" stopColor="#7aa2ff" stopOpacity={0} />
                  <stop offset="100%" stopColor="#7aa2ff" stopOpacity={0.55} />
                </linearGradient>
                <clipPath id="cone-clip">
                  <motion.rect
                    x={cone.splitX}
                    y={0}
                    height={size.h}
                    initial={{ width: 0 }}
                    animate={{ width: Math.max(0, cone.endX - cone.splitX) }}
                    transition={{ duration: 1.5, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
                  />
                </clipPath>
              </>
            )}
          </defs>

          {/* candlesticks (drawn here for pixel-perfect control) */}
          {candles && (
            <g clipPath="url(#hist-clip)">
              {candles.map((c, i) => (
                <g key={c.t}>
                  <line
                    x1={c.cx}
                    x2={c.cx}
                    y1={c.wickTop}
                    y2={c.wickBottom}
                    stroke={c.up ? "#22d3a5" : "#ff4d6d"}
                    strokeWidth={1}
                    opacity={0.75}
                  />
                  <motion.rect
                    x={c.cx - c.bw / 2}
                    width={c.bw}
                    rx={0.5}
                    fill={c.up ? "#22d3a5" : "#0a0e15"}
                    stroke={c.up ? "#22d3a5" : "#ff4d6d"}
                    strokeWidth={1}
                    initial={{ y: c.bodyTop + c.bodyH, height: 0 }}
                    animate={{ y: c.bodyTop, height: c.bodyH }}
                    transition={{ duration: 0.5, delay: 0.1 + i * 0.012, ease: "easeOut" }}
                  />
                </g>
              ))}
            </g>
          )}

          {cone && (
            <>
              {/* region divider */}
              <motion.line
                x1={cone.splitX}
                x2={cone.splitX}
                y1={M.top - 4}
                y2={M.top + plotH}
                stroke="rgba(122,162,255,0.35)"
                strokeDasharray="3 4"
                strokeWidth={1}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
              />

              <g clipPath="url(#cone-clip)">
                <path d={cone.outerPath} fill="url(#cone-outer)" />
                <path d={cone.innerPath} fill="url(#cone-inner)" />
                <path d={cone.outerPath} fill="none" stroke="url(#cone-veil)" strokeWidth={1} />
              </g>

              {/* median path */}
              <motion.path
                d={cone.medianPath}
                fill="none"
                stroke="#7aa2ff"
                strokeWidth={2}
                strokeDasharray="7 5"
                strokeLinecap="round"
                clipPath="url(#cone-clip)"
                initial={{ pathLength: 0, opacity: 0 }}
                animate={{ pathLength: 1, opacity: 1 }}
                transition={{ duration: 1.5, delay: 0.45, ease: [0.22, 1, 0.36, 1] }}
              />

              {/* end-of-horizon target marker */}
              <motion.g
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.5, duration: 0.5 }}
              >
                <line
                  x1={cone.endX}
                  x2={cone.endX}
                  y1={cone.endTop}
                  y2={cone.endBottom}
                  stroke="#7aa2ff"
                  strokeWidth={3}
                  strokeLinecap="round"
                  opacity={0.85}
                />
                <circle cx={cone.endX} cy={cone.endMedian} r={3.5} fill="#7aa2ff" />
              </motion.g>

              <motion.text
                x={cone.splitX + 6}
                y={M.top + 10}
                fill="#7aa2ff"
                fontSize={10}
                letterSpacing="0.08em"
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 0.8, x: 0 }}
                transition={{ delay: 0.9 }}
              >
                AI PROJECTION
              </motion.text>
            </>
          )}
        </svg>
      )}

      {/* hover readout */}
      {hover != null && rows[hover] && (
        <div className="pointer-events-none absolute right-16 top-2 rounded-lg border border-white/10 bg-black/70 px-2.5 py-1 text-[11px] text-mute backdrop-blur">
          {new Date(rows[hover].t).toLocaleString("en-US", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </div>
      )}

      {/* legend */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8 }}
        className="pointer-events-none absolute bottom-1 left-3 flex flex-wrap items-center gap-x-3 gap-y-1"
      >
        {forecast && <LegendRow color="#7aa2ff" label="AI median" dash />}
        {forecast && <LegendRow color="#7aa2ff" label="50% band" />}
        {forecast && <LegendRow color="#7aa2ff" label="80% band" faded />}
        {mode === "line" && <LegendRow color={tone} label="Market price" />}
      </motion.div>
    </div>
  );
}

function LegendRow({ color, label, dash, faded }: { color: string; label: string; dash?: boolean; faded?: boolean }) {
  return (
    <span className="flex items-center gap-1.5 text-[10.5px] text-mute">
      <svg width="16" height="6">
        <line
          x1="0"
          y1="3"
          x2="16"
          y2="3"
          stroke={color}
          strokeWidth={dash ? 2 : 7}
          strokeDasharray={dash ? "4 3" : undefined}
          opacity={faded ? 0.3 : dash ? 1 : 0.8}
          strokeLinecap="round"
        />
      </svg>
      {label}
    </span>
  );
}

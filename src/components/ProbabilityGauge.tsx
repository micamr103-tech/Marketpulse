import { motion } from "framer-motion";
import { useCountUp } from "../lib/hooks";
import { cx } from "../lib/format";
import type { Direction } from "../types";

interface Props {
  probability: number; // 0 – 100
  confidence: number; // 0 – 100
  direction: Direction;
  size?: number;
  loading?: boolean;
}

/**
 * The probability dial: how likely this market is to finish higher.
 * Sweeps from bearish (left) to bullish (right).
 */
export default function ProbabilityGauge({
  probability,
  confidence,
  direction,
  size = 260,
  loading = false,
}: Props) {
  const animated = useCountUp(probability, 1000, 1);
  const R = 100;
  const CX = 130;
  const CY = 118;
  const START = -180; // deg, pointing left
  const SPAN = 180; // deg, sweep to the right

  const angle = START + (Math.max(0, Math.min(100, animated)) / 100) * SPAN;
  const tone =
    direction === "bullish" ? "#22d3a5" : direction === "bearish" ? "#ff4d6d" : "#7d8ba1";

  const arcPath = (fromDeg: number, toDeg: number) => {
    const p = (deg: number) => {
      const rad = (deg * Math.PI) / 180;
      return [CX + R * Math.cos(rad), CY + R * Math.sin(rad)];
    };
    const [x1, y1] = p(fromDeg);
    const [x2, y2] = p(toDeg);
    const large = Math.abs(toDeg - fromDeg) > 180 ? 1 : 0;
    return `M${x1.toFixed(2)},${y1.toFixed(2)} A${R},${R} 0 ${large} 1 ${x2.toFixed(2)},${y2.toFixed(2)}`;
  };

  const ticks = [0, 25, 50, 75, 100];
  const needleLength = R - 16;
  const nRad = (angle * Math.PI) / 180;

  return (
    <div className="relative select-none" style={{ width: size, height: size * 0.62 }}>
      <svg viewBox="0 0 260 170" className="w-full h-full overflow-visible">
        <defs>
          <linearGradient id="gauge-track" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#ff4d6d" stopOpacity={0.55} />
            <stop offset="50%" stopColor="#7d8ba1" stopOpacity={0.3} />
            <stop offset="100%" stopColor="#22d3a5" stopOpacity={0.55} />
          </linearGradient>
          <filter id="gauge-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="5" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* track */}
        <path d={arcPath(START, START + SPAN)} stroke="rgba(255,255,255,0.07)" strokeWidth={16} fill="none" strokeLinecap="round" />
        <motion.path
          d={arcPath(START, START + SPAN)}
          stroke="url(#gauge-track)"
          strokeWidth={16}
          fill="none"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
        />

        {/* confidence overlay */}
        <motion.path
          d={arcPath(START, START + SPAN)}
          stroke={tone}
          strokeWidth={3}
          fill="none"
          strokeLinecap="round"
          opacity={0.85}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: Math.max(0.02, confidence / 100) }}
          transition={{ duration: 1.3, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
        />

        {/* ticks */}
        {ticks.map((t) => {
          const deg = START + (t / 100) * SPAN;
          const rad = (deg * Math.PI) / 180;
          const inner = R - 10;
          const outer = R - (t % 50 === 0 ? 16 : 13);
          return (
            <line
              key={t}
              x1={CX + inner * Math.cos(rad)}
              y1={CY + inner * Math.sin(rad)}
              x2={CX + outer * Math.cos(rad)}
              y2={CY + outer * Math.sin(rad)}
              stroke="rgba(255,255,255,0.25)"
              strokeWidth={t === 50 ? 2 : 1}
            />
          );
        })}

        {/* needle — attributes are animated directly (SVG transforms are unreliable) */}
        <motion.line
          x1={CX}
          y1={CY}
          x2={CX + needleLength * Math.cos(nRad)}
          y2={CY + needleLength * Math.sin(nRad)}
          stroke={tone}
          strokeWidth={2.5}
          strokeLinecap="round"
          filter="url(#gauge-glow)"
          animate={{
            x2: CX + needleLength * Math.cos((angle * Math.PI) / 180),
            y2: CY + needleLength * Math.sin((angle * Math.PI) / 180),
          }}
          transition={{ type: "spring", stiffness: 55, damping: 14, mass: 0.9 }}
        />
        <motion.circle
          r={4.5}
          fill={tone}
          animate={{
            cx: CX + needleLength * Math.cos((angle * Math.PI) / 180),
            cy: CY + needleLength * Math.sin((angle * Math.PI) / 180),
          }}
          transition={{ type: "spring", stiffness: 55, damping: 14, mass: 0.9 }}
        />

        <circle cx={CX} cy={CY} r={7} fill="#0a0e15" stroke={tone} strokeWidth={2} />
      </svg>

      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center -mb-1">
        <div className="flex items-baseline gap-0.5">
          <span
            className={cx(
              "tnum text-[44px] font-bold leading-none tracking-tight",
              direction === "bullish" ? "text-bull" : direction === "bearish" ? "text-bear" : "text-chalk"
            )}
          >
            {loading ? "—" : animated.toFixed(1)}
          </span>
          <span className="text-xl font-semibold text-mute">%</span>
        </div>
        <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-mute">probability higher</p>
      </div>
    </div>
  );
}
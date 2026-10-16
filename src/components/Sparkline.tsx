import { motion } from "framer-motion";
import { sparkPath } from "../lib/format";

interface Props {
  values: number[];
  width?: number;
  height?: number;
  stroke?: string;
  className?: string;
  id: string;
}

/** Tiny trend line used in the sidebar rows. */
export default function Sparkline({ values, width = 72, height = 26, stroke, className, id }: Props) {
  const up = (values.at(-1) ?? 0) >= (values[0] ?? 0);
  const color = stroke ?? (up ? "#22d3a5" : "#ff4d6d");
  const d = sparkPath(values, width, height - 4);
  const areaD = d ? `${d} L${width},${height} L0,${height} Z` : "";

  return (
    <svg width={width} height={height} className={className} viewBox={`0 0 ${width} ${height}`}>
      <defs>
        <linearGradient id={`spark-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.35} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      {areaD && <path d={areaD} fill={`url(#spark-${id})`} />}
      {d && (
        <motion.path
          d={d}
          fill="none"
          stroke={color}
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 0.9, ease: "easeOut" }}
        />
      )}
    </svg>
  );
}
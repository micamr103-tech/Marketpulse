import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import { IOS, spring } from "./ios";

interface Props {
  symbol: string;
  name: string;
  value: string;
  delta?: string;
  up?: boolean;
  badge?: string;
  badgeTone?: "pos" | "neg" | "neu";
  spark?: React.ReactNode;
  selected?: boolean;
  onClick: () => void;
  index: number;
}

/** A row in an iOS inset-grouped list. */
export default function IOSRow({
  name,
  symbol,
  value,
  delta,
  up = true,
  badge,
  badgeTone = "neu",
  spark,
  selected,
  onClick,
  index,
}: Props) {
  return (
    <motion.button
      onClick={onClick}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...spring, delay: Math.min(index * 0.018, 0.35) }}
      whileTap={{ scale: 0.975, backgroundColor: IOS.color.surfacePressed }}
      className="relative flex w-full items-center gap-3 overflow-hidden px-4 py-[11px] text-left"
      style={{ background: selected ? "rgba(10,132,255,0.12)" : "transparent" }}
    >
      {selected && (
        <motion.span
          layoutId="ios-row-selection"
          transition={spring}
          className="absolute inset-0"
          style={{ background: "rgba(10,132,255,0.1)" }}
        />
      )}

      <div className="relative min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[16px] font-medium leading-tight">{name}</span>
          {symbol && (
            <span className="shrink-0 text-[11px] font-medium" style={{ color: IOS.color.tertiary }}>
              {symbol}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-baseline gap-1.5">
          <span className="tnum text-[15px] font-medium tabular-nums" style={{ color: IOS.color.secondary }}>
            {value}
          </span>
          {delta && (
            <span
              className="tnum text-[13px] font-semibold tabular-nums"
              style={{ color: up ? IOS.color.green : IOS.color.red }}
            >
              {delta}
            </span>
          )}
        </div>
      </div>

      {spark && <div className="relative shrink-0 opacity-90">{spark}</div>}

      {badge && (
        <motion.span
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={spring}
          className="tnum relative shrink-0 rounded-[7px] px-1.5 py-[3px] text-[12px] font-bold tabular-nums"
          style={{
            color: badgeTone === "pos" ? IOS.color.green : badgeTone === "neg" ? IOS.color.red : IOS.color.secondary,
            background:
              badgeTone === "pos"
                ? "rgba(48,209,88,0.15)"
                : badgeTone === "neg"
                ? "rgba(255,69,58,0.15)"
                : IOS.color.fill,
          }}
        >
          {badge}
        </motion.span>
      )}

      <ChevronRight className="relative h-4 w-4 shrink-0" style={{ color: IOS.color.tertiary }} strokeWidth={2.5} />
    </motion.button>
  );
}

/** Inset grouped section — the container iOS uses for list content. */
export function Group({
  header,
  footer,
  children,
  className = "",
}: {
  header?: string;
  footer?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      {header && (
        <p
          className="px-4 pb-1.5 pt-4 text-[13px] font-semibold uppercase tracking-[0.04em]"
          style={{ color: IOS.color.secondary }}
        >
          {header}
        </p>
      )}
      <div
        className="mx-3 overflow-hidden rounded-[14px]"
        style={{ background: IOS.color.surface }}
      >
        {children}
      </div>
      {footer && (
        <p className="px-4 pt-1.5 text-[12px] leading-snug" style={{ color: IOS.color.tertiary }}>
          {footer}
        </p>
      )}
    </section>
  );
}

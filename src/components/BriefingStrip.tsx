import { motion } from "framer-motion";
import { Globe } from "lucide-react";
import { cx, timeAgo } from "../lib/format";
import type { NewsItem } from "../types";

interface Props {
  items: NewsItem[];
  onPick: (symbol: string) => void;
}

/** Macro headline ticker — what is moving the whole market right now. */
export default function BriefingStrip({ items, onPick }: Props) {
  if (!items.length) return null;

  const loop = [...items, ...items];

  return (
    <div className="relative flex items-center gap-3 overflow-hidden rounded-2xl border border-white/6 bg-white/[0.02] py-2 pl-3 pr-8">
      <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-[#7aa2ff]/20 bg-[#7aa2ff]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#7aa2ff]">
        <Globe className="h-3 w-3" />
        Macro
      </span>

      <div className="relative min-w-0 flex-1 overflow-hidden">
        <motion.div
          className="flex w-max gap-8"
          animate={{ x: ["0%", "-50%"] }}
          transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
        >
          {loop.map((item, i) => {
            const s = item.sentiment ?? 0;
            return (
              <button
                key={`${item.id}-${i}`}
                onClick={() => item.symbol && onPick(item.symbol)}
                className="group flex shrink-0 items-center gap-2 text-left"
              >
                <span
                  className={cx(
                    "h-1.5 w-1.5 shrink-0 rounded-full",
                    s > 0.1 ? "bg-bull" : s < -0.1 ? "bg-bear" : "bg-white/30"
                  )}
                />
                <span className="max-w-[420px] truncate text-[12.5px] text-chalk/75 transition-colors group-hover:text-chalk">
                  {item.title}
                </span>
                <span className="shrink-0 text-[10.5px] text-mute">
                  {item.market} · {timeAgo(item.publishedAt)}
                </span>
              </button>
            );
          })}
        </motion.div>
      </div>

      <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-[#070a10] to-transparent" />
    </div>
  );
}
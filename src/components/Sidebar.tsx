import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Search, X } from "lucide-react";
import Sparkline from "./Sparkline";
import { cx, fmtPrice, fmtPct } from "../lib/format";
import { useCountUp } from "../lib/hooks";
import type { Category, Conviction, MarketRow } from "../types";

interface Props {
  markets: MarketRow[];
  conviction: Record<string, Conviction>;
  selected: string;
  onSelect: (symbol: string) => void;
  loading: boolean;
}

type SortKey = "conviction" | "change" | "name";

const CATS: { key: Category | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "indices", label: "Indices" },
  { key: "stocks", label: "Stocks" },
  { key: "crypto", label: "Crypto" },
  { key: "commodities", label: "Commod." },
];

const SORTS: { key: SortKey; label: string }[] = [
  { key: "conviction", label: "AI conviction" },
  { key: "change", label: "% change" },
  { key: "name", label: "A–Z" },
];

export default function Sidebar({ markets, conviction, selected, onSelect, loading }: Props) {
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<Category | "all">("all");
  const [sort, setSort] = useState<SortKey>("conviction");
  const listRef = useRef<HTMLDivElement>(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = markets.filter(
      (m) =>
        (cat === "all" || m.category === cat) &&
        (!q || m.name.toLowerCase().includes(q) || m.symbol.toLowerCase().includes(q))
    );

    list = [...list].sort((a, b) => {
      if (sort === "name") return a.short.localeCompare(b.short);
      if (sort === "change") return Math.abs(b.changePct) - Math.abs(a.changePct);
      const ca = conviction[a.symbol]?.probabilityUp;
      const cb = conviction[b.symbol]?.probabilityUp;
      if (ca == null && cb == null) return Math.abs(b.changePct) - Math.abs(a.changePct);
      if (ca == null) return 1;
      if (cb == null) return -1;
      return Math.abs(cb - 50) - Math.abs(ca - 50);
    });

    return list;
  }, [markets, query, cat, sort, conviction]);

  // Keep the selected market visible when the list reorders.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-symbol="${CSS.escape(selected)}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selected, sort, cat]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Search */}
      <div className="shrink-0 px-4 pt-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mute" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search markets…"
            className="w-full rounded-xl border border-white/8 bg-white/[0.04] py-2.5 pl-9 pr-9 text-sm text-chalk outline-none transition-all placeholder:text-mute focus:border-[#7aa2ff]/45 focus:bg-white/[0.06] focus:shadow-[0_0_0_3px_rgba(122,162,255,0.09)]"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-mute transition-colors hover:bg-white/10 hover:text-chalk"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {/* Categories */}
        <div className="no-scrollbar mt-3 flex gap-1 overflow-x-auto pb-1">
          {CATS.map((c) => (
            <button
              key={c.key}
              onClick={() => setCat(c.key)}
              className={cx(
                "relative shrink-0 rounded-lg px-2.5 py-1.5 text-[11.5px] font-medium transition-colors",
                cat === c.key ? "text-chalk" : "text-mute hover:text-chalk"
              )}
            >
              {cat === c.key && (
                <motion.span
                  layoutId="cat-pill"
                  className="absolute inset-0 rounded-lg border border-white/10 bg-white/8"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                />
              )}
              <span className="relative">{c.label}</span>
            </button>
          ))}
        </div>

        {/* Sort */}
        <div className="mt-2 flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.14em] text-mute">
          Sort
          <div className="ml-auto flex gap-1">
            {SORTS.map((s) => (
              <button
                key={s.key}
                onClick={() => setSort(s.key)}
                className={cx(
                  "rounded-md px-1.5 py-0.5 normal-case tracking-normal transition-colors",
                  sort === s.key ? "bg-white/10 text-chalk" : "hover:bg-white/5 hover:text-chalk"
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Rows */}
      <div ref={listRef} className="mt-3 min-h-0 flex-1 overflow-y-auto px-2.5 pb-4">
        {loading && !markets.length ? (
          <div className="space-y-2 px-1.5">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="h-[58px] rounded-2xl skeleton" style={{ animationDelay: `${i * 0.08}s` }} />
            ))}
          </div>
        ) : !rows.length ? (
          <p className="px-2 py-10 text-center text-sm text-mute">No markets match “{query}”.</p>
        ) : (
          <motion.ul layout className="space-y-1">
            <AnimatePresence mode="popLayout">
              {rows.map((m, i) => (
                <MarketRowItem
                  key={m.symbol}
                  row={m}
                  index={i}
                  selected={m.symbol === selected}
                  conviction={conviction[m.symbol]}
                  onSelect={onSelect}
                />
              ))}
            </AnimatePresence>
          </motion.ul>
        )}
      </div>
    </div>
  );
}

function MarketRowItem({
  row,
  index,
  selected,
  conviction,
  onSelect,
}: {
  row: MarketRow;
  index: number;
  selected: boolean;
  conviction?: Conviction;
  onSelect: (s: string) => void;
}) {
  const price = useCountUp(row.price ?? 0, 700, 2);
  const up = (row.changePct ?? 0) >= 0;
  const p = conviction?.probabilityUp;
  const tone = p == null ? "unknown" : p > 56 ? "pos" : p < 44 ? "neg" : "neu";

  return (
    <motion.li
      layout
      data-symbol={row.symbol}
      initial={{ opacity: 0, x: 18 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 18 }}
      transition={{ delay: Math.min(index * 0.022, 0.4), duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      <motion.button
        onClick={() => onSelect(row.symbol)}
        whileTap={{ scale: 0.975 }}
        className={cx(
          "relative w-full overflow-hidden rounded-2xl px-3 py-2.5 text-left transition-colors",
          selected ? "text-chalk" : "text-chalk/80 hover:bg-white/[0.045]"
        )}
      >
        {selected && (
          <motion.span
            layoutId="row-bg"
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            className="absolute inset-0 rounded-2xl border border-white/12 bg-white/[0.07]"
          >
            <motion.span
              className={cx(
                "absolute inset-y-0 left-0 w-[3px] rounded-full",
                up ? "bg-bull" : "bg-bear"
              )}
            />
          </motion.span>
        )}

        <div className="relative flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-[13.5px] font-semibold leading-tight">{row.short}</span>
              <span className="shrink-0 rounded bg-white/6 px-1 py-px font-mono text-[9.5px] text-mute">
                {row.symbol.replace(/[\^=].*$/, "")}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-1.5">
              <span className="tnum text-[12.5px] font-medium text-mute">
                {fmtPrice(price, row.currency)}
              </span>
              <span className={cx("tnum text-[11.5px] font-semibold", up ? "text-bull" : "text-bear")}>
                {fmtPct(row.changePct)}
              </span>
            </div>
          </div>

          <div className="shrink-0 opacity-90">
            <Sparkline values={row.spark ?? []} id={row.symbol} width={58} height={24} />
          </div>

          {/* AI conviction */}
          <div className="w-[52px] shrink-0 text-right">
            {p == null ? (
              <div className="ml-auto h-7 w-11 rounded-lg skeleton" />
            ) : (
              <motion.div
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ type: "spring", stiffness: 400, damping: 24 }}
                className={cx(
                  "tnum rounded-lg px-1.5 py-1 text-[11px] font-bold",
                  tone === "pos" && "bg-bull/12 text-bull",
                  tone === "neg" && "bg-bear/12 text-bear",
                  tone === "neu" && "bg-white/8 text-mute"
                )}
                title={`AI: ${p.toFixed(0)}% probability higher · ${conviction?.confidence?.toFixed(0) ?? "?"}% confidence`}
              >
                {p.toFixed(0)}%
              </motion.div>
            )}
          </div>
        </div>
      </motion.button>
    </motion.li>
  );
}
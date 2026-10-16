import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Search, X } from "lucide-react";
import IOSRow, { Group } from "./IOSRow";
import Sparkline from "../components/Sparkline";
import { fmtPrice, fmtPct } from "../lib/format";
import { IOS, spring } from "./ios";
import type { Category, Conviction, MarketRow } from "../types";

interface Props {
  markets: MarketRow[];
  conviction: Record<string, Conviction>;
  selected: string;
  onSelect: (s: string) => void;
  loading: boolean;
  onOpenSearch?: () => void;
}

const FILTERS: { key: Category | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "indices", label: "Indices" },
  { key: "stocks", label: "Stocks" },
  { key: "crypto", label: "Crypto" },
  { key: "commodities", label: "Commod." },
];

/** iOS-style Markets tab: a search field, a segmented filter and grouped rows. */
export default function MarketsPane({
  markets,
  conviction,
  selected,
  onSelect,
  loading,
  onOpenSearch,
}: Props) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Category | "all">("all");

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return markets
      .filter((m) => (filter === "all" || m.category === filter) && (!q || m.name.toLowerCase().includes(q) || m.symbol.toLowerCase().includes(q)))
      .sort((a, b) => Math.abs(conviction[b.symbol]?.probabilityUp ?? 50 - 50) - Math.abs(conviction[a.symbol]?.probabilityUp ?? 50 - 50));
  }, [markets, query, filter, conviction]);

  const grouped = useMemo(() => {
    const map = new Map<Category, MarketRow[]>();
    for (const r of rows) {
      const list = map.get(r.category) ?? [];
      list.push(r);
      map.set(r.category, list);
    }
    const order: Category[] = ["indices", "stocks", "crypto", "commodities"];
    return order.filter((c) => map.has(c)).map((c) => [c, map.get(c)!] as const);
  }, [rows]);

  return (
    <div className="pb-28">
      {/* inline search field */}
      <div className="px-3 pt-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: IOS.color.tertiary }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            onFocus={onOpenSearch}
            className="w-full rounded-[10px] py-2 pl-8 pr-8 text-[17px] outline-none transition-colors placeholder:text-[17px]"
            style={{ background: IOS.color.fill, color: IOS.color.label }}
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-0.5"
              style={{ background: IOS.color.fillStrong }}
            >
              <X className="h-3 w-3" style={{ color: IOS.color.label }} />
            </button>
          )}
        </div>
      </div>

      {/* segmented filter */}
      <div className="no-scrollbar mt-3 flex gap-1.5 overflow-x-auto px-3 pb-1">
        {FILTERS.map((f) => {
          const on = f.key === filter;
          return (
            <motion.button
              key={f.key}
              onClick={() => setFilter(f.key)}
              whileTap={{ scale: 0.94 }}
              className="relative shrink-0 rounded-full px-3.5 py-1.5 text-[14px] font-medium"
              style={{ background: on ? IOS.color.blue : IOS.color.fill, color: on ? "#fff" : IOS.color.label }}
            >
              {f.label}
            </motion.button>
          );
        })}
      </div>

      {loading && !markets.length ? (
        <div className="mt-4 space-y-2 px-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-[62px] animate-pulse rounded-[14px]" style={{ background: IOS.color.surface }} />
          ))}
        </div>
      ) : grouped.length === 0 ? (
        <p className="px-6 py-16 text-center text-[15px]" style={{ color: IOS.color.secondary }}>
          No markets match “{query}”.
        </p>
      ) : (
        grouped.map(([category, list]) => (
          <Group
            key={category}
            header={category === "commodities" ? "Commodities" : category.charAt(0).toUpperCase() + category.slice(1)}
            footer={category === "indices" ? "The number in the blue box is the model's probability that price ends higher." : undefined}
          >
            <div className="divide-y" style={{ borderColor: IOS.color.separator }}>
              {list.map((m, i) => {
                const p = conviction[m.symbol]?.probabilityUp;
                return (
                  <div key={m.symbol}>
                    <IOSRow
                      index={i}
                      name={m.short}
                      symbol={m.symbol.replace(/[\^=].*$/, "")}
                      value={fmtPrice(m.price, m.currency)}
                      delta={fmtPct(m.changePct)}
                      up={(m.changePct ?? 0) >= 0}
                      selected={m.symbol === selected}
                      onClick={() => onSelect(m.symbol)}
                      spark={<Sparkline values={m.spark ?? []} id={m.symbol} width={54} height={24} />}
                      badge={p != null ? `${p.toFixed(0)}%` : undefined}
                      badgeTone={p == null ? "neu" : p > 56 ? "pos" : p < 44 ? "neg" : "neu"}
                    />
                  </div>
                );
              })}
            </div>
          </Group>
        ))
      )}

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ ...spring, delay: 0.4 }}
        className="px-6 pt-6 text-center text-[12px]"
        style={{ color: IOS.color.tertiary }}
      >
        Probabilities are a statistical model output — not investment advice.
      </motion.p>
    </div>
  );
}

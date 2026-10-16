import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ExternalLink, Newspaper, Bot, ChevronDown, Search } from "lucide-react";
import { cx, timeAgo } from "../lib/format";
import type { NewsItem } from "../types";

interface Props {
  items: NewsItem[];
  loading: boolean;
  aiScored: boolean;
  model: string | null;
}

/** Articles the AI has read and scored. */
export default function NewsFeed({ items, loading, aiScored, model }: Props) {
  const [filter, setFilter] = useState<"all" | "positive" | "negative">("all");
  const neuralScored = items.some((i) => i.sentimentBy === "neural");

  const shown = items.filter((i) =>
    filter === "all" ? true : filter === "positive" ? (i.sentiment ?? 0) > 0.08 : (i.sentiment ?? 0) < -0.08
  );

  return (
    <section className="glass rounded-3xl p-5">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <Newspaper className="h-4.5 w-4.5 text-[#7aa2ff]" />
            News the AI read
          </h3>
          <p className="mt-0.5 text-xs text-mute">
            {items.length} articles · {items.filter((i) => i.read).length} fetched in full
            {aiScored ? ` · scored by ${model}` : neuralScored ? " · scored on-device" : " · scored by sentiment engine"}
          </p>
        </div>

        <div className="flex rounded-xl border border-white/8 bg-white/[0.03] p-0.5">
          {(["all", "positive", "negative"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cx(
                "relative rounded-[10px] px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                filter === f ? "text-chalk" : "text-mute hover:text-chalk"
              )}
            >
              {filter === f && (
                <motion.span
                  layoutId="news-filter"
                  className="absolute inset-0 rounded-[10px] bg-white/8"
                  transition={{ type: "spring", stiffness: 420, damping: 32 }}
                />
              )}
              <span className="relative">{f}</span>
            </button>
          ))}
        </div>
      </header>

      {loading && !items.length ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-[86px] rounded-2xl skeleton" style={{ animationDelay: `${i * 0.12}s` }} />
          ))}
        </div>
      ) : !shown.length ? (
        <p className="py-8 text-center text-sm text-mute">No articles match this filter.</p>
      ) : (
        <motion.ul layout className="space-y-2.5">
          <AnimatePresence mode="popLayout">
            {shown.map((item, i) => (
              <NewsCard key={item.id} item={item} index={i} />
            ))}
          </AnimatePresence>
        </motion.ul>
      )}
    </section>
  );
}

function NewsCard({ item, index }: { item: NewsItem; index: number }) {
  const [open, setOpen] = useState(false);
  const s = item.sentiment ?? 0;
  const tone = s > 0.08 ? "pos" : s < -0.08 ? "neg" : "neu";
  const hasDetail = Boolean(item.sentimentWhy || item.body || item.description || item.sentimentHits?.length);
  const preview = item.sentimentWhy || item.description || item.snippet || item.body || "";

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ delay: Math.min(index * 0.05, 0.5), duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="group overflow-hidden rounded-2xl border border-white/6 bg-white/[0.02] transition-colors hover:border-white/12 hover:bg-white/[0.035]"
    >
      <div className="flex gap-3 p-3.5">
        {/* sentiment bar */}
        <div className="flex w-9 shrink-0 flex-col items-center gap-1.5 pt-0.5">
          <div className="relative flex h-11 w-1.5 overflow-hidden rounded-full bg-white/8">
            <motion.div
              initial={{ scaleY: 0 }}
              animate={{ scaleY: Math.min(1, Math.abs(s) * 1.6 + 0.08) }}
              transition={{ delay: 0.15 + index * 0.04, duration: 0.6, ease: "easeOut" }}
              className={cx(
                "w-full rounded-full",
                tone === "pos" ? "bg-bull" : tone === "neg" ? "bg-bear" : "bg-white/30"
              )}
              style={{ transformOrigin: s < 0 ? "top" : "bottom" }}
            />
          </div>
          <span
            className={cx(
              "tnum text-[10.5px] font-bold",
              tone === "pos" ? "text-bull" : tone === "neg" ? "text-bear" : "text-mute"
            )}
          >
            {s > 0 ? "+" : ""}
            {s.toFixed(2)}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-mute">
            <span className="font-medium text-chalk/70">{item.source}</span>
            <span>·</span>
            <span>{timeAgo(item.publishedAt)}</span>
            {item.read && (
              <>
                <span>·</span>
                <span className="flex items-center gap-1 text-[#7aa2ff]">
                  <Bot className="h-3 w-3" />
                  full text read
                </span>
              </>
            )}
            <span>·</span>
            <span className="tnum">relevance {(item.relevance * 100).toFixed(0)}%</span>
            {item.onTopic === false && (
              <span className="rounded bg-white/6 px-1.5 py-px text-[10px] font-medium text-mute">
                general market
              </span>
            )}
            {item.sentimentBy === "ai" && (
              <span className="rounded bg-[#7aa2ff]/12 px-1.5 py-px text-[10px] font-semibold text-[#7aa2ff]">
                LLM
              </span>
            )}
            {item.sentimentBy === "neural" && (
              <span className="rounded bg-bull/12 px-1.5 py-px text-[10px] font-semibold text-bull">
                AI
              </span>
            )}
          </div>

          <a
            href={item.url}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-1 block text-[14.5px] font-medium leading-snug text-chalk transition-colors hover:text-[#7aa2ff]"
          >
            {item.title}
          </a>

          <AnimatePresence initial={false}>
            {open && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                className="overflow-hidden"
              >
                <p className="mt-2 border-l-2 border-white/10 pl-3 text-[13px] leading-relaxed text-mute">
                  {preview}
                </p>
                {item.sentimentHits?.length ? (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {item.sentimentHits.slice(0, 6).map((h) => (
                      <span
                        key={h.term}
                        className={cx(
                          "rounded-md border px-1.5 py-0.5 text-[10.5px]",
                          h.weight > 0
                            ? "border-bull/25 bg-bull/8 text-bull"
                            : "border-bear/25 bg-bear/8 text-bear"
                        )}
                      >
                        {h.term}
                      </span>
                    ))}
                  </div>
                ) : null}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-2 flex items-center gap-3">
            {hasDetail && (
              <button
                onClick={() => setOpen((o) => !o)}
                className="flex items-center gap-1 text-[11.5px] font-medium text-mute transition-colors hover:text-chalk"
              >
                <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.25 }}>
                  <ChevronDown className="h-3.5 w-3.5" />
                </motion.span>
                {open ? "Less" : "AI read"}
              </button>
            )}
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer noopener"
              className="flex items-center gap-1 text-[11.5px] text-mute transition-colors hover:text-[#7aa2ff]"
            >
              <ExternalLink className="h-3 w-3" />
              Open
            </a>
          </div>
        </div>
      </div>
    </motion.li>
  );
}

export function NewsSkeleton() {
  return (
    <div className="flex items-center gap-2 text-xs text-mute">
      <Search className="h-3.5 w-3.5" />
      searching…
    </div>
  );
}
/** News gathering + full-article reading, entirely client-side. */

import { netFetch, fetchJson, cache, dedupe } from "../net";
import { relevance, parseRss, idFor, isMarketCapable, isEditorialNoise } from "./rss";
import type { MarketDef, NewsItem } from "../../types";

/**
 * The wire.
 *
 * Every feed here is CORS-enabled, so they are fetched directly from the
 * browser — fast, free, no relay and no rate limit. (The older
 * `search.cnbc.com/rs/search/combinedcms/view.xml` endpoints now return an
 * empty channel, which is why the /id/.../device/rss form is used instead.)
 */
const WIRE_FEEDS = [
  { id: "econ", url: "https://www.cnbc.com/id/20910258/device/rss/rss.html", source: "CNBC" }, // CPI, Fed, inflation
  { id: "investing", url: "https://www.cnbc.com/id/100727362/device/rss/rss.html", source: "CNBC" }, // market-moving
  { id: "top", url: "https://www.cnbc.com/id/100003114/device/rss/rss.html", source: "CNBC" },
  { id: "tech", url: "https://www.cnbc.com/id/19854910/device/rss/rss.html", source: "CNBC" }, // AI, chips, software
  { id: "business", url: "https://www.cnbc.com/id/10000664/device/rss/rss.html", source: "CNBC" }, // earnings
  { id: "markets", url: "https://www.cnbc.com/id/15839135/device/rss/rss.html", source: "CNBC" }, // market commentary
  { id: "mw-top", url: "https://feeds.content.dowjones.io/public/rss/mw_topstories", source: "MarketWatch" },
  { id: "mw-live", url: "https://feeds.content.dowjones.io/public/rss/mw_realtimeheadlines", source: "MarketWatch" },
  { id: "nyt-biz", url: "https://rss.nytimes.com/services/xml/rss/nyt/Business.xml", source: "NYT" },
];

export interface RawItem {
  title: string;
  url: string;
  source: string;
  publishedAt: number;
  snippet: string;
  body?: string;
}

async function loadCnbc(): Promise<RawItem[]> {
  return loadWire();
}

/** Fetches every wire feed once, dedupes, and shares the result app-wide. */
export async function loadWire(): Promise<RawItem[]> {
  return dedupe("wire", async () => {
    const cached = cache.get<RawItem[]>("wire", 8 * 60_000);
    if (cached?.length) return cached;

    const feeds = await Promise.all(
      WIRE_FEEDS.map(async (f) => {
        const r = await netFetch(f.url, { timeoutMs: 9_000, retries: 0, priority: 1 });
        if (!r.ok) return [] as RawItem[];
        return parseRss(r.text).map((i) => ({ ...i, source: i.source || f.source }));
      })
    );

    const byTitle = new Map<string, RawItem>();
    for (const item of feeds.flat()) {
      const k = item.title.toLowerCase().split(" - ")[0].slice(0, 55);
      if (!byTitle.has(k)) byTitle.set(k, item);
    }
    const out = [...byTitle.values()];
    // Never cache an empty wire — one throttled fetch would otherwise leave the
    // app with no news for minutes.
    if (out.length) cache.set("wire", out);
    return out;
  });
}

/**
 * Ticker-tagged search. Yahoo returns `relatedTickers` for every story, which
 * lets us demand a direct hit on the exact symbol. The bare ticker performs far
 * better than a descriptive query — "NVDA" returns real NVDA news, whereas
 * "NVIDIA stock" returns investment listicles.
 */
async function fromYahooSearch(query: string, priority?: number): Promise<RawItem[]> {
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&newsCount=14&quotesCount=0&listsCount=0`;
  const data = await fetchJson<{
    news?: { title: string; link: string; publisher: string; providerPublishTime: number; relatedTickers: string[] }[];
  }>(url, { priority, retries: 2 });
  if (!data?.news) return [];
  return data.news.map((n) => ({
    title: n.title,
    url: n.link,
    source: n.publisher || "Yahoo Finance",
    publishedAt: (n.providerPublishTime || 0) * 1000 || Date.now(),
    snippet: "",
    tickers: n.relatedTickers,
  })) as RawItem[];
}

/**
 * Pages that return something other than the article: consent walls, cookie
 * banners, JS-required stubs. Reading one of these would feed the model pure
 * noise while claiming the article was "read in full", so they are rejected.
 */
const JUNK_MARKERS =
  /oops, something went wrong|skip to (main )?(content|navigation)|accept all cookies|we use cookies|enable javascript|privacy policy|sign in to continue|access denied|page not found|are you a robot|verify you are human/i;

/**
 * The reader returns markdown wrapped in site chrome: logo images, social
 * buttons, "related" links, newsletter pitches. Strip that so the model sees
 * the article itself — then reject only if nothing usable is left.
 */
function cleanMarkdown(md: string): string {
  const lines = md
    .split("\n")
    .map((l) =>
      l
        .replace(/!\[[^\]]*\]\([^)]*\)/g, "") // images
        .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1") // links -> their text
        .replace(/^[-*+]\s+/, "")
        .replace(/^#+\s*/, "")
        .replace(/[*_`>]/g, "")
        .replace(/\s+/g, " ")
        .trim()
    )
    .filter(Boolean);

  // Drop chrome: short lines with no sentence punctuation are nav labels,
  // tag lines, captions and share prompts rather than prose.
  const prose = lines.filter((l) => {
    if (l.length >= 90) return true;
    if (/[.!?]["')\]]?\s+[A-Z]/.test(l)) return true;
    return false;
  });

  return prose.join("\n").replace(/\n{2,}/g, "\n").trim();
}

function usableArticle(md: string): string | null {
  const text = cleanMarkdown(md);
  if (text.length < 400) return null;
  if (JUNK_MARKERS.test(text.slice(0, 600))) return null;
  // Still mostly navigation? Look for a reasonable ratio of sentences.
  const sentences = (text.match(/[.!?](\s|$)/g) || []).length;
  if (sentences < 4) return null;
  return text.slice(0, 2600);
}

/**
 * Read the article itself. The relay returns clean readable text, which is
 * exactly what the model needs — far better than a truncated description tag.
 */
async function readArticle(url: string, priority?: number): Promise<string | null> {
  if (!/^https?:/i.test(url)) return null;
  const r = await netFetch(url, { timeoutMs: 16_000, retries: 0, priority });
  if (!r.ok) return null;
  return usableArticle(r.text);
}

interface GatherOptions {
  limit?: number;
  /** Fetch and parse the full text of the top stories. */
  deep?: boolean;
  /** Skip the per-market search — use the shared macro feed only (free). */
  quick?: boolean;
  signal?: AbortSignal;
  priority?: number;
}

export async function gatherNews(def: MarketDef, options: GatherOptions = {}): Promise<NewsItem[]> {
  const { limit = 12, deep = true, quick = false, signal, priority } = options;
  const key = `news:${def.symbol}:${quick ? "q" : "f"}`;

  const cnbcPromise = loadCnbc();
  if (!quick) {
    const fresh = cache.get<NewsItem[]>(key, 5 * 60_000);
    if (fresh) return fresh;
  } else {
    const fresh = cache.get<NewsItem[]>(key, 10 * 60_000);
    if (fresh) return fresh;
  }

  // The bare ticker finds the right stories; indices use their quoted name.
  const bare = def.symbol.replace(/[\^=].*$/, "");
  const query = def.symbol.startsWith("^") ? `"${def.short}"` : bare;
  const cnbc = await cnbcPromise;
  const yahoo: RawItem[] = quick ? [] : await fromYahooSearch(query, priority).catch(() => [] as RawItem[]);
  if (signal?.aborted) return [];

  const seen = new Set<string>();
  const merged: (RawItem & { tickers?: string[] })[] = [];
  for (const item of [...yahoo, ...cnbc]) {
    const k = item.title.toLowerCase().split(" - ")[0].slice(0, 55);
    if (seen.has(k)) continue;
    seen.add(k);
    merged.push(item);
  }

  const now = Date.now();
  const scored = merged
    .filter(isMarketCapable)
    .filter((i) => !isEditorialNoise(i))
    .map((i) => ({ ...i, publishedAt: i.publishedAt || now, relevance: relevance(i, def) }))
    .filter((i) => now - i.publishedAt < 1000 * 60 * 60 * 24 * 8);

  // Stories that genuinely concern this market come first; the rest is only
  // general market context, kept to a minimum.
  const onTopic = scored
    .filter((i) => i.relevance >= 0.3)
    .sort((a, b) => b.relevance - a.relevance || b.publishedAt - a.publishedAt);
  const context = scored
    .filter((i) => i.relevance < 0.3)
    .sort((a, b) => b.publishedAt - a.publishedAt)
    .slice(0, Math.max(0, 3 - Math.min(3, onTopic.length)));

  const prelim = [...onTopic, ...context].slice(0, limit);

  if (deep) {
    // Only the top few, and only for the market the user is looking at —
    // each read is a relayed request, so this is the expensive part.
    const targets = prelim.slice(0, 3);
    await Promise.all(
      targets.map(async (item) => {
        if (signal?.aborted) return;
        const body = await readArticle(item.url, priority).catch(() => null);
        if (body) item.body = body;
      })
    );
  }

  const items: NewsItem[] = prelim.map((i) => ({
    id: idFor(i.url, i.title),
    title: i.title,
    url: i.url,
    source: i.source,
    publishedAt: i.publishedAt,
    snippet: i.snippet,
    body: i.body,
    relevance: Number(i.relevance.toFixed(3)),
    onTopic: i.relevance >= 0.3,
    /** Only these may be used as evidence — a direct ticker or title match. */
    strong: i.relevance >= 0.75,
    read: Boolean(i.body),
  }));

  if (items.length) cache.set(key, items);
  return items;
}

export async function gatherBriefing(symbols: MarketDef[]): Promise<NewsItem[]> {
  const items = (await loadWire()).filter(isMarketCapable);
  if (!items.length) return [];
  const byMarket = new Map<string, string>();
  for (const d of symbols) for (const a of d.aliases ?? []) byMarket.set(a.toLowerCase(), d.symbol);

  return [...items]
    .sort((a, b) => b.publishedAt - a.publishedAt)
    .slice(0, 24)
    .map((i) => {
      const hay = i.title.toLowerCase();
      const hit = [...byMarket.entries()].find(([alias]) => hay.includes(alias));
      return {
        id: idFor(i.url, i.title),
        title: i.title,
        url: i.url,
        source: i.source,
        publishedAt: i.publishedAt,
        snippet: "",
        relevance: hit ? 0.8 : 0.3,
        read: false,
        symbol: hit?.[1],
        market: hit ? hit[0].replace(/\b\w/g, (c) => c.toUpperCase()) : "Markets",
      } satisfies NewsItem;
    });
}

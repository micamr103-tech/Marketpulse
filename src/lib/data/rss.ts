/** RSS parsing + entity decoding (runs in the browser). */

import type { MarketDef } from "../../types";

/** Compact, collision-resistant id for an article URL. */
export function idFor(url: string, fallback = ""): string {
  const s = url || fallback;
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + c + i, 0x85ebca6b) >>> 0;
  }
  return (h1.toString(36) + h2.toString(36)).slice(0, 14);
}

export function stripEntities(input = ""): string {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/\s+/g, " ")
    .trim();
}

export interface RssItem {
  title: string;
  url: string;
  source: string;
  publishedAt: number;
  snippet: string;
}

export function parseRss(xml: string): RssItem[] {
  const out: RssItem[] = [];
  const blocks = xml.split(/<item>/i).slice(1);
  for (const b of blocks) {
    const pick = (tag: string) => {
      const m = b.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
      if (!m) return "";
      return stripEntities(m[1].replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, ""));
    };
    const title = pick("title");
    if (!title) continue;
    out.push({
      title,
      url: pick("link"),
      source: pick("source"), // left empty when absent; the caller knows the feed
      publishedAt: Date.parse(pick("pubDate")) || Date.now(),
      snippet: pick("description").slice(0, 400),
    });
  }
  return out;
}

/**
 * Editorial noise: listicles, "should you buy" pieces and compound-article
 * spam. They carry the right ticker but say nothing that moves the price, so
 * they are dropped before relevance is even considered.
 */
const LOW_QUALITY_SOURCE = /motley fool|simply wall st|24\/7 wall st|gurufocus|zacks|insider monkey|stockstory|tipranks|investing\.com|barchart/i;

const LOW_QUALITY_TITLE =
  /^(prediction|here'?s what|should you|is .* a (buy|sell)|could be worth|got \$\d|\d+ stocks|better buy|stock forecast|here'?s why .* (buy|sell)|i think|top \d+|\d+ best|\$\d+ investment|how i|why (i|you) (bought|bought|sold)|the .* case for and against)/i;

export function isEditorialNoise(item: { title: string; source?: string }): boolean {
  if (item.source && LOW_QUALITY_SOURCE.test(item.source)) return true;
  return LOW_QUALITY_TITLE.test(item.title.trim());
}

/**
 * How well an item is about this market, 0 → 1.
 *
 * A direct ticker hit from the provider's own `relatedTickers` is the strongest
 * signal we have — it means the story genuinely concerns this company — so it
 * is worth more than a name mentioned somewhere in the body.
 */
export function relevance(item: { title: string; snippet?: string; body?: string; tickers?: string[] }, def: MarketDef): number {
  const title = item.title.toLowerCase();
  const hay = `${item.title} ${item.snippet || ""} ${item.body || ""}`.toLowerCase();

  const myTicker = def.symbol.toUpperCase();
  const bare = def.symbol.replace(/[\^=].*$/, "").toUpperCase();
  const isIndex = def.symbol.startsWith("^");
  const tickerHit = item.tickers?.some((t) => t.toUpperCase() === myTicker || t.toUpperCase() === bare);

  const names = [def.short.toLowerCase(), ...(def.aliases ?? []).map((a) => a.toLowerCase())].filter(
    (n) => n.length >= 3
  );

  // Naming the market in the headline is unambiguous, for a company or an index.
  if (names.some((n) => title.includes(n))) return 1;

  // Index tickers (^GSPC) are attached to all kinds of single-stock stories, so
  // a bare index tag is much weaker evidence than a real company ticker.
  if (tickerHit) return isIndex ? 0.6 : 0.8;

  if (names.some((n) => hay.includes(n))) return 0.5;

  // No name match, but the story is squarely about this *kind* of market.
  const context = CONTEXT_TERMS[def.category] ?? CONTEXT_TERMS.indices;
  const hits = context.filter((t) => title.includes(t)).length;
  return hits >= 2 ? 0.3 : 0;
}

/** Words that make a story market news rather than general news. */
const CONTEXT_TERMS: Record<string, string[]> = {
  indices: ["stocks", "stock market", "s&p", "nasdaq", "dow", "wall street", "investors", "market", "rally", "selloff", "slump", "earnings", "index", "shares", "recession", "fed", "federal reserve", "inflation", "rates", "bonds", "yields"],
  stocks: ["stock", "stocks", "shares", "earnings", "revenue", "profit", "guidance", "valuation", "ipo", "buyback", "dividend", "nasdaq", "nyse", "analyst", "investors"],
  crypto: ["bitcoin", "btc", "ethereum", "ether", "crypto", "blockchain", "token", "solana", "stablecoin", "mining", "digital asset", "coin"],
  commodities: ["gold", "silver", "crude", "oil", "opec", "barrel", "commodity", "commodities", "natural gas", "copper", "wheat", "bullion", "refinery"],
};

/**
 * Columns that live in business sections but are not market news: personal
 * finance advice, local politics, lifestyle. Sitting next to a price chart
 * they are pure noise, so they never enter the feed.
 */
const COLUMN_PATTERNS = [
  /^ask a personal finance/i,
  /^the short answer/i,
  /^battle over/i,
  /^my (sister|brother|mother|father|wife|husband|son|daughter|friend|aunt|uncle|cousin|nephew|niece)/i,
  /^i asked/i,
  /^first person/i,
  /^we asked/i,
  /^the family/i,
  /^dining/i,
  /^wellness/i,
  /^how (to|do i)/i,
  /^what (do i|if|to do)/i,
  /quiz|crossword|headscratcher/i,
  /^a divorce/i,
  /^renting an apartment/i,
  /asks:/i,
  /^deals of the day/i,
  /^what to buy/i,
];

const ALL_MARKET_TERMS = [
  ...CONTEXT_TERMS.indices,
  ...CONTEXT_TERMS.stocks,
  ...CONTEXT_TERMS.crypto,
  ...CONTEXT_TERMS.commodities,
];

/** True only for stories that could plausibly move a market. */
export function isMarketCapable(item: { title: string; snippet?: string; body?: string }): boolean {
  if (COLUMN_PATTERNS.some((p) => p.test(item.title))) return false;
  const hay = `${item.title} ${item.snippet || ""} ${item.body || ""}`.toLowerCase();
  return ALL_MARKET_TERMS.some((t) => hay.includes(t));
}

/**
 * News aggregation + article reading.
 * Sources: Yahoo Finance search (rich metadata), Google News RSS (broad coverage).
 * For the top items we actually fetch the article page and extract its text so the
 * AI reasons over real content instead of just a headline.
 */

import { yfetch, pooled } from "./yahoo.mjs";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const stripHtml = (s = "") =>
  s
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

const metaContent = (html, patterns) => {
  for (const p of patterns) {
    const m = html.match(p);
    if (m?.[1]) {
      const v = stripHtml(m[1]);
      if (v) return v;
    }
  }
  return "";
};

function parseRss(xml) {
  const items = [];
  const blocks = xml.split(/<item>/).slice(1);
  for (const b of blocks) {
    const pick = (tag) => {
      const m = b.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"));
      if (!m) return "";
      return stripHtml(
        m[1]
          .replace(/^<!\[CDATA\[/, "")
          .replace(/\]\]>$/, "")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&amp;/g, "&")
      );
    };
    const title = pick("title");
    if (!title) continue;
    items.push({
      title,
      url: pick("link"),
      source: pick("source") || "News",
      publishedAt: Date.parse(pick("pubDate")) || null,
      snippet: pick("description").slice(0, 400),
    });
  }
  return items;
}

async function fromGoogleNews(query) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(
    `${query} when:7d`
  )}&hl=en-US&gl=US&ceid=US:en`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": UA } });
    const xml = await res.text();
    return parseRss(xml);
  } finally {
    clearTimeout(timer);
  }
}

async function fromYahooSearch(query) {
  try {
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(
      query
    )}&newsCount=14&quotesCount=0&listsCount=0`;
    const data = await yfetch(url);
    return (data?.news || []).map((n) => ({
      title: n.title,
      url: n.link,
      source: n.publisher || "Yahoo Finance",
      publishedAt: (n.providerPublishTime || 0) * 1000 || null,
      snippet: stripHtml(n.title),
      tickers: n.relatedTickers || [],
    }));
  } catch {
    return [];
  }
}

/** Fetch an article and pull out real prose for the AI to read. */
async function readArticle(url) {
  if (!url || !/^https?:/i.test(url)) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 9_000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "User-Agent": UA, "Accept": "text/html,application/xhtml+xml" },
    });
    if (!res.ok) return null;
    const ctype = res.headers.get("content-type") || "";
    if (!ctype.includes("html")) return null;
    const html = (await res.text()).slice(0, 600_000);

    const description = metaContent(html, [
      /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
    ]);

    const paragraphs = [...html.matchAll(/<p[^>]*>([\s\S]{40,2000}?)<\/p>/gi)]
      .map((m) => stripHtml(m[1]))
      .filter((t) => t.length > 60 && !/^(subscribe|sign up|cookie|privacy policy)/i.test(t));

    const text = paragraphs.slice(0, 14).join(" ").slice(0, 2200);
    if (!description && text.length < 80) return null;
    return { description, text };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** How strongly an article is about this specific market (0 → 1). */
export function relevance(item, def) {
  const hay = `${item.title} ${item.snippet || ""} ${item.text || ""}`.toLowerCase();
  const needles = [def.short.toLowerCase(), def.symbol.replace(/[\^=].*$/, "").toLowerCase(), ...def.aliases.map((a) => a.toLowerCase())];
  let score = 0;
  for (const n of new Set(needles)) {
    if (!n || n.length < 3) continue;
    if (hay.includes(n)) score += 1;
    if (item.title.toLowerCase().includes(n)) score += 1;
  }
  if (item.tickers?.some((t) => t.toUpperCase() === def.symbol.replace(/[\^=].*$/, ""))) score += 2;
  return Math.min(1, score / 4);
}

export async function gatherNews(def, { limit = 12, deep = true } = {}) {
  const query = `${def.short} ${def.symbol.replace(/[\^=].*$/, "")} stock`;
  const [yahoo, google] = await Promise.all([
    fromYahooSearch(query),
    fromGoogleNews(`${def.short} stock market`).catch(() => []),
  ]);

  const seen = new Set();
  const merged = [];
  for (const item of [...yahoo, ...google]) {
    const key = item.title.toLowerCase().slice(0, 60);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }

  const now = Date.now();
  const fresh = merged
    .map((i) => ({ ...i, publishedAt: i.publishedAt || now }))
    .filter((i) => now - i.publishedAt < 1000 * 60 * 60 * 24 * 8)
    .sort((a, b) => b.publishedAt - a.publishedAt)
    .slice(0, limit);

  // Deep-read the most relevant headlines so the AI has real text to work with.
  const prelim = fresh.map((i) => ({ ...i, relevance: relevance(i, def) }));
  prelim.sort((a, b) => b.relevance - a.relevance || b.publishedAt - a.publishedAt);

  if (deep) {
    const toRead = prelim.slice(0, 6);
    const read = await pooled(toRead, 4, (i) => readArticle(i.url));
    read.forEach((content, idx) => {
      if (content) {
        toRead[idx].text = content.text || null;
        toRead[idx].description = content.description || null;
      }
    });
  }

  return prelim
    .map((i) => ({
      id: Buffer.from(i.url || i.title).toString("base64url").slice(0, 22),
      title: i.title,
      url: i.url,
      source: i.source,
      publishedAt: i.publishedAt,
      snippet: i.description || i.snippet || "",
      description: i.description || null,
      body: (i.text || "").slice(0, 1800),
      relevance: Number(i.relevance.toFixed(3)),
      read: Boolean(i.text || i.description),
    }))
    .sort((a, b) => b.relevance - a.relevance || b.publishedAt - a.publishedAt);
}
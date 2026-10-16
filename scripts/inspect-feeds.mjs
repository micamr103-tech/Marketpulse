/** Scores the real CNBC feeds against each market, to see what we get. */
import { MARKETS } from "../src/app/markets.ts";

const FEEDS = [
  ["top", "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss25&id=100003114"],
  ["markets", "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss25&id=20910258"],
  ["tech", "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss25&id=19854910"],
  ["finance", "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss25&id=10001147"],
  ["economy", "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss25&id=20910258"],
  ["econo2", "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss25&id=15839135"],
];

const strip = (s = "") =>
  s
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();

function parse(xml) {
  return xml
    .split(/<item>/i)
    .slice(1)
    .map((b) => {
      const pick = (t) => {
        const m = b.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`, "i"));
        return m ? strip(m[1].replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "")) : "";
      };
      return { title: pick("title"), source: pick("source"), desc: strip(pick("description")) };
    })
    .filter((i) => i.title);
}

function relevance(item, def) {
  const hay = `${item.title} ${item.desc}`.toLowerCase();
  const needles = [def.short.toLowerCase(), def.symbol.replace(/[\^=].*$/, "").toLowerCase(), ...(def.aliases ?? []).map((a) => a.toLowerCase())];
  let score = 0;
  for (const n of new Set(needles)) {
    if (!n || n.length < 3) continue;
    if (hay.includes(n)) score += 1;
    if (item.title.toLowerCase().includes(n)) score += 1;
  }
  return Math.min(1, score / 4);
}

const all = [];
for (const [label, url] of FEEDS) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    const items = parse(await res.text());
    all.push(...items.map((i) => ({ ...i, feed: label })));
    console.log(`${label.padEnd(9)} ${items.length} items`);
  } catch (e) {
    console.log(`${label.padEnd(9)} FAILED ${e.message}`);
  }
}

const unique = [...new Map(all.map((i) => [i.title, i])).values()];
console.log(`\n${unique.length} unique headlines\n`);

for (const sym of ["^GSPC", "NVDA", "BTC-USD", "GC=F"]) {
  const def = MARKETS.find((m) => m.symbol === sym);
  const hits = unique
    .map((i) => ({ ...i, r: relevance(i, def) }))
    .filter((i) => i.r >= 0.25)
    .sort((a, b) => b.r - a.r);
  console.log(`=== ${def.short} — ${hits.length} on-topic ===`);
  hits.slice(0, 5).forEach((h) => console.log(`  ${h.r.toFixed(2)} [${h.feed}] ${h.title.slice(0, 88)}`));
  console.log();
}

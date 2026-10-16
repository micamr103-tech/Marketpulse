/**
 * Offline financial-sentiment engine.
 * Always available (no network, no model) and used as the baseline verdict.
 * Also scores every individual headline so the UI can colour-code them.
 */

import type { Stats } from "./stats";
import type { Direction, Driver, MarketDef, NewsItem } from "../types";

const POSITIVE: Record<string, string[]> = {
  "3": [
    "record high", "all-time high", "beat estimates", "beats estimates", "raised guidance",
    "raises guidance", "upgraded", "upgrade", "buyback", "profit surge", "record profit",
    "breakthrough", "approval", "approved", "strong demand", "exceeds expectations",
    "outperform", "bullish", "record revenue",
  ],
  "2": [
    "gain", "gains", "rise", "rises", "climb", "growth", "grow", "improve", "improved", "strong",
    "robust", "recovery", "rebound", "optimism", "confident", "exceed", "profitable", "profit",
    "wins", "partnership", "expands", "demand", "inflows", "backlog", "resilient", "rally",
    "soars", "jumps", "surge", "surges", "boost", "expansion", "acquisition", "merger", "dividend hike",
  ],
  "1": ["stable", "steady growth", "neutral", "mixed", "unchanged", "in-line", "in line", "maintains", "keeps"],
};

const NEGATIVE: Record<string, string[]> = {
  "3": [
    "crash", "plunges", "plunge", "bankruptcy", "fraud", "collapse", "scandal", "delisting",
    "halted trading", "emergency meeting", "slump", "tumble", "tumbles", "writedown",
    "profit warning", "guidance cut", "cuts guidance", "downgrade", "downgraded",
    "misses estimates", "missed estimates", "investigation", "lawsuit", "class action",
  ],
  "2": [
    "fall", "falls", "drop", "drops", "decline", "declines", "slip", "slips", "weak", "weaker",
    "slowdown", "concerns", "risk", "risks", "uncertainty", "volatile", "layoffs", "job cuts",
    "recall", "probe", "antitrust", "tariffs", "tariff", "sanctions", "bearish", "selloff",
    "pressure", "headwinds", "overvalued", "downside", "sell-off", "cuts", "warning",
  ],
  "1": ["caution", "careful", "monitor", "watch", "delayed", "delay", "muted", "soft", "flat", "uneven", "mixed signals"],
};

const NEGATORS = ["not", "no", "never", "without", "denies", "denied", "fails to", "failed to", "unlikely", "rules out", "halts", "stops"];

function buildLexicon(): [string, number][] {
  const lex = new Map<string, number>();
  for (const [w, terms] of Object.entries(POSITIVE)) for (const t of terms) lex.set(t, Number(w));
  for (const [w, terms] of Object.entries(NEGATIVE)) for (const t of terms) lex.set(t, -Number(w));
  return [...lex.entries()].sort((a, b) => b[0].length - a[0].length);
}

const LEXICON = buildLexicon();

export interface LexScore {
  score: number;
  hits: { term: string; weight: number }[];
}

/** Score text from -1 (very bearish) to +1 (very bullish). */
export function scoreText(text = ""): LexScore {
  if (!text) return { score: 0, hits: [] };
  const lower = ` ${text.toLowerCase()} `;
  let total = 0;
  let weightSum = 0;
  const hits: { term: string; weight: number }[] = [];

  for (const [term, weight] of LEXICON) {
    let idx = lower.indexOf(term);
    while (idx !== -1) {
      const before = lower.slice(Math.max(0, idx - 28), idx);
      const negated = NEGATORS.some((n) => before.includes(n));
      const eff = negated ? -weight * 0.85 : weight;
      total += eff;
      weightSum += Math.abs(weight);
      if (hits.length < 8) hits.push({ term, weight: Number(eff.toFixed(2)) });
      idx = lower.indexOf(term, idx + term.length);
    }
    if (weightSum > 24) break;
  }

  const raw = weightSum ? total / weightSum : 0;
  const evidence = Math.min(1, 0.5 + 0.5 * (weightSum / 7));
  const score = Math.tanh(raw * 1.15 * evidence);
  return { score: Number(score.toFixed(3)), hits };
}

const decay = (ageMs: number, halfLifeHours = 20) => Math.pow(0.5, ageMs / (halfLifeHours * 3600_000));

export interface NewsAgg {
  newsScore: number;
  breadth: number;
  readCount: number;
}

export function aggregateNews(news: NewsItem[]): NewsAgg {
  const now = Date.now();
  let wsum = 0;
  let acc = 0;
  let readCount = 0;

  for (const item of news) {
    const text = `${item.title}. ${item.snippet || ""} ${item.body || ""}`;
    const { score, hits } = scoreText(text);
    const recency = decay(now - (item.publishedAt || now));
    const relevance = 0.35 + 0.65 * (item.relevance ?? 0.5);
    const depth = item.read ? 1 : 0.7;
    const w = relevance * recency * depth;

    item.sentiment = score;
    item.sentimentHits = hits;
    item.impact = Math.abs(score) * w * 100;

    acc += score * w;
    wsum += w;
    if (item.read) readCount++;
  }

  return {
    newsScore: wsum ? Number((acc / wsum).toFixed(4)) : 0,
    breadth: news.length ? news.filter((n) => (n.sentiment ?? 0) > 0.12).length / news.length : 0.5,
    readCount,
  };
}

const logistic = (x: number) => 1 / (1 + Math.exp(-x));

export interface HeuristicVerdict {
  probabilityUp: number;
  confidence: number;
  direction: Direction;
  headline: string;
  summary: string;
  drivers: Driver[];
  risks: string[];
  timeHorizon: string;
  engine: string;
}

/** Deterministic P(up) from news + price action. */
export function heuristicVerdict({ stats, newsAgg, def }: { stats: Stats; newsAgg: NewsAgg; def: MarketDef }): HeuristicVerdict {
  const news = newsAgg.newsScore;
  const rsi = stats.rsi14;
  const meanRev = rsi > 70 ? -(rsi - 70) / 45 : rsi < 30 ? (30 - rsi) / 45 : 0;
  const vsMa = stats.vsMa20 / 100;

  const logit = 1.45 * news + 0.95 * stats.momentum + 0.5 * stats.trend + 0.9 * meanRev + 0.6 * vsMa;
  let p = logistic(logit);
  const conviction = Math.min(1, Math.abs(logit) / 1.6);
  p = 0.5 + (p - 0.5) * (0.55 + 0.45 * conviction);

  const probabilityUp = Number((p * 100).toFixed(1));
  const edge = probabilityUp - 50;
  const direction: Direction = edge > 6 ? "bullish" : edge < -6 ? "bearish" : "neutral";

  return {
    probabilityUp,
    confidence: Number(Math.min(96, 38 + conviction * 46 + newsAgg.readCount * 2.4).toFixed(1)),
    direction,
    headline:
      direction === "bullish"
        ? `News flow and price action lean bullish for ${def.short}`
        : direction === "bearish"
        ? `Risk is building around ${def.short}`
        : `${def.short} looks genuinely two-sided right now`,
    summary:
      `Aggregate news sentiment is ${news >= 0 ? "positive" : "negative"} (${news.toFixed(2)} on a -1 to 1 scale) across ${newsAgg.readCount} full articles read. ` +
      `Price is ${stats.ret5 >= 0 ? "up" : "down"} ${Math.abs(stats.ret5).toFixed(1)}% over five sessions, ` +
      `${stats.vsMa20 >= 0 ? "above" : "below"} its 20-day average by ${Math.abs(stats.vsMa20).toFixed(1)}%, ` +
      `with ${(stats.annualizedVol || 0).toFixed(0)}% annualised volatility. ` +
      `Model leans ${direction} with ${Math.abs(edge).toFixed(0)} points of edge.`,
    drivers: buildDrivers({ stats, newsAgg, news, def }),
    risks: buildRisks(stats, newsAgg),
    timeHorizon: "next 10 trading days",
    engine: "heuristic",
  };
}

function buildDrivers({ stats, newsAgg, news, def }: { stats: Stats; newsAgg: NewsAgg; news: number; def: MarketDef }): Driver[] {
  const d: Driver[] = [];
  if (Math.abs(news) > 0.06) {
    d.push({
      title: news > 0 ? "Positive news flow" : "Negative news flow",
      detail: `${newsAgg.readCount} articles read · net sentiment ${news.toFixed(2)} · ${(newsAgg.breadth * 100).toFixed(0)}% of coverage constructive`,
      impact: news > 0 ? "positive" : "negative",
      weight: Math.min(1, Math.abs(news) * 3),
    });
  }
  if (Math.abs(stats.ret5) > 1.2) {
    d.push({
      title: stats.ret5 > 0 ? "Short-term momentum is positive" : "Short-term momentum is negative",
      detail: `${def.short} moved ${stats.ret5 > 0 ? "+" : ""}${stats.ret5.toFixed(2)}% over 5 sessions, ${Math.abs(stats.momentum).toFixed(2)}x its normal daily noise`,
      impact: stats.ret5 > 0 ? "positive" : "negative",
      weight: Math.min(1, Math.abs(stats.ret5) / 6),
    });
  }
  if (Math.abs(stats.vsMa20) > 1) {
    d.push({
      title: stats.vsMa20 > 0 ? "Trading above its 20-day average" : "Trading below its 20-day average",
      detail: `Price is ${Math.abs(stats.vsMa20).toFixed(2)}% ${stats.vsMa20 > 0 ? "above" : "below"} the 20-day mean — trend is ${stats.trend > 0 ? "intact" : "under pressure"}`,
      impact: stats.vsMa20 > 0 ? "positive" : "negative",
      weight: Math.min(1, Math.abs(stats.vsMa20) / 8),
    });
  }
  if (stats.rsi14 > 68 || stats.rsi14 < 32) {
    d.push({
      title: stats.rsi14 > 68 ? "Overbought — pullback risk" : "Oversold — bounce potential",
      detail: `RSI(14) at ${stats.rsi14.toFixed(0)} sits in the ${stats.rsi14 > 68 ? "overbought" : "oversold"} band`,
      impact: stats.rsi14 > 68 ? "negative" : "positive",
      weight: Math.min(1, Math.abs(stats.rsi14 - 50) / 35),
    });
  }
  if (Math.abs(stats.volTrend) > 25) {
    d.push({
      title: stats.volTrend > 0 ? "Volume expanding" : "Volume drying up",
      detail: `Latest turnover is ${Math.abs(stats.volTrend).toFixed(0)}% ${stats.volTrend > 0 ? "above" : "below"} the 20-session average`,
      impact: stats.volTrend > 0 ? "neutral" : "negative",
      weight: 0.4,
    });
  }
  if (!d.length) {
    d.push({ title: "No dominant signal", detail: "News and price action are balanced — expect chop rather than a trend", impact: "neutral", weight: 0.3 });
  }
  return d.sort((a, b) => b.weight - a.weight).slice(0, 4);
}

function buildRisks(stats: Stats, newsAgg: NewsAgg): string[] {
  const r: string[] = [];
  if (stats.annualizedVol > 45) r.push(`Very high volatility (${stats.annualizedVol.toFixed(0)}% annualised) — position sizing matters more than direction.`);
  if (newsAgg.readCount < 2) r.push("Few full articles were retrievable, so the verdict leans harder on price action.");
  if (Math.abs(stats.ret5) > 4) r.push(`A ${Math.abs(stats.ret5).toFixed(1)}% weekly move often mean-reverts; chasing it is the most common retail error.`);
  if (stats.vsMa20 < -5) r.push("Sustained trade below the 20-day average is a classic trend-break setup.");
  if (!r.length) r.push("Headline-driven markets can reverse instantly — this is analysis, not advice.");
  return r.slice(0, 3);
}

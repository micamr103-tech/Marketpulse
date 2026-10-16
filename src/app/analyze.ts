/**
 * Analysis orchestrator: articles + price action ➜ P(up) + forecast cone.
 *
 * Three tiers, used in order of what the device can actually do:
 *   1. Ollama  — full LLM verdict (PC, or a phone pointed at a PC on Wi-Fi)
 *   2. On-device transformer — real neural sentiment per article, fully offline
 *   3. Lexicon + technicals — always available, instant, no download
 *
 * The LLM writes the narrative when present; the deterministic model always
 * anchors the final probability so technicals cannot be talked out of the result.
 */

import { buildForecast } from "./forecast";
import { aggregateNews, heuristicVerdict, type NewsAgg } from "./lexicon";
import { applyVolumeStats, computeStats, type Stats } from "./stats";
import { askOllama, detectOllama, SYSTEM, type LlmResult } from "./ai/ollama";
import { neuralScoreBatch, onDeviceEnabled } from "./ai/ondevice";
import type { Analysis, Candle, Driver, MarketDef, NewsItem, Quote } from "../types";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const clean = (s: unknown, max: number) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);

function ago(ts: number): string {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.round(m / 60)}h ago`;
  return `${Math.round(m / 1440)}d ago`;
}

export function buildUserPrompt(def: MarketDef, quote: Quote, stats: Stats, news: NewsItem[]): string {
  const items = news
    .slice(0, 8)
    .map(
      (n, i) =>
        `[${i}] ${n.source} | ${ago(n.publishedAt)} | relevance ${(n.relevance * 100).toFixed(0)}%${
          n.body ? " | full text" : " | headline only"
        }
${n.title}
${(n.body || n.snippet || "").slice(0, 420)}`
    )
    .join("\n\n");

  return `MARKET: ${def.name} (${def.symbol}, ${def.category}, quote in ${def.currency})
LAST PRICE: ${quote.price} (${quote.changePct > 0 ? "+" : ""}${quote.changePct}% today)
TECHNICALS: 1d ${stats.ret1.toFixed(2)}% | 5d ${stats.ret5.toFixed(2)}% | 20d ${stats.ret20.toFixed(2)}% | RSI(14) ${stats.rsi14.toFixed(0)} | vs 20-day MA ${stats.vsMa20.toFixed(2)}% | annualised volatility ${stats.annualizedVol.toFixed(0)}%

NEWS ARTICLES (${def.symbol} only — every one of these is about THIS market):
${items || "(none available)"}

IMPORTANT: if these articles are not actually about ${def.symbol}, do not analyse them as if they
were. Instead return probabilityUp 50, confidence 20, and a headline saying coverage is not specific
to this market. Never substitute a different company, index or asset.

Return exactly this JSON shape - keep every field short so it fits:
{
  "probabilityUp": <number 0-100, probability the price is HIGHER in 10 trading days>,
  "confidence": <number 0-100, how much you trust your own read>,
  "headline": "<= 60 chars, the single most important takeaway>",
  "summary": "<= 240 chars, 2 sentences on WHY this moves the price",
  "drivers": [ { "title": "<= 38 chars", "detail": "<= 105 chars", "impact": "positive|negative|neutral", "weight": <0-1> } ],
  "risks": ["<<= 100 chars>"],
  "articleSentiment": [ { "i": <article index 0-7>, "score": <number -1 to 1>, "why": "<= 60 chars" } ],
  "horizonNote": "<= 40 chars"
}

Maximum 3 drivers, 2 risks, 6 articleSentiment entries. No extra keys, no commentary.`;
}

function validateLlm(raw: LlmResult, fallback: ReturnType<typeof heuristicVerdict>): LlmResult {
  const p = clamp(Number(raw?.probabilityUp), 0, 100);
  const drivers: Driver[] = Array.isArray(raw?.drivers)
    ? raw.drivers.slice(0, 3).map((d) => ({
        title: clean(d.title, 38),
        detail: clean(d.detail, 105),
        impact: ["positive", "negative", "neutral"].includes(d.impact) ? d.impact : "neutral",
        weight: clamp(Number(d.weight) || 0.5, 0.05, 1),
      }))
    : fallback.drivers;

  return {
    probabilityUp: Number.isFinite(p) ? p : fallback.probabilityUp,
    confidence: Number.isFinite(Number(raw?.confidence)) ? clamp(Number(raw.confidence), 5, 97) : fallback.confidence,
    headline: clean(raw?.headline, 60) || fallback.headline,
    summary: clean(raw?.summary, 240) || fallback.summary,
    drivers: drivers.length ? drivers : fallback.drivers,
    risks: (Array.isArray(raw?.risks) ? raw.risks.map((r: string) => clean(r, 100)).filter(Boolean) : fallback.risks).slice(0, 2),
    articleSentiment: Array.isArray(raw?.articleSentiment) ? raw.articleSentiment : [],
    horizonNote: clean(raw?.horizonNote, 40) || fallback.timeHorizon,
  };
}

export interface AnalyseInput {
  def: MarketDef;
  quote: Quote;
  news: NewsItem[];
  /** Skip the (expensive) LLM tier — used for the background sidebar sweep. */
  llm?: boolean;
  signal?: AbortSignal;
}

export async function analyse({ def, quote, news, llm = true, signal }: AnalyseInput): Promise<Analysis> {
  /* 1. Technicals */
  const candles: Candle[] = quote.candles;
  const base = computeStats(candles.map((c) => c.close));
  const stats = applyVolumeStats(base, candles.map((c) => c.volume || 0));

  /* 2. Lexicon sentiment (always) */
  const newsAgg: NewsAgg = aggregateNews(news);
  const heuristic = heuristicVerdict({ stats, newsAgg, def });

  /* 3. On-device neural sentiment (optional, offline-capable) */
  let neuralCount = 0;
  if (onDeviceEnabled() && news.length) {
    const texts = news.slice(0, 8).map((n) => `${n.title}. ${(n.body || n.snippet || "").slice(0, 300)}`);
    const scores = await neuralScoreBatch(texts);
    let wsum = 0;
    let acc = 0;
    scores.forEach((s, i) => {
      const item = news[i];
      if (!item) return;
      if (!s) return;
      neuralCount++;
      // Blend: the finance lexicon knows domain terms, the model knows tone.
      const combined = Number((s.score * 0.6 + (item.sentiment ?? 0) * 0.4).toFixed(3));
      item.sentiment = combined;
      item.sentimentBy = "neural";
      item.impact = Math.abs(combined) * (0.4 + item.relevance) * 55;
      const w = 0.4 + 0.6 * item.relevance;
      acc += combined * w;
      wsum += w;
    });
    if (wsum > 0) {
      newsAgg.newsScore = Number((newsAgg.newsScore * 0.45 + (acc / wsum) * 0.55).toFixed(4));
      newsAgg.breadth = news.filter((n) => (n.sentiment ?? 0) > 0.12).length / news.length;
    }
  }

  /* 4. LLM tier (optional) — only when we genuinely have coverage of THIS market */
  let ai: LlmResult | null = null;
  let engineNote: string | null = null;
  let usedLlm = false;

  // Only evidence that is genuinely about this market. A story that merely
  // mentions markets in passing must never be able to drive the verdict.
  const onTopic = news.filter((n) => n.strong ?? n.relevance >= 0.75);

  if (llm && onTopic.length >= 2 && !signal?.aborted) {
    const info = await detectOllama();
    if (info.online) {
      const raw = await askOllama(buildUserPrompt(def, quote, stats, onTopic), { signal });
      if (raw) {
        ai = validateLlm(raw, heuristic);
        usedLlm = true;
        engineNote = `Ollama · ${info.model}`;
      } else {
        engineNote = `Ollama (${info.model}) did not return usable JSON — used the local engine`;
      }
    }
  } else if (llm && news.length && onTopic.length < 2) {
    // Too little genuine coverage: analysing unrelated headlines would be worse
    // than saying so, so the deterministic engine (technicals-led) stands alone.
    engineNote = `Only ${onTopic.length} article${onTopic.length === 1 ? "" : "s"} on ${def.symbol} — technicals-led`;
  }

  /* 5. Blend + verdict */
  const w = usedLlm ? 0.62 : 0;
  let probabilityUp = clamp(heuristic.probabilityUp * (1 - w) + (ai?.probabilityUp ?? heuristic.probabilityUp) * w, 3, 97);
  const disagreement = usedLlm ? Math.abs((ai?.probabilityUp ?? 0) - heuristic.probabilityUp) : 0;
  const confidence = Number(
    clamp(
      usedLlm ? (ai!.confidence * 0.7 + heuristic.confidence * 0.3 - disagreement * 0.55) : heuristic.confidence + neuralCount * 1.2,
      5,
      95
    ).toFixed(1)
  );

  const edge = probabilityUp - 50;
  const direction = edge > 6 ? "bullish" : edge < -6 ? "bearish" : "neutral";

  if (ai?.articleSentiment?.length) {
    for (const a of ai.articleSentiment) {
      // Indices refer to the filtered on-topic list we actually sent.
      const item = onTopic[a.i];
      if (!item) continue;
      item.sentiment = Number(clamp(a.score, -1, 1).toFixed(3));
      item.sentimentWhy = clean(a.why, 60);
      item.sentimentBy = "ai";
      item.impact = Math.abs(item.sentiment) * (0.4 + item.relevance) * 55;
    }
  }

  const forecast = buildForecast({ price: quote.price, pUp: probabilityUp, stats, newsAgg, horizon: 20 });

  return {
    verdict: {
      probabilityUp: Number(probabilityUp.toFixed(1)),
      confidence,
      direction,
      headline: usedLlm ? ai!.headline : heuristic.headline,
      summary: usedLlm ? ai!.summary : heuristic.summary,
      drivers: usedLlm ? ai!.drivers : heuristic.drivers,
      risks: usedLlm && ai!.risks.length ? ai!.risks : heuristic.risks,
      timeHorizon: usedLlm ? ai!.horizonNote || heuristic.timeHorizon : heuristic.timeHorizon,
      engine: usedLlm ? "ollama" : neuralCount ? "on-device" : "built-in",
      engineNote,
      model: usedLlm ? (await detectOllama()).model : neuralCount ? "on-device transformer" : null,
      sources: onTopic.length,
      articlesRead: onTopic.filter((n) => n.read).length,
      articlesScored: onTopic.length,
      modelBaseline: heuristic.probabilityUp,
      agreement: usedLlm ? Number((100 - disagreement).toFixed(1)) : null,
      generatedAt: Date.now(),
    },
    forecast,
    news,
    stats: {
      rsi14: Number(stats.rsi14.toFixed(1)),
      dailyVol: Number(stats.dailyVol.toFixed(3)),
      annualizedVol: Number(stats.annualizedVol.toFixed(1)),
      ret5: Number(stats.ret5.toFixed(2)),
      ret20: Number(stats.ret20.toFixed(2)),
      ma20: stats.ma20 ? Number(stats.ma20.toFixed(2)) : null,
      ma50: stats.ma50 ? Number(stats.ma50.toFixed(2)) : null,
      vsMa20: Number(stats.vsMa20.toFixed(2)),
      volTrend: Number(stats.volTrend.toFixed(1)),
      momentum: Number(stats.momentum.toFixed(3)),
      newsScore: Number(newsAgg.newsScore.toFixed(3)),
      breadth: Number(newsAgg.breadth.toFixed(3)),
    },
  };
}

export { SYSTEM };

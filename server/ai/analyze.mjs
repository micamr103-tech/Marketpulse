/**
 * Analysis orchestrator: articles + price action ➜ P(up) verdict + forecast cone.
 *
 * Two engines cooperate:
 *  • the local Ollama LLM reads the article text and writes the narrative verdict
 *  • the deterministic engine scores every headline and anchors the probability
 * The final number is a blend, so technicals can't be talked out of the result.
 */

import { askOllama, detectOllama, aiStatus } from "./ollama.mjs";
import { aggregateNews, scoreText, heuristicVerdict } from "./heuristic.mjs";
import { buildForecast } from "../forecast.mjs";

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const clean = (s, max) => String(s ?? "").replace(/\s+/g, " ").trim().slice(0, max);

function ago(ts) {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.round(m / 60)}h ago`;
  return `${Math.round(m / 1440)}d ago`;
}

const SYSTEM = `You are a rigorous financial news analyst working inside an investment terminal.
You read news articles about a company, index, cryptoasset or commodity and judge the
probable direction of its price over the next 10 trading days.

Rules:
- Base your judgement ONLY on the supplied article text and price data. Never invent facts, figures, events or sources.
- Weigh recency and relevance. A story about the company's product launch matters more than a passing mention.
- Distinguish between what already happened (priced in) and what is genuinely new forward-looking information.
- Be calibrated and honest. A probability near 50 with "no clear edge" is a legitimate and valued answer.
- Consider how the market is likely to react, not just whether the news sounds good or bad.
- Reply with JSON only. No prose, no markdown fences.`;

function buildUserPrompt(def, quote, stats, news) {
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

NEWS ARTICLES:
${items || "(none available)"}

Return exactly this JSON shape - keep every field short so it fits:
{
  "probabilityUp": <number 0-100, probability the price is HIGHER in 10 trading days>,
  "confidence": <number 0-100, how much you trust your own read>,
  "headline": "<= 60 chars, the single most important takeaway>",
  "summary": "<= 240 chars, 2 sentences on WHY this moves the price",
  "drivers": [ { "title": "<= 38 chars", "detail": "<= 105 chars", "impact": "positive|negative|neutral", "weight": <0-1> } ],
  "risks": ["<<= 100 chars>"],
  "articleSentiment": [ { "i": <article index>, "score": <number -1 to 1>, "why": "<= 60 chars" } ],
  "horizonNote": "<= 40 chars"
}

Maximum 3 drivers, 2 risks, 6 articleSentiment entries. No extra keys, no commentary.`;
}

function validate(raw, fallback, news) {
  const p = clamp(Number(raw?.probabilityUp), 0, 100);
  const probabilityUp = Number.isFinite(p) ? p : fallback.probabilityUp;

  const drivers = Array.isArray(raw?.drivers)
    ? raw.drivers.slice(0, 4).map((d) => ({
        title: clean(d.title, 40),
        detail: clean(d.detail, 130),
        impact: ["positive", "negative", "neutral"].includes(d.impact) ? d.impact : "neutral",
        weight: clamp(Number(d.weight) || 0.5, 0.05, 1),
      }))
    : fallback.drivers;

  // Per-article sentiment from the LLM, falling back to the lexicon.
  const sentimentByIndex = new Map();
  if (Array.isArray(raw?.articleSentiment)) {
    for (const a of raw.articleSentiment) {
      const i = Number(a?.i);
      const s = clamp(Number(a?.score), -1, 1);
      if (Number.isInteger(i) && news[i] && Number.isFinite(s)) {
        sentimentByIndex.set(i, { score: Number(s.toFixed(3)), why: clean(a.why, 90), by: "ai" });
      }
    }
  }

  return {
    probabilityUp: Number(probabilityUp.toFixed(1)),
    confidence: Number.isFinite(Number(raw?.confidence))
      ? clamp(Number(raw.confidence), 5, 97)
      : fallback.confidence,
    headline: clean(raw?.headline, 72) || fallback.headline,
    summary: clean(raw?.summary, 420) || fallback.summary,
    drivers: drivers.length ? drivers : fallback.drivers,
    risks: (Array.isArray(raw?.risks) ? raw.risks.map((r) => clean(r, 120)).filter(Boolean) : fallback.risks).slice(0, 3),
    sentimentByIndex,
  };
}

/**
 * @param {object} p
 * @param {object} p.def    market definition
 * @param {object} p.quote  quote payload
 * @param {object} p.stats  technical stats
 * @param {Array}  p.news   gathered news items
 */
export async function analyse({ def, quote, stats, news, newsAgg: providedAgg }) {
  const newsAgg = providedAgg || aggregateNews(news);
  const base = heuristicVerdict({ stats, newsAgg, def });

  // Per-article sentiment from the lexicon (always present).
  news.forEach((n, i) => {
    if (!n.sentimentHits) {
      const { score, hits } = scoreText(`${n.title}. ${n.snippet || ""} ${n.body || ""}`);
      n.sentiment = score;
      n.sentimentHits = hits;
    }
    n.index = i;
  });

  let ai = null;
  let engineNote = null;
  let usedLlm = false;

  if (news.length) {
    try {
      const status = await detectOllama();
      if (status.online) {
        const raw = await askOllama({
          system: SYSTEM,
          user: buildUserPrompt(def, quote, stats, news),
        });
        ai = validate(raw, base, news);
        usedLlm = true;
        engineNote = `Ollama · ${status.model}`;
      }
    } catch (err) {
      engineNote = `Ollama unavailable (${clean(err?.message, 60)}) — used built-in engine`;
    }
  } else {
    engineNote = "No articles found — technicals only";
  }

  // Blend: the LLM narrates, the deterministic model anchors the number.
  const w = usedLlm ? 0.62 : 0;
  let probabilityUp = base.probabilityUp * (1 - w) + (ai?.probabilityUp ?? base.probabilityUp) * w;
  probabilityUp = clamp(probabilityUp, 3, 97);

  // Confidence should reflect agreement between the two engines.
  const disagreement = usedLlm ? Math.abs(ai.probabilityUp - base.probabilityUp) : 0;
  let confidence = usedLlm
    ? ai.confidence * 0.7 + base.confidence * 0.3 - disagreement * 0.55
    : base.confidence;
  confidence = Number(clamp(confidence, 5, 95).toFixed(1));

  const edge = probabilityUp - 50;
  const direction = edge > 6 ? "bullish" : edge < -6 ? "bearish" : "neutral";

  // Apply LLM per-article sentiment on top of the lexicon baseline.
  if (ai?.sentimentByIndex?.size) {
    for (const [i, s] of ai.sentimentByIndex) {
      const item = news[i];
      if (!item) continue;
      item.sentiment = s.score;
      item.sentimentWhy = s.why;
      item.sentimentBy = "ai";
      item.impact = Math.abs(s.score) * (0.4 + item.relevance) * 55;
    }
    newsAgg.newsScore = clamp(newsAgg.newsScore * 0.5 + avgOf(news.map((n) => n.sentiment)) * 0.5, -1, 1);
  }

  const forecast = buildForecast({
    price: quote.price,
    pUp: probabilityUp,
    stats,
    newsAgg,
    horizon: 20,
  });

  return {
    verdict: {
      probabilityUp: Number(probabilityUp.toFixed(1)),
      confidence,
      direction,
      headline: usedLlm ? ai.headline : base.headline,
      summary: usedLlm ? ai.summary : base.summary,
      drivers: usedLlm ? ai.drivers : base.drivers,
      risks: usedLlm && ai.risks.length ? ai.risks : base.risks,
      timeHorizon: usedLlm ? clean(ai.horizonNote, 60) || base.timeHorizon : base.timeHorizon,
      engine: usedLlm ? "ollama" : "built-in",
      engineNote,
      model: usedLlm ? aiStatus().model : null,
      sources: news.length,
      articlesRead: newsAgg.readCount,
      articlesScored: news.length,
      modelBaseline: base.probabilityUp,
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

const avgOf = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

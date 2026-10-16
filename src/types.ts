export type Category = "stocks" | "indices" | "crypto" | "commodities";
export type Direction = "bullish" | "bearish" | "neutral";
export type EngineKind = "ollama" | "on-device" | "built-in" | "neutral";

export interface MarketDef {
  symbol: string;
  name: string;
  short: string;
  category: Category;
  currency: string;
  aliases?: string[];
}

export interface Candle {
  t: number;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  volume: number;
}

export interface Quote {
  symbol: string;
  name: string;
  price: number;
  prevClose: number;
  change: number;
  changePct: number;
  currency: string;
  exchange: string | null;
  dayHigh: number | null;
  dayLow: number | null;
  fiftyTwoWeekHigh: number | null;
  fiftyTwoWeekLow: number | null;
  marketState: "REGULAR" | "CLOSED" | string | null;
  nextOpen?: number | null;
  regularMarketTime: number | null;
  volume: number | null;
  candles: Candle[];
}

export interface MarketRow {
  symbol: string;
  name: string;
  short: string;
  category: Category;
  currency: string;
  price: number;
  change: number;
  changePct: number;
  marketState: string | null;
  spark: number[];
}

export interface Conviction {
  at: number;
  probabilityUp: number | null;
  confidence?: number;
  direction?: Direction;
  headline?: string;
  engine?: string;
  error?: string;
}

export interface Driver {
  title: string;
  detail: string;
  impact: "positive" | "negative" | "neutral";
  weight: number;
}

export interface Verdict {
  probabilityUp: number;
  confidence: number;
  direction: Direction;
  headline: string;
  summary: string;
  drivers: Driver[];
  risks: string[];
  timeHorizon: string;
  engine: EngineKind;
  engineNote?: string | null;
  model: string | null;
  sources: number;
  articlesRead: number;
  articlesScored?: number;
  modelBaseline: number;
  agreement: number | null;
  generatedAt: number;
  error?: string;
}

export interface ForecastPoint {
  day: number;
  median: number;
  p10: number;
  p25: number;
  p75: number;
  p90: number;
}

export interface Forecast {
  horizon: number;
  driftPctPerDay: number;
  volatilityPctPerDay: number;
  medianEnd: number;
  expectedLow: number;
  expectedHigh: number;
  expectedChangePct: number;
  rangeChangePct: number;
  bandWidthPct: number;
  path: ForecastPoint[];
}

export interface NewsItem {
  id: string;
  title: string;
  url: string;
  source: string;
  publishedAt: number;
  snippet: string;
  description?: string | null;
  body?: string;
  relevance: number;
  /** True when the story is actually about this market. */
  onTopic?: boolean;
  /** Direct ticker or name match — the only stories used as AI evidence. */
  strong?: boolean;
  read: boolean;
  sentiment?: number;
  sentimentWhy?: string;
  sentimentBy?: "ai" | "neural";
  sentimentHits?: { term: string; weight: number }[];
  impact?: number;
  index?: number;
  market?: string;
  symbol?: string;
}

export interface MarketStats {
  rsi14: number;
  annualizedVol?: number;
  ret5: number;
  ret20: number;
  vsMa20: number;
  volTrend: number;
  dailyVol?: number;
  ma20?: number | null;
  ma50?: number | null;
  momentum?: number;
  newsScore?: number;
  breadth?: number;
}

export interface Analysis {
  verdict: Verdict;
  forecast: Forecast | null;
  news: NewsItem[];
  stats: MarketStats;
}

export interface OllamaInfo {
  online: boolean;
  model: string | null;
  available: string[];
  endpoint: string | null;
  error: string | null;
}

export interface MarketDetail {
  def: MarketDef;
  quote: Quote;
  stats: MarketStats;
  news: NewsItem[];
  newsAgg: { newsScore: number; breadth: number; readCount: number };
  analysis: Analysis | null;
  ai: OllamaInfo;
  updatedAt: number;
}

export interface Watchlist {
  markets: MarketRow[];
  updatedAt: number;
  conviction: Record<string, Conviction>;
}
/** The market universe (shared with the optional local server). */

import type { Category, MarketDef } from "../types";

export const CATEGORIES: Category[] = ["stocks", "indices", "crypto", "commodities"];

export const MARKETS: MarketDef[] = [
  { symbol: "^GSPC", name: "S&P 500", short: "S&P 500", category: "indices", currency: "USD",
    aliases: ["S&P 500", "SPX", "S&P500", "US stocks", "Wall Street", "S&P"] },
  { symbol: "^IXIC", name: "Nasdaq Composite", short: "Nasdaq", category: "indices", currency: "USD",
    aliases: ["Nasdaq", "NASDAQ", "Nasdaq Composite", "tech stocks"] },
  { symbol: "^DJI", name: "Dow Jones Industrial", short: "Dow Jones", category: "indices", currency: "USD",
    aliases: ["Dow Jones", "Dow", "DJIA"] },
  { symbol: "^GDAXI", name: "DAX 40", short: "DAX", category: "indices", currency: "EUR",
    aliases: ["DAX", "German stocks", "Germany"] },
  { symbol: "^FTSE", name: "FTSE 100", short: "FTSE 100", category: "indices", currency: "GBP",
    aliases: ["FTSE", "FTSE 100", "UK stocks", "London"] },
  { symbol: "^N225", name: "Nikkei 225", short: "Nikkei", category: "indices", currency: "JPY",
    aliases: ["Nikkei", "Nikkei 225", "Japan", "Tokyo"] },
  { symbol: "^VIX", name: "CBOE Volatility Index", short: "VIX (Fear)", category: "indices", currency: "USD",
    aliases: ["VIX", "volatility index", "fear index", "CBOE"] },

  { symbol: "NVDA", name: "NVIDIA Corporation", short: "NVIDIA", category: "stocks", currency: "USD",
    aliases: ["Nvidia", "NVDA", "NVIDIA Corporation", "Jensen Huang", "Nvidia stock"] },
  { symbol: "AAPL", name: "Apple Inc.", short: "Apple", category: "stocks", currency: "USD",
    aliases: ["Apple", "AAPL", "Apple Inc", "iPhone"] },
  { symbol: "MSFT", name: "Microsoft Corporation", short: "Microsoft", category: "stocks", currency: "USD",
    aliases: ["Microsoft", "MSFT", "Azure", "Copilot"] },
  { symbol: "TSLA", name: "Tesla Inc.", short: "Tesla", category: "stocks", currency: "USD",
    aliases: ["Tesla", "TSLA", "Elon Musk", "EV maker", "Tesla stock"] },
  { symbol: "AMZN", name: "Amazon.com Inc.", short: "Amazon", category: "stocks", currency: "USD",
    aliases: ["Amazon", "AMZN", "AWS", "e-commerce"] },
  { symbol: "GOOGL", name: "Alphabet Inc.", short: "Alphabet", category: "stocks", currency: "USD",
    aliases: ["Alphabet", "Google", "GOOGL", "GOOG", "Gemini AI"] },
  { symbol: "META", name: "Meta Platforms", short: "Meta", category: "stocks", currency: "USD",
    aliases: ["Meta", "Facebook", "META", "Instagram", "Zuckerberg"] },
  { symbol: "AMD", name: "Advanced Micro Devices", short: "AMD", category: "stocks", currency: "USD",
    aliases: ["AMD", "Advanced Micro Devices", "Ryzen", "Instinct"] },
  { symbol: "NFLX", name: "Netflix Inc.", short: "Netflix", category: "stocks", currency: "USD",
    aliases: ["Netflix", "NFLX", "streaming"] },
  { symbol: "JPM", name: "JPMorgan Chase & Co.", short: "JPMorgan", category: "stocks", currency: "USD",
    aliases: ["JPMorgan", "JPM", "JP Morgan", "Chase"] },

  { symbol: "BTC-USD", name: "Bitcoin", short: "Bitcoin", category: "crypto", currency: "USD",
    aliases: ["Bitcoin", "BTC", "BTC-USD", "crypto"] },
  { symbol: "ETH-USD", name: "Ethereum", short: "Ethereum", category: "crypto", currency: "USD",
    aliases: ["Ethereum", "ETH", "ETH-USD"] },
  { symbol: "SOL-USD", name: "Solana", short: "Solana", category: "crypto", currency: "USD",
    aliases: ["Solana", "SOL", "SOL-USD"] },

  { symbol: "GC=F", name: "Gold Futures", short: "Gold", category: "commodities", currency: "USD",
    aliases: ["gold", "Gold", "XAU", "bullion", "precious metal"] },
  { symbol: "CL=F", name: "Crude Oil WTI", short: "Crude Oil", category: "commodities", currency: "USD",
    aliases: ["crude oil", "WTI", "oil prices", "petroleum"] },
];

export const MARKET_MAP = new Map(MARKETS.map((m) => [m.symbol, m]));

export const BRIEFING_MARKETS = ["^GSPC", "^IXIC", "GC=F", "CL=F"].map((s) => MARKET_MAP.get(s)!);

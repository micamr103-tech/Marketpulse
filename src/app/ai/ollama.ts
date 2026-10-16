/**
 * Ollama client for the browser.
 *
 * On a PC the app can talk to http://127.0.0.1:11434 directly. On a phone the
 * same PC can be reached over home Wi-Fi, so the endpoint is configurable.
 * Everything is optional — the app works with no Ollama at all.
 */

import { cache } from "../../lib/net";
import type { Driver } from "../../types";

export interface OllamaInfo {
  checkedAt?: number;
  online: boolean;
  model: string | null;
  available: string[];
  endpoint: string | null;
  error: string | null;
}

const PREFERRED = [
  "llama3.1", "llama3", "qwen3", "qwen3.5", "qwen2.5", "mistral", "gemma3", "gemma2", "phi4",
  "llama2", "tinyllama",
];

const ENDPOINTS = ["http://127.0.0.1:11434", "http://localhost:11434"];

let state: OllamaInfo = { online: false, model: null, available: [], endpoint: null, error: null };
const listeners = new Set<(s: OllamaInfo) => void>();

export const onOllamaChange = (fn: (s: OllamaInfo) => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

const emit = () => listeners.forEach((fn) => fn(state));
export const ollamaInfo = () => state;

function pickModel(names: string[]): string | null {
  return PREFERRED.map((p) => names.find((n) => n === p || n.startsWith(`${p}:`) || n === `${p}:latest`)).find(Boolean) ?? null;
}

export function customEndpoint(): string | null {
  try {
    return localStorage.getItem("mp:ollama-endpoint");
  } catch {
    return null;
  }
}

export async function detectOllama(force = false): Promise<OllamaInfo> {
  if (state.online && !force) return state;
  if (!force && state.checkedAt && Date.now() - state.checkedAt < 15_000) return state;
  state.checkedAt = Date.now();

  const custom = customEndpoint();
  const candidates = custom ? [custom] : ENDPOINTS;
  let lastError = "No Ollama endpoint reachable";

  for (const endpoint of candidates) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 1500);
      const res = await fetch(`${endpoint}/api/tags`, { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) continue;
      const data = (await res.json()) as { models?: { name: string }[] };
      const names = (data.models ?? []).map((m) => m.name).filter(Boolean);
      const model = pickModel(names) ?? names.find((n) => !/embed|vision|bge/i.test(n)) ?? names[0] ?? null;
      state = { online: Boolean(model), model, available: names, endpoint, error: model ? null : "No models pulled" };
      emit();
      return state;
    } catch (err) {
      lastError = (err as Error).name === "AbortError" ? `No response from ${endpoint}` : (err as Error).message;
    }
  }

  state = { online: false, model: null, available: [], endpoint: null, error: lastError };
  emit();
  return state;
}

export function setOllamaEndpoint(url: string | null) {
  try {
    if (url) localStorage.setItem("mp:ollama-endpoint", url.replace(/\/$/, ""));
    else localStorage.removeItem("mp:ollama-endpoint");
  } catch {
    /* ignore */
  }
  detectOllama(true);
}

/* ── Serialised requests (one local model at a time) ─────────────────────── */
let chain: Promise<unknown> = Promise.resolve();
const enqueue = <T,>(task: () => Promise<T>): Promise<T> => {
  const run = chain.then(task, task);
  chain = run.then(
    () => {},
    () => {}
  );
  return run;
};

/** Repairs JSON that a small model truncated or wrapped in chatter. */
export function parseJsonLoose(text: string | null | undefined): Record<string, unknown> | null {
  if (!text) return null;
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  try {
    return JSON.parse(cleaned);
  } catch {}

  const start = cleaned.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  let end = -1;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end !== -1) {
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch {}
  }
  let patched = cleaned.slice(start);
  if (inStr) patched += '"';
  if (depth > 0) patched += "}".repeat(depth);
  try {
    return JSON.parse(patched);
  } catch {}
  return null;
}

export const SYSTEM = `You are a rigorous financial news analyst working inside an investment terminal.
You read news articles about a company, index, cryptoasset or commodity and judge the
probable direction of its price over the next 10 trading days.

Rules:
- Base your judgement ONLY on the supplied article text and price data. Never invent facts, figures, events or sources.
- Weigh recency and relevance. A story about the company's product launch matters more than a passing mention.
- Distinguish between what already happened (priced in) and what is genuinely new forward-looking information.
- Be calibrated and honest. A probability near 50 with "no clear edge" is a legitimate and valued answer.
- Consider how the market is likely to react, not just whether the news sounds good or bad.
- Reply with JSON only. No prose, no markdown fences.`;

export interface LlmResult {
  probabilityUp: number;
  confidence: number;
  headline: string;
  summary: string;
  drivers: Driver[];
  risks: string[];
  articleSentiment: { i: number; score: number; why: string }[];
  horizonNote: string;
}

export async function askOllama(
  user: string,
  { timeoutMs = 180_000, signal }: { timeoutMs?: number; signal?: AbortSignal } = {}
): Promise<LlmResult | null> {
  const info = await detectOllama();
  if (!info.online || !info.model || !info.endpoint) return null;

  const key = `llm:${info.model}:${user.length}:${user.slice(0, 64)}`;
  const cached = cache.get<LlmResult>(key, 10 * 60_000);
  if (cached) return cached;

  return enqueue(async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const onAbort = () => ctrl.abort();
    signal?.addEventListener("abort", onAbort, { once: true });
    try {
      const res = await fetch(`${info.endpoint}/api/chat`, {
        method: "POST",
        signal: ctrl.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: info.model,
          stream: false,
          format: "json",
          options: { temperature: 0.2, num_predict: 700, num_ctx: 4096, top_p: 0.9 },
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content: user },
          ],
        }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { message?: { content?: string } };
      const parsed = parseJsonLoose(data.message?.content);
      if (!parsed) return null;
      const result = parsed as unknown as LlmResult;
      cache.set(key, result);
      return result;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    }
  });
}

/**
 * Ollama integration (local LLM). Zero cloud calls, zero API keys.
 * If Ollama is not running we detect it quickly and the caller falls back to the
 * built-in heuristic engine, so the app never hangs.
 */

const DEFAULT_HOST = process.env.OLLAMA_HOST || "http://127.0.0.1:11434";

// Ordered by quality of instruction-following for this exact task.
const PREFERRED = [
  "llama3.1:8b", "llama3.1", "llama3:8b", "llama3",
  "qwen3:8b", "qwen3:4b", "qwen3", "qwen3.5:2b", "qwen3.5", "qwen2.5",
  "mistral", "gemma3", "gemma2", "phi4", "llama2", "tinyllama",
];

let state = { checked: false, online: false, model: null, models: [], error: null, host: DEFAULT_HOST, lastProbe: 0 };

export function aiStatus() {
  return {
    online: state.online,
    model: state.model,
    available: state.models,
    host: state.host,
    error: state.error,
    engine: state.online ? `ollama · ${state.model}` : "built-in engine",
  };
}

const RECHECK_MS = 10_000;

export async function detectOllama({ force = false } = {}) {
  // Re-probe periodically while offline so the app lights up the moment Ollama
  // is started, without needing a restart.
  const dueForRecheck = !state.online && Date.now() - state.lastProbe > RECHECK_MS;
  if (state.checked && !force && !dueForRecheck) return aiStatus();
  state.checked = true;
  state.lastProbe = Date.now();

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1200);
    const res = await fetch(`${state.host}/api/tags`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`status ${res.status}`);
    const data = await res.json();
    const names = (data.models || []).map((m) => m.name).filter(Boolean);
    state.models = names;
    // Resolve the preference list against what is ACTUALLY installed, and keep
    // the real model name — Ollama needs e.g. "llama3.1:latest", not "llama3.1".
    state.model =
      PREFERRED.map((p) => names.find((n) => n === p || n.startsWith(`${p.split(":")[0]}:`))).find(Boolean) ||
      names.find((n) => !/embed|vision|bge/i.test(n)) ||
      names[0] ||
      null;
    state.online = Boolean(state.model);
    state.error = state.online ? null : "No models pulled. Run: ollama pull llama3.1";
  } catch (err) {
    state.online = false;
    state.model = null;
    state.models = [];
    state.error = `Ollama not reachable at ${state.host}`;
  }
  return aiStatus();
}

// Local models are single-request-at-a-time friendly: serialise everything.
let chain = Promise.resolve();
function enqueue(task) {
  const run = chain.then(task, task);
  chain = run.then(
    () => {},
    () => {}
  );
  return run;
}

/**
 * Small models often emit JSON that is cut off by the token cap, or wrapped in
 * chatter. Repair it: strip fences, then walk the braces to find a balanced
 * object, and if the response was truncated mid-way, close the dangling
 * string/braces so the partial object still parses.
 */
function parseJsonLoose(text) {
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

  // Truncated mid-object — close the open string and braces, then retry.
  let patched = cleaned.slice(start);
  if (inStr) patched += '"';
  if (depth > 0) patched += "}".repeat(depth);
  try {
    return JSON.parse(patched);
  } catch {}

  const last = cleaned.lastIndexOf("}");
  if (last > start) {
    try {
      return JSON.parse(cleaned.slice(start, last + 1));
    } catch {}
  }
  return null;
}

export async function askOllama({ system, user, temperature = 0.2, timeoutMs = 180_000, maxTokens = 700 }) {
  const status = await detectOllama();
  if (!status.online) throw new Error(status.error || "Ollama offline");

  return enqueue(async () => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(`${state.host}/api/chat`, {
        method: "POST",
        signal: ctrl.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: state.model,
          stream: false,
          format: "json",
          options: { temperature, num_predict: maxTokens, num_ctx: 4096, top_p: 0.9 },
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
      });
      if (!res.ok) throw new Error(`ollama ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const data = await res.json();
      const parsed = parseJsonLoose(data?.message?.content);
      if (!parsed) throw new Error("Model did not return valid JSON");
      return parsed;
    } finally {
      clearTimeout(timer);
    }
  });
}
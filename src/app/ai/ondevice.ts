/**
 * On-device AI — a real transformer running inside the browser.
 *
 * This is what makes the phone build standalone: no server, no cloud, no PC.
 * The model is downloaded once (~66 MB) and then transformers.js caches it in
 * the browser, so analysis keeps working fully offline afterwards.
 *
 * It scores article sentiment; the finance-specific weightings still come from
 * the lexicon, and the two are combined for a better read than either alone.
 */

export type OnDeviceStatus = "idle" | "loading" | "ready" | "unavailable";

export interface OnDeviceState {
  status: OnDeviceStatus;
  model: string | null;
  progress: number;
  error: string | null;
  backend: string | null;
}

export const MODELS = {
  "Xenova/distilbert-base-uncased-finetuned-sst-2-english": {
    label: "DistilBERT · sentiment (fast, ~66 MB)",
    size: "~66 MB",
  },
  "Xenova/bert-base-multilingual-uncased-sentiment": {
    label: "BERT multilingual · sentiment (wider languages, ~135 MB)",
    size: "~135 MB",
  },
  "Xenova/twitter-roberta-base-sentiment-latest": {
    label: "RoBERTa · finance-tuned sentiment (~124 MB)",
    size: "~124 MB",
  },
} as const;

export type ModelId = keyof typeof MODELS;

const DEFAULT_MODEL: ModelId = "Xenova/distilbert-base-uncased-finetuned-sst-2-english";

let state: OnDeviceState = { status: "idle", model: null, progress: 0, error: null, backend: null };
const listeners = new Set<(s: OnDeviceState) => void>();

export const onOnDeviceChange = (fn: (s: OnDeviceState) => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
export const onDeviceState = () => state;

const set = (patch: Partial<OnDeviceState>) => {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn(state));
};

export const modelPreference = (): string => {
  try {
    return localStorage.getItem("mp:ondevice-model") || DEFAULT_MODEL;
  } catch {
    return DEFAULT_MODEL;
  }
};

export const onDeviceEnabled = (): boolean => {
  try {
    return localStorage.getItem("mp:ondevice-enabled") !== "off";
  } catch {
    return true;
  }
};

export function setOnDeviceEnabled(on: boolean) {
  try {
    localStorage.setItem("mp:ondevice-enabled", on ? "on" : "off");
  } catch {
    /* ignore */
  }
  if (on) void ensureOnDevice();
}

export function setModelPreference(id: string) {
  try {
    localStorage.setItem("mp:ondevice-model", id);
  } catch {
    /* ignore */
  }
  loaded = null;
  set({ status: "idle", progress: 0, error: null });
}

/* ── Model loading ───────────────────────────────────────────────────────── */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let loaded: any = null;
let loading: Promise<unknown> | null = null;

export async function ensureOnDevice(force = false): Promise<unknown | null> {
  if (!onDeviceEnabled()) return null;
  if (loaded && !force) return loaded;
  if (loading) return loading;

  const id = modelPreference();
  set({ status: "loading", progress: 0, error: null, model: id });

  loading = (async () => {
    try {
      const { pipeline, env } = await import("@huggingface/transformers");
      env.allowLocalModels = false;
      if ("device" in env.backends.onnx) {
        // Plain WASM: one build for every device, predictable on phones.
        // The runtime itself is bundled by Vite, so it works offline and
        // needs no cross-origin fetch.
        (env.backends.onnx as unknown as { device: string }).device = "wasm";
      }

      const clf = await pipeline("text-classification", id, {
        dtype: "q8",
        device: "wasm",
        progress_callback: (p: { status?: string; progress?: number }) => {
          if (p.status === "progress" && typeof p.progress === "number") {
            set({ progress: Math.round(p.progress) });
          }
        },
      });

      loaded = clf;
      set({ status: "ready", progress: 100, error: null, backend: "wasm" });
      return clf;
    } catch (err) {
      const message = (err as Error).message || "model failed to load";
      // Offline or blocked: fall back silently to the lexicon engine.
      set({ status: "unavailable", error: message, progress: 0 });
      loaded = null;
      return null;
    } finally {
      loading = null;
    }
  })();

  return loading;
}

/* ── Scoring ─────────────────────────────────────────────────────────────── */

const LABELS: Record<string, string> = {
  POSITIVE: "pos",
  POSITIVE_2: "pos",
  LABEL_1: "pos",
  NEGATIVE: "neg",
  NEGATIVE_2: "neg",
  LABEL_0: "neg",
  "1 star": "neg",
  "2 stars": "neg",
  "3 stars": "neu",
  "4 stars": "pos",
  "5 stars": "pos",
  NEUTRAL: "neu",
};

export interface NeuralScore {
  score: number;
  raw: string;
  prob: number;
}

export async function neuralScore(text: string): Promise<NeuralScore | null> {
  const clf = (await ensureOnDevice()) as
    | ((input: string) => Promise<{ label: string; score: number }[]>)
    | null;
  if (!clf || !text?.trim()) return null;
  try {
    const out = await clf(text.slice(0, 480));
    const top = out?.[0];
    if (!top) return null;
    const tone = LABELS[top.label] ?? "neu";
    const polarity = tone === "neu" ? 0 : tone === "pos" ? top.score : -top.score;
    return { score: Number(polarity.toFixed(3)), raw: top.label, prob: Number(top.score.toFixed(3)) };
  } catch {
    return null;
  }
}

/** Score many headlines at once (sequentially — a phone prefers gentle batches). */
export async function neuralScoreBatch(texts: string[]): Promise<(NeuralScore | null)[]> {
  if (!onDeviceEnabled() || !texts.length) return texts.map(() => null);
  const out: (NeuralScore | null)[] = [];
  for (const t of texts) {
    out.push(await neuralScore(t));
  }
  return out;
}

export function warmOnDevice() {
  if (onDeviceEnabled()) void ensureOnDevice();
}

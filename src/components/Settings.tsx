import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Bot, Check, Cpu, Database, Download, HardDrive, Heart, Share, Smartphone, Sparkles, Trash2, WifiOff, X,
} from "lucide-react";
import { cx } from "../lib/format";
import { detectOllama, setOllamaEndpoint, customEndpoint, ollamaInfo } from "../app/ai/ollama";
import {
  MODELS, ensureOnDevice, modelPreference, onDeviceEnabled, setModelPreference, setOnDeviceEnabled,
} from "../app/ai/ondevice";
import { cache } from "../lib/net";
import type { EngineStatus } from "../App";

const AUTHOR = "Marko Tomic";

interface Props {
  open: boolean;
  onClose: () => void;
  engine: EngineStatus;
  onEngineChange: () => void;
}

export function useInstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(
    () => window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true
  );

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    addEventListener("beforeinstallprompt", onPrompt);
    addEventListener("appinstalled", onInstalled);
    return () => {
      removeEventListener("beforeinstallprompt", onPrompt);
      removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  return { canInstall: Boolean(deferred), installed, promptInstall: () => deferred?.prompt() };
}

export default function Settings({ open, onClose, engine, onEngineChange }: Props) {
  const { canInstall, installed, promptInstall } = useInstallPrompt();
  const [endpoint, setEndpoint] = useState(customEndpoint() ?? "");
  const [busy, setBusy] = useState(false);

  const model = modelPreference();
  const enabled = onDeviceEnabled();

  const iosShare =
    /iphone|ipad|ipod/i.test(navigator.userAgent) && !(navigator as { standalone?: boolean }).standalone;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const applyEndpoint = async () => {
    setBusy(true);
    setOllamaEndpoint(endpoint.trim() || null);
    await detectOllama(true);
    setBusy(false);
    onEngineChange();
  };

  const pickModel = async (id: string) => {
    setModelPreference(id);
    setBusy(true);
    await ensureOnDevice(true);
    setBusy(false);
    onEngineChange();
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[60] bg-black/65 backdrop-blur-sm"
          />
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            className="fixed inset-y-0 right-0 z-[61] flex w-[min(420px,100vw)] flex-col border-l border-white/10 bg-[#080b11] shadow-2xl"
          >
            <header className="flex items-center justify-between border-b border-white/8 px-5 py-4">
              <h2 className="flex items-center gap-2 text-[15px] font-bold">
                <Sparkles className="h-4 w-4 text-[#7aa2ff]" />
                Settings
              </h2>
              <button onClick={onClose} className="rounded-lg p-1.5 text-mute transition-colors hover:bg-white/8 hover:text-chalk">
                <X className="h-4 w-4" />
              </button>
            </header>

            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-5">
              {/* Install */}
              <Section icon={<Smartphone className="h-3.5 w-3.5" />} title="Install this app">
                {installed ? (
                  <p className="flex items-center gap-1.5 text-[13px] text-bull">
                    <Check className="h-4 w-4" /> Installed — you're running the app.
                  </p>
                ) : canInstall ? (
                  <button
                    onClick={promptInstall}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-bull/15 px-3 py-2.5 text-[13px] font-semibold text-bull transition-colors hover:bg-bull/25"
                  >
                    <Download className="h-4 w-4" />
                    Install MarketPulse
                  </button>
                ) : iosShare ? (
                  <div className="rounded-xl border border-white/8 bg-white/[0.02] p-3 text-[12.5px] leading-relaxed text-mute">
                    <p className="mb-1 flex items-center gap-1.5 font-medium text-chalk">
                      <Share className="h-3.5 w-3.5" /> Add to Home Screen
                    </p>
                    Tap the Share button in Safari, then <span className="text-chalk">Add to Home Screen</span>. It installs like
                    any other app and works offline.
                  </div>
                ) : (
                  <p className="text-[12.5px] leading-relaxed text-mute">
                    In Chrome or Edge open the browser menu and choose <span className="text-chalk">Install MarketPulse</span>{" "}
                    (or “Install app”). It becomes a standalone window with its own icon.
                  </p>
                )}
              </Section>

              {/* On-device AI */}
              <Section icon={<Cpu className="h-3.5 w-3.5" />} title="On-device AI">
                <p className="mb-3 text-[12.5px] leading-relaxed text-mute">
                  A real transformer that reads each article and scores its sentiment — on this device, with no server. It works
                  offline once downloaded.
                </p>

                <div className="mb-3 flex items-center justify-between rounded-xl border border-white/8 bg-white/[0.02] p-3">
                  <div>
                    <p className="text-[13px] font-medium">Enable on-device model</p>
                    <p className="text-[11.5px] text-mute">Recommended — this is what makes the phone build standalone</p>
                  </div>
                  <Toggle
                    on={enabled}
                    onChange={(v) => {
                      setOnDeviceEnabled(v);
                      onEngineChange();
                    }}
                  />
                </div>

                <div className="space-y-1.5">
                  {Object.entries(MODELS).map(([id, m]) => (
                    <button
                      key={id}
                      disabled={!enabled || busy}
                      onClick={() => pickModel(id)}
                      className={cx(
                        "flex w-full items-center justify-between rounded-xl border p-2.5 text-left transition-colors disabled:opacity-40",
                        model === id ? "border-[#7aa2ff]/35 bg-[#7aa2ff]/8" : "border-white/8 hover:border-white/16 hover:bg-white/[0.03]"
                      )}
                    >
                      <span className="text-[12.5px] font-medium">{m.label}</span>
                      <span className="flex items-center gap-2 text-[11px] text-mute">
                        {m.size}
                        {model === id && <Check className="h-3.5 w-3.5 text-[#7aa2ff]" />}
                      </span>
                    </button>
                  ))}
                </div>

                {enabled && engine.ondevice.status === "loading" && (
                  <div className="mt-3">
                    <div className="mb-1 flex justify-between text-[11.5px] text-mute">
                      <span>Downloading model…</span>
                      <span className="tnum">{engine.ondevice.progress}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
                      <motion.div
                        className="h-full rounded-full bg-[#7aa2ff]"
                        initial={{ width: 0 }}
                        animate={{ width: `${engine.ondevice.progress}%` }}
                        transition={{ duration: 0.4 }}
                      />
                    </div>
                  </div>
                )}

                {engine.ondevice.status === "ready" && (
                  <p className="mt-3 flex items-center gap-1.5 text-[12.5px] text-bull">
                    <Check className="h-4 w-4" /> Ready ({engine.ondevice.backend}) — cached for offline use
                  </p>
                )}
                {engine.ondevice.status === "unavailable" && (
                  <p className="mt-3 flex items-start gap-1.5 text-[12.5px] text-amber-300/90">
                    <WifiOff className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>Model unavailable ({engine.ondevice.error}) — falling back to the built-in engine.</span>
                  </p>
                )}
              </Section>

              {/* Ollama */}
              <Section icon={<Bot className="h-3.5 w-3.5" />} title="Ollama (optional)">
                <p className="mb-3 text-[12.5px] leading-relaxed text-mute">
                  If Ollama is running on this machine (or on your PC over Wi-Fi), the app uses it for the full written verdict.
                  Nothing is sent anywhere else.
                </p>

                <div
                  className={cx(
                    "mb-3 flex items-center gap-2 rounded-xl border p-2.5 text-[12.5px]",
                    ollamaInfo().online ? "border-bull/25 bg-bull/6 text-bull" : "border-white/8 bg-white/[0.02] text-mute"
                  )}
                >
                  <span className={cx("h-2 w-2 shrink-0 rounded-full", ollamaInfo().online ? "bg-bull" : "bg-amber-400")} />
                  {ollamaInfo().online ? `Connected · ${ollamaInfo().model}` : `Not found · ${ollamaInfo().error ?? "not running"}`}
                </div>

                <label className="mb-1.5 block text-[11.5px] text-mute">Endpoint (optional)</label>
                <div className="flex gap-2">
                  <input
                    value={endpoint}
                    onChange={(e) => setEndpoint(e.target.value)}
                    placeholder="http://192.168.1.20:11434"
                    className="min-w-0 flex-1 rounded-xl border border-white/8 bg-white/[0.04] px-3 py-2 font-mono text-[12px] text-chalk outline-none placeholder:text-mute/60 focus:border-[#7aa2ff]/45"
                  />
                  <button
                    onClick={applyEndpoint}
                    disabled={busy}
                    className="shrink-0 rounded-xl border border-white/10 bg-white/6 px-3 text-[12.5px] font-medium text-chalk transition-colors hover:bg-white/12 disabled:opacity-50"
                  >
                    Test
                  </button>
                </div>
                <p className="mt-1.5 text-[11.5px] leading-relaxed text-mute">
                  Leave empty to use this device only. On your phone, enter your PC's address to use its Ollama over Wi-Fi.
                </p>
              </Section>

              {/* Storage */}
              <Section icon={<Database className="h-3.5 w-3.5" />} title="Storage">
                <p className="mb-3 text-[12.5px] leading-relaxed text-mute">
                  Quotes and articles are cached on the device so the app opens instantly and keeps working offline.
                </p>
                <button
                  onClick={() => {
                    cache.clear();
                    onEngineChange();
                  }}
                  className="flex items-center gap-2 rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2.5 text-[12.5px] font-medium text-chalk transition-colors hover:border-bear/30 hover:bg-bear/8"
                >
                  <Trash2 className="h-3.5 w-3.5 text-bear" />
                  Clear cached data
                </button>
                <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-mute">
                  <HardDrive className="h-3 w-3" /> {navigator.onLine ? "Online" : "Offline — showing cached data"}
                </p>
              </Section>

              {/* Credits */}
              <Section icon={<Heart className="h-3.5 w-3.5" />} title="Credits">
                <div className="rounded-xl border border-white/8 bg-white/[0.02] p-3">
                  <p className="text-[13px] font-semibold text-chalk">{AUTHOR}</p>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-mute">
                    Designed and built MarketPulse from scratch.
                  </p>
                </div>
                <ul className="mt-2.5 space-y-1 text-[11.5px] leading-relaxed text-mute">
                  <li>Quotes &amp; charts — Yahoo Finance, via the r.jina.ai relay</li>
                  <li>News — CNBC, MarketWatch and The New York Times feeds</li>
                  <li>Crypto — CoinGecko</li>
                  <li>Sentiment model — DistilBERT, running on-device</li>
                </ul>
                <p className="mt-2.5 text-[11px] leading-relaxed text-mute/80">
                  Prices and news are delayed and occasionally incomplete. Probabilities are a statistical
                  model&apos;s output for research and education — <span className="text-chalk">not financial advice</span>.
                </p>
              </Section>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-mute">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={cx("relative h-6 w-11 shrink-0 rounded-full transition-colors", on ? "bg-bull" : "bg-white/15")}
      aria-pressed={on}
    >
      <motion.span
        layout
        transition={{ type: "spring", stiffness: 500, damping: 34 }}
        className={cx("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow", on ? "left-[22px]" : "left-0.5")}
      />
    </button>
  );
}

declare global {
  interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
  }
}

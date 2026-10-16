import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity, Bot, ChevronDown, Cpu, Menu, RefreshCw, Settings as SettingsIcon, WifiOff, X, Zap,
} from "lucide-react";
import { cx, fmtTime } from "../lib/format";
import type { EngineStatus } from "../App";

interface Props {
  engine: EngineStatus;
  online: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onToggleSidebar: () => void;
  onOpenSettings: () => void;
  marketOpen: boolean;
}

export default function Header({
  engine,
  online,
  refreshing,
  onRefresh,
  onToggleSidebar,
  onOpenSettings,
  marketOpen,
}: Props) {
  const [clock, setClock] = useState(new Date());
  const [panel, setPanel] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!panel) return;
    const onDoc = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setPanel(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [panel]);

  const llm = engine.ollama.online;
  const neural = engine.ondevice.status === "ready";
  const active = llm || neural;

  return (
    <header className="relative z-40 shrink-0 border-b border-white/6 bg-[#070a10]/85 backdrop-blur-xl">
      <div className="flex h-14 items-center gap-2 px-3 sm:gap-3 sm:px-5">
        <button
          onClick={onToggleSidebar}
          className="rounded-lg p-2 text-mute transition-colors hover:bg-white/8 hover:text-chalk lg:hidden"
          aria-label="Toggle market list"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2.5">
          <motion.div
            animate={{ rotate: [0, 360] }}
            transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
            className="grid h-8 w-8 place-items-center rounded-xl border border-white/10 bg-gradient-to-br from-bull/25 to-[#7aa2ff]/20"
          >
            <Activity className="h-4 w-4 text-bull" />
          </motion.div>
          <div className="leading-none">
            <p className="text-[15px] font-extrabold tracking-tight">MarketPulse</p>
            <p className="hidden text-[10.5px] tracking-wide text-mute sm:block">AI market intelligence</p>
          </div>
        </div>

        <div className="flex-1" />

        {!online && (
          <span className="flex items-center gap-1.5 rounded-full border border-amber-400/25 bg-amber-400/8 px-2.5 py-1.5 text-[11px] font-medium text-amber-300">
            <WifiOff className="h-3 w-3" />
            <span className="hidden sm:inline">Offline</span>
          </span>
        )}

        {/* Engine chip */}
        <div className="relative" ref={popRef}>
          <motion.button
            onClick={() => setPanel((p) => !p)}
            whileTap={{ scale: 0.96 }}
            className={cx(
              "flex items-center gap-2 rounded-full border px-2.5 py-1.5 text-[11.5px] font-medium transition-colors sm:px-3",
              active ? "border-bull/25 bg-bull/8 text-bull hover:bg-bull/14" : "border-white/10 bg-white/4 text-mute hover:bg-white/8"
            )}
          >
            {engine.ondevice.status === "loading" ? (
              <Cpu className="h-3 w-3 animate-pulse" />
            ) : llm ? (
              <Bot className="h-3 w-3" />
            ) : neural ? (
              <Cpu className="h-3 w-3" />
            ) : (
              <Zap className="h-3 w-3" />
            )}
            <span className="hidden max-w-[120px] truncate sm:inline">{engine.label}</span>
            <span className={cx("relative flex h-2 w-2 sm:hidden")}>
              <span className={cx("absolute inline-flex h-full w-full animate-ping rounded-full opacity-70", active ? "bg-bull" : "bg-amber-400")} />
              <span className={cx("relative inline-flex h-2 w-2 rounded-full", active ? "bg-bull" : "bg-amber-400")} />
            </span>
            <ChevronDown className={cx("hidden h-3 w-3 transition-transform sm:block", panel && "rotate-180")} />
          </motion.button>

          <AnimatePresence>
            {panel && (
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.97 }}
                transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                className="absolute right-0 top-11 w-[min(330px,calc(100vw-24px))] overflow-hidden rounded-2xl border border-white/10 bg-[#0b0f17]/95 p-4 shadow-2xl backdrop-blur-xl"
              >
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <Cpu className="h-4 w-4 text-[#7aa2ff]" />
                  How the analysis runs
                </p>

                <Tier
                  icon={<Bot className="h-4 w-4" />}
                  title="Ollama (best)"
                  ok={engine.ollama.online}
                  detail={
                    engine.ollama.online
                      ? `Connected to ${engine.ollama.model}. Full written verdict, drivers and risks.`
                      : "Not running. Start Ollama, or point the app at your PC from Settings."
                  }
                />
                <Tier
                  icon={<Cpu className="h-4 w-4" />}
                  title="On-device AI"
                  ok={neural}
                  detail={
                    engine.ondevice.status === "loading"
                      ? `Downloading the model (${engine.ondevice.progress}%) — works offline afterwards.`
                      : neural
                      ? `Running ${engine.ondevice.backend} in this browser. Scores every article, fully offline.`
                      : "Disabled or unavailable. The app falls back to its built-in sentiment engine."
                  }
                />
                <Tier
                  icon={<Zap className="h-4 w-4" />}
                  title="Built-in engine"
                  ok
                  detail="Financial lexicon, momentum, RSI and moving averages. Always on, instant, no download."
                />

                <button
                  onClick={() => {
                    setPanel(false);
                    onOpenSettings();
                  }}
                  className="mt-3 w-full rounded-xl border border-white/10 bg-white/6 px-3 py-2 text-[12.5px] font-medium text-chalk transition-colors hover:bg-white/12"
                >
                  Open settings
                </button>

                <p className="mt-3 text-[11.5px] leading-relaxed text-mute">
                  Prices and articles come from public feeds. Every probability is a model estimate for research and education —
                  not financial advice.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <motion.button
          onClick={onRefresh}
          whileTap={{ scale: 0.92 }}
          className="rounded-lg p-2 text-mute transition-colors hover:bg-white/8 hover:text-chalk"
          title="Refresh data"
        >
          <RefreshCw className={cx("h-4 w-4", refreshing && "animate-spin text-[#7aa2ff]")} />
        </motion.button>

        <button
          onClick={onOpenSettings}
          className="rounded-lg p-2 text-mute transition-colors hover:bg-white/8 hover:text-chalk"
          title="Settings"
        >
          <SettingsIcon className="h-4 w-4" />
        </button>

        <div className="hidden items-center gap-2 border-l border-white/8 pl-3 sm:flex">
          <span className={cx("h-1.5 w-1.5 rounded-full", marketOpen ? "bg-bull" : "bg-white/25")} />
          <span className="tnum text-[12px] font-medium text-chalk/80">{fmtTime(clock.getTime())}</span>
          <span className="text-[10.5px] uppercase tracking-wider text-mute">{marketOpen ? "Live" : "Closed"}</span>
        </div>
      </div>
    </header>
  );
}

function Tier({ icon, title, ok, detail }: { icon: React.ReactNode; title: string; ok: boolean; detail: string }) {
  return (
    <div className="mt-3 flex items-start gap-2.5">
      <span className={cx("mt-0.5 shrink-0", ok ? "text-bull" : "text-white/25")}>{icon}</span>
      <div className="min-w-0">
        <p className={cx("text-[12.5px] font-semibold", ok ? "text-chalk" : "text-mute")}>{title}</p>
        <p className="mt-0.5 text-[11.5px] leading-relaxed text-mute">{detail}</p>
      </div>
    </div>
  );
}

export { X };

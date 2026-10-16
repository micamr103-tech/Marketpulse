import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import Header from "./components/Header";
import MobileShell from "./mobile/MobileShell";
import { useIsPhone } from "./lib/useIsPhone";
import Sidebar from "./components/Sidebar";
import MarketView from "./components/MarketView";
import BriefingStrip from "./components/BriefingStrip";
import Settings from "./components/Settings";
import { api, getConviction, onConviction, onRows } from "./lib/api";
import { useInterval } from "./lib/hooks";
import { detectOllama, ollamaInfo, onOllamaChange, type OllamaInfo } from "./app/ai/ollama";
import { onDeviceState, onOnDeviceChange, warmOnDevice, type OnDeviceState } from "./app/ai/ondevice";
import { cache } from "./lib/net";
import { MARKET_MAP } from "./app/markets";
import type { Analysis, Conviction, MarketDetail, MarketRow, NewsItem } from "./types";

const initialSymbol = () => {
  const p = new URLSearchParams(location.search).get("symbol");
  return p && MARKET_MAP.has(p) ? p : "^GSPC";
};

export interface EngineStatus {
  ollama: OllamaInfo;
  ondevice: OnDeviceState;
  online: boolean;
  label: string;
}

export default function App() {
  const [markets, setMarkets] = useState<MarketRow[]>([]);
  const [conviction, setConviction] = useState<Record<string, Conviction>>({});
  const [selected, setSelected] = useState<string>(initialSymbol);
  const [detail, setDetail] = useState<MarketDetail | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [ollama, setOllama] = useState<OllamaInfo>(ollamaInfo());
  const [ondevice, setOndevice] = useState<OnDeviceState>(onDeviceState());
  const [briefing, setBriefing] = useState<NewsItem[]>([]);
  const [range, setRange] = useState("1mo");
  const [mode, setMode] = useState<"line" | "candles">("line");
  const [loading, setLoading] = useState(true);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [fatal, setFatal] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const mainRef = useRef<HTMLElement>(null);
  const symbolRef = useRef(selected);

  /* ── Engine status ─────────────────────────────────────────────────── */
  useEffect(() => {
    const offA = onOllamaChange(setOllama);
    const offB = onOnDeviceChange(setOndevice);
    detectOllama();
    if (!new URLSearchParams(location.search).has("nodevice")) warmOnDevice();
    const id = setInterval(() => detectOllama(), 20_000);
    return () => {
      offA();
      offB();
      clearInterval(id);
    };
  }, []);

  const engine = useMemo<EngineStatus>(() => {
    const label = ollama.online ? ollama.model || "Ollama" : ondevice.status === "ready" ? "on-device AI" : "built-in engine";
    return { ollama, ondevice, online: ollama.online || ondevice.status === "ready", label };
  }, [ollama, ondevice]);

  /* ── Data ──────────────────────────────────────────────────────────── */
  const loadWatchlist = useCallback(async (quiet = false) => {
    try {
      if (!quiet) setRefreshing(true);
      const data = await api.watchlist();
      setMarkets(data.markets);
      if (Object.keys(data.conviction).length) setConviction(data.conviction);
      setFatal(null);
    } catch (err) {
      if (!markets.length) setFatal((err as Error).message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [markets.length]);

  useEffect(() => {
    loadWatchlist();
    api.briefing().then((b) => setBriefing(b.items)).catch(() => {});
    const offConviction = onConviction(() => setConviction({ ...getConviction() }));
    const offRows = onRows((rows) => setMarkets((prev) => (prev.length ? prev : rows)));
    return () => {
      offConviction();
      offRows();
    };
  }, [loadWatchlist]);

  useInterval(() => {
    if (navigator.onLine) loadWatchlist(true);
  }, 60_000);
  useInterval(() => {
    if (navigator.onLine) api.briefing().then((b) => setBriefing(b.items)).catch(() => {});
  }, 300_000);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    addEventListener("online", on);
    addEventListener("offline", off);
    return () => {
      removeEventListener("online", on);
      removeEventListener("offline", off);
    };
  }, []);

  /* ── Selected market ───────────────────────────────────────────────── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setAnalysisLoading(true);
      setAnalysis(null);
      try {
        const d = await api.market(selected, range);
        if (cancelled) return;
        setDetail(d);
        setLoading(false);
        if (d.analysis) setAnalysis(d.analysis);
        const a = await api.analysis(selected);
        if (cancelled) return;
        setAnalysis(a);
      } catch (err) {
        if (!cancelled && !detail) setFatal((err as Error).message);
      } finally {
        if (!cancelled) {
          setLoading(false);
          setAnalysisLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selected, range]);

  useEffect(() => {
    if (symbolRef.current !== selected) {
      symbolRef.current = selected;
      mainRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      const url = new URL(location.href);
      url.searchParams.set("symbol", selected);
      history.replaceState(null, "", url);
    }
  }, [selected]);

  const onSelect = useCallback((symbol: string) => {
    setSelected(symbol);
    setSidebarOpen(false);
  }, []);

  const onRefresh = useCallback(() => {
    cache.clear();
    loadWatchlist();
    api.briefing().then((b) => setBriefing(b.items)).catch(() => {});
    setAnalysisLoading(true);
    api
      .analysis(selected, { force: true })
      .then(setAnalysis)
      .catch(() => {})
      .finally(() => setAnalysisLoading(false));
  }, [loadWatchlist, selected]);

  const anyOpen = markets.some((m) => m.marketState === "REGULAR");
  const phone = useIsPhone();

  /* Phones get the native-style shell; wider screens get the terminal layout. */
  if (phone) {
    return (
      <MobileShell
        markets={markets}
        conviction={conviction}
        selected={selected}
        onSelect={onSelect}
        detail={detail}
        analysis={analysis}
        loading={loading}
        analysisLoading={analysisLoading}
        range={range}
        setRange={setRange}
        mode={mode}
        setMode={setMode}
        engine={engine}
        onRefresh={onRefresh}
        refreshing={refreshing}
      />
    );
  }

  return (
    <div className="relative flex h-[100dvh] flex-col overflow-hidden bg-ink">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-40 -top-40 h-[520px] w-[520px] animate-[drift_22s_ease-in-out_infinite_alternate] rounded-full bg-[#22d3a5]/8 blur-[120px]" />
        <div className="absolute -bottom-52 right-0 h-[560px] w-[560px] animate-[drift_26s_ease-in-out_infinite_alternate-reverse] rounded-full bg-[#7aa2ff]/8 blur-[130px]" />
        <div className="absolute left-1/2 top-1/3 h-[380px] w-[380px] animate-[breathe_9s_ease-in-out_infinite] rounded-full bg-[#ff4d6d]/5 blur-[140px]" />
      </div>

      <Header
        engine={engine}
        online={online}
        refreshing={refreshing}
        onRefresh={onRefresh}
        onToggleSidebar={() => setSidebarOpen((o) => !o)}
        onOpenSettings={() => setSettingsOpen(true)}
        marketOpen={anyOpen}
      />

      <div className="flex min-h-0 flex-1">
        <main ref={mainRef} className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
          <div className="mx-auto w-full max-w-[1180px] px-3 pt-4 sm:px-6">
            <BriefingStrip items={briefing} onPick={onSelect} />

            {fatal && !detail ? (
              <div className="mt-8 rounded-3xl border border-bear/25 bg-bear/8 p-8 text-center">
                <p className="text-lg font-semibold text-bear">No market data yet</p>
                <p className="mx-auto mt-2 max-w-md text-sm text-mute">
                  {fatal}. Check your connection and press refresh — cached data appears once you have loaded the app online.
                </p>
              </div>
            ) : (
              <AnimatePresence mode="wait">
                <motion.div
                  key={selected + range}
                  initial={{ opacity: 0, y: 14, filter: "blur(6px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  exit={{ opacity: 0, y: -10, filter: "blur(6px)" }}
                  transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
                  className="mt-4"
                >
                  {detail ? (
                    <MarketView
                      detail={detail}
                      analysis={analysis}
                      loading={loading}
                      analysisLoading={analysisLoading}
                      range={range}
                      setRange={setRange}
                      mode={mode}
                      setMode={setMode}
                      engine={engine}
                    />
                  ) : (
                    <div className="mt-6 space-y-4">
                      <div className="h-16 w-1/2 rounded-2xl skeleton" />
                      <div className="h-64 w-full rounded-3xl skeleton" />
                      <div className="h-80 w-full rounded-3xl skeleton" />
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            )}

            <p className="mt-8 text-center text-[11px] leading-relaxed text-mute/70">
              Public market feeds · probabilistic model output, not investment advice
            </p>
          </div>
        </main>

        <aside className="hidden w-[352px] shrink-0 border-l border-white/6 bg-[#070a10]/60 backdrop-blur-xl lg:block">
          <Sidebar
            markets={markets}
            conviction={conviction}
            selected={selected}
            onSelect={onSelect}
            loading={loading}
          />
        </aside>

        <AnimatePresence>
          {sidebarOpen && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setSidebarOpen(false)}
                className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden"
              />
              <motion.aside
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ type: "spring", stiffness: 320, damping: 34 }}
                className="fixed inset-y-0 right-0 z-50 w-[330px] border-l border-white/10 bg-[#070a10] shadow-2xl lg:hidden"
              >
                <Sidebar markets={markets} conviction={conviction} selected={selected} onSelect={onSelect} loading={loading} />
              </motion.aside>
            </>
          )}
        </AnimatePresence>
      </div>

      <Settings open={settingsOpen} onClose={() => setSettingsOpen(false)} engine={engine} onEngineChange={onRefresh} />
    </div>
  );
}

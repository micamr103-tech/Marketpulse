import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useScroll } from "framer-motion";
import MobileNav from "./MobileNav";
import TabBar, { type TabKey } from "./TabBar";
import MarketsPane from "./MarketsPane";
import Settings from "../components/Settings";
import { InstallBanner, InstallSheet, Splash, useInstallState } from "./InstallLauncher";
import MarketView from "../components/MarketView";
import NewsFeed from "../components/NewsFeed";
import { IOS, spring, springSoft } from "./ios";
import type { EngineStatus } from "../App";
import type { Analysis, Conviction, MarketDetail, MarketRow, NewsItem } from "../types";

interface Props {
  markets: MarketRow[];
  conviction: Record<string, Conviction>;
  selected: string;
  onSelect: (s: string) => void;
  detail: MarketDetail | null;
  analysis: Analysis | null;
  loading: boolean;
  analysisLoading: boolean;
  range: string;
  setRange: (r: string) => void;
  mode: "line" | "candles";
  setMode: (m: "line" | "candles") => void;
  engine: EngineStatus;
  onRefresh: () => void;
  refreshing: boolean;
}

/** The phone app: three tabs, an iOS navigation bar and a translucent tab bar. */
export default function MobileShell(props: Props) {
  const { selected, detail, onSelect, engine } = props;
  const [tab, setTab] = useState<TabKey>("analysis");
  const [settings, setSettings] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const [splash, setSplash] = useState(true);
  const [stack, setStack] = useState<{ symbol: string }[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const install = useInstallState();

  const { scrollY } = useScroll({ container: scrollRef });
  const isDetail = stack.length > 0;

  // Launch screen, like a native app booting.
  useEffect(() => {
    const id = setTimeout(() => setSplash(false), 1100);
    return () => clearTimeout(id);
  }, []);

  // Tapping a market pushes it onto the navigation stack.
  useEffect(() => {
    if (tab !== "markets") return;
  }, [tab]);

  const open = (symbol: string) => {
    onSelect(symbol);
    setStack((s) => [...s, { symbol }]);
    setTab("analysis");
    scrollRef.current?.scrollTo({ top: 0 });
  };

  const back = () => {
    setStack((s) => s.slice(0, -1));
    setTab("markets");
  };

  /**
   * Android's hardware back button. Closes a detail view, then returns to the
   * Markets tab; returns false when there is nothing left to pop so the OS can
   * close the app.
   */
  useEffect(() => {
    const handler = () => {
      if (stack.length > 0) {
        back();
        return true;
      }
      if (tab !== "markets") {
        setTab("markets");
        return true;
      }
      return false;
    };
    (window as unknown as { __mpBack?: () => boolean }).__mpBack = handler;
    return () => {
      delete (window as unknown as { __mpBack?: () => boolean }).__mpBack;
    };
  }, [stack.length, tab]);

  const title =
    tab === "markets" ? "Markets" : tab === "news" ? "News" : (detail?.def.short ?? "Analysis");
  const subtitle =
    tab === "analysis" && detail
      ? `${detail.def.category.toUpperCase()} · ${detail.quote.currency}`
      : tab === "markets"
      ? `${props.markets.length} tracked`
      : `${(props.analysis?.news ?? detail?.news ?? []).length} articles read by AI`;

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden" style={{ background: IOS.color.bg }}>
      <Splash show={splash} />

      <MobileNav
        title={title}
        subtitle={subtitle}
        scrollY={scrollY}
        engine={engine}
        onBack={isDetail ? back : undefined}
        onSettings={() => setSettings(true)}
        onRefresh={tab === "analysis" ? props.onRefresh : undefined}
        refreshing={props.refreshing}
      />

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={springSoft}
          >
            {tab === "markets" && (
              <>
                <InstallBanner install={install} onOpen={() => setInstallOpen(true)} />
                <MarketsPane
                  markets={props.markets}
                  conviction={props.conviction}
                  selected={selected}
                  onSelect={open}
                  loading={props.loading}
                />
              </>
            )}

            {tab === "analysis" &&
              (props.detail ? (
                <MarketView
                  detail={props.detail}
                  analysis={props.analysis}
                  loading={props.loading}
                  analysisLoading={props.analysisLoading}
                  range={props.range}
                  setRange={props.setRange}
                  mode={props.mode}
                  setMode={props.setMode}
                  engine={engine}
                />
              ) : (
                <SkeletonAnalysis />
              ))}

            {tab === "news" && (
              <div className="px-3 pb-28">
                <NewsFeed
                  items={analysisNews(props)}
                  loading={props.loading}
                  aiScored={props.analysis?.verdict.engine === "ollama"}
                  model={props.analysis?.verdict.model ?? null}
                />
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <TabBar
        active={tab}
        onChange={setTab}
        newsBadge={(props.analysis?.news ?? props.detail?.news ?? []).filter((n) => n.sentimentBy).length}
      />

      <InstallSheet open={installOpen} onClose={() => setInstallOpen(false)} install={install} />
      <Settings
        open={settings}
        onClose={() => setSettings(false)}
        engine={engine}
        onEngineChange={props.onRefresh}
      />
    </div>
  );
}

function analysisNews(p: Props): NewsItem[] {
  return p.analysis?.news ?? p.detail?.news ?? [];
}

function SkeletonAnalysis() {
  return (
    <div className="space-y-3 px-4 pb-28 pt-2">
      <div className="h-24 animate-pulse rounded-[18px]" style={{ background: IOS.color.surface }} />
      <div className="h-64 animate-pulse rounded-[18px]" style={{ background: IOS.color.surface }} />
      <div className="h-40 animate-pulse rounded-[18px]" style={{ background: IOS.color.surface }} />
    </div>
  );
}

export { spring };

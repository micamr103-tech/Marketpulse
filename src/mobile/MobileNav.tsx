import { motion, useTransform, type MotionValue } from "framer-motion";
import { ChevronLeft, Cpu, RefreshCw, Search, Settings as SettingsIcon } from "lucide-react";
import { IOS, spring } from "./ios";
import type { EngineStatus } from "../App";

interface Props {
  title: string;
  subtitle?: string;
  scrollY: MotionValue<number>;
  onBack?: () => void;
  onSearch?: () => void;
  onSettings?: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
  engine: EngineStatus;
  large?: boolean;
}

/**
 * UINavigationBar behaviour: a large title that collapses into a small centred
 * one as the content scrolls, with a hairline separator fading in underneath.
 */
export default function MobileNav({
  title,
  subtitle,
  scrollY,
  onBack,
  onSearch,
  onSettings,
  onRefresh,
  refreshing,
  engine,
  large = true,
}: Props) {
  const progress = useTransform(scrollY, [0, 56], [0, 1], { clamp: true });
  const hairline = useTransform(progress, [0.15, 0.5], [0, 1]);
  const smallTitle = useTransform(progress, [0.35, 0.8], [0, 1], { clamp: true });
  const titleOpacity = useTransform(progress, [0, 0.55], [1, 0], { clamp: true });
  // Height is a real pixel value — the opacity transform above is a 0–1 ratio.
  const titleHeight = useTransform(progress, [0, 0.55], [58, 0], { clamp: true });

  return (
    <header className="sticky top-0 z-30" style={{ paddingTop: IOS.safe.top }}>
      {/* blurred bar */}
      <div className="relative h-11">
        <motion.div style={{ opacity: hairline }} className="absolute inset-0 border-b border-white/10" />
        <div
          className="absolute inset-0 backdrop-blur-2xl"
          style={{ background: "rgba(10,10,12,0.72)" }}
        />

        <div className="relative flex h-11 items-center justify-between px-2">
          {/* left: back or brand */}
          <div className="flex min-w-[72px] items-center gap-1">
            {onBack && (
              <motion.button
                whileTap={{ scale: 0.9, opacity: 0.6 }}
                onClick={onBack}
                className="flex items-center gap-0.5 rounded-lg px-1.5 py-1"
                style={{ color: IOS.color.blue }}
                aria-label="Back"
              >
                <ChevronLeft className="h-5 w-5" strokeWidth={2.5} />
                <span className="text-[17px]">Back</span>
              </motion.button>
            )}
          </div>

          {/* centre: collapsing title */}
          <motion.div
            style={{ opacity: smallTitle }}
            className="pointer-events-none absolute inset-x-0 flex flex-col items-center justify-center"
          >
            <motion.span
              initial={{ y: 6, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ ...spring, delay: 0.05 }}
              className="max-w-[60vw] truncate text-[17px] font-semibold tracking-[-0.01em]"
            >
              {title}
            </motion.span>
            {subtitle && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-[11px] leading-tight"
                style={{ color: IOS.color.secondary }}
              >
                {subtitle}
              </motion.span>
            )}
          </motion.div>

          {/* right: actions */}
          <div className="flex min-w-[72px] items-center justify-end gap-0.5">
            {onSearch && (
              <motion.button whileTap={{ scale: 0.9, opacity: 0.6 }} onClick={onSearch} aria-label="Search" className="p-1.5" style={{ color: IOS.color.blue }}>
                <Search className="h-5 w-5" strokeWidth={2.2} />
              </motion.button>
            )}
            {onRefresh && (
              <motion.button
                whileTap={{ scale: 0.9, opacity: 0.6 }}
                onClick={onRefresh}
                aria-label="Refresh"
                className="p-1.5"
                style={{ color: IOS.color.blue }}
              >
                <RefreshCw className={cxSpin(refreshing)} />
              </motion.button>
            )}
            {onSettings && (
              <motion.button whileTap={{ scale: 0.9, opacity: 0.6 }} onClick={onSettings} aria-label="Settings" className="p-1.5" style={{ color: IOS.color.blue }}>
                <SettingsIcon className="h-5 w-5" strokeWidth={2.2} />
              </motion.button>
            )}
          </div>
        </div>
      </div>

      {/* large title */}
      {large && (
        <motion.div
          style={{ opacity: titleOpacity, height: titleHeight }}
          className="overflow-hidden px-4"
        >
          <div className="pb-1 pt-1">
            <h1 className="text-[32px] font-bold leading-[1.12] tracking-[-0.022em]">{title}</h1>
            <div className="mt-0.5 flex items-center gap-2">
              {subtitle && (
                <span className="text-[13px]" style={{ color: IOS.color.secondary }}>
                  {subtitle}
                </span>
              )}
              <EnginePill engine={engine} />
            </div>
          </div>
        </motion.div>
      )}
    </header>
  );
}

function EnginePill({ engine }: { engine: EngineStatus }) {
  const active = engine.ollama.online || engine.ondevice.status === "ready";
  const label = engine.label;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[10.5px] font-medium"
      style={{
        color: active ? IOS.color.green : IOS.color.secondary,
        background: active ? "rgba(48,209,88,0.14)" : "rgba(120,120,128,0.2)",
      }}
    >
      <Cpu className="h-2.5 w-2.5" />
      {label}
    </span>
  );
}

const cxSpin = (on?: boolean) => (on ? "h-5 w-5 animate-spin" : "h-5 w-5");

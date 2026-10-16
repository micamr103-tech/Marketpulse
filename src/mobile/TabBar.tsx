import { motion } from "framer-motion";
import { ChartNoAxesCombined, Newspaper, TrendingUp } from "lucide-react";
import { IOS, TAB_BAR_HEIGHT, haptic, spring } from "./ios";

export type TabKey = "markets" | "analysis" | "news";

const TABS: { key: TabKey; label: string; icon: typeof TrendingUp }[] = [
  { key: "markets", label: "Markets", icon: TrendingUp },
  { key: "analysis", label: "Analysis", icon: ChartNoAxesCombined },
  { key: "news", label: "News", icon: Newspaper },
];

interface Props {
  active: TabKey;
  onChange: (t: TabKey) => void;
  /** Small dot under the News tab when the AI has scored new stories. */
  newsBadge?: number;
}

/** Translucent tab bar with the sliding selection pill, iOS-style. */
export default function TabBar({ active, onChange, newsBadge = 0 }: Props) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-black/70 backdrop-blur-2xl"
      style={{ paddingBottom: IOS.safe.bottom, height: TAB_BAR_HEIGHT + 18 }}
    >
      <div className="mx-auto flex max-w-lg" style={{ height: TAB_BAR_HEIGHT }}>
        {TABS.map((t) => {
          const Icon = t.icon;
          const on = t.key === active;
          return (
            <button
              key={t.key}
              onClick={() => {
                if (!on) haptic(7);
                onChange(t.key);
              }}
              className="relative flex flex-1 select-none flex-col items-center justify-center gap-[3px]"
              aria-label={t.label}
              aria-current={on ? "page" : undefined}
            >
              {on && (
                <motion.span
                  layoutId="tab-indicator"
                  transition={spring}
                  className="absolute inset-x-3 inset-y-0.5 rounded-xl"
                  style={{ background: "rgba(255,255,255,0.07)" }}
                />
              )}
              <span className="relative flex items-center">
                <Icon
                  className="h-[23px] w-[23px]"
                  strokeWidth={on ? 2.4 : 1.9}
                  style={{ color: on ? IOS.color.blue : IOS.color.tertiary }}
                />
                {t.key === "news" && newsBadge > 0 && (
                  <span
                    className="absolute -right-1.5 -top-1 h-[7px] w-[7px] rounded-full"
                    style={{ background: IOS.color.red }}
                  />
                )}
              </span>
              <span
                className="relative text-[10px] font-medium tracking-[0.01em]"
                style={{ color: on ? IOS.color.label : IOS.color.tertiary }}
              >
                {t.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

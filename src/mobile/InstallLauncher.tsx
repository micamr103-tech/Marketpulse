import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowDownToLine, Check, Share, Smartphone, X } from "lucide-react";
import { isInstalledApp } from "../lib/platform";
import { IOS, spring } from "./ios";

/* ── Install state ───────────────────────────────────────────────────────── */

export interface InstallState {
  canPrompt: boolean;
  installed: boolean;
  promptInstall: () => Promise<void>;
}

export function useInstallState(): InstallState {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  // Inside the packaged APK this is already true, which keeps the install
  // banner and the "how to install" sheet from appearing in an installed app.
  const [installed, setInstalled] = useState(isInstalledApp);

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

  return {
    canPrompt: Boolean(deferred),
    installed,
    promptInstall: async () => {
      if (!deferred) return;
      await deferred.prompt();
      const choice = await deferred.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
      setDeferred(null);
    },
  };
}

export const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

export const isAndroid = () => /android/i.test(navigator.userAgent);

/** True while the app runs as a native-ish installed app. */
export const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches ||
  (navigator as { standalone?: boolean }).standalone === true;

/* ── Launcher sheet ──────────────────────────────────────────────────────── */

interface SheetProps {
  open: boolean;
  onClose: () => void;
  install: InstallState;
}

/**
 * The "get the app" launcher. Android gets a real one-tap install; iOS gets
 * the Share → Add to Home Screen route, which is the only way Apple allows.
 */
export function InstallSheet({ open, onClose, install }: SheetProps) {
  const ios = isIOS();

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/60"
          />
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 340, damping: 36 }}
            className="fixed inset-x-0 bottom-0 z-50 rounded-t-[20px] px-5 pb-8 pt-3"
            style={{ background: "#1C1C1E", paddingBottom: "calc(32px + env(safe-area-inset-bottom, 0px))" }}
          >
            <div className="mx-auto mb-4 h-1 w-9 rounded-full" style={{ background: IOS.color.fillStrong }} />

            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-[22px] font-bold tracking-[-0.02em]">Install MarketPulse</h2>
                <p className="mt-0.5 text-[14px]" style={{ color: IOS.color.secondary }}>
                  Full screen, own icon, works offline.
                </p>
              </div>
              <button onClick={onClose} className="rounded-full p-1.5" style={{ background: IOS.color.fill }}>
                <X className="h-4 w-4" />
              </button>
            </div>

            {install.installed ? (
              <p className="mt-5 flex items-center gap-2 rounded-[14px] p-4 text-[15px]" style={{ background: IOS.color.surfaceRaised, color: IOS.color.green }}>
                <Check className="h-5 w-5" /> Already installed
              </p>
            ) : install.canPrompt ? (
              <button
                onClick={async () => {
                  await install.promptInstall();
                  onClose();
                }}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-[14px] py-3.5 text-[17px] font-semibold text-white"
                style={{ background: IOS.color.blue }}
              >
                <ArrowDownToLine className="h-5 w-5" />
                Add to Home Screen
              </button>
            ) : (
              <Steps ios={ios} />
            )}

            <p className="mt-4 text-center text-[12px]" style={{ color: IOS.color.tertiary }}>
              No store, no account. Everything runs on this device.
            </p>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function Steps({ ios }: { ios: boolean }) {
  const steps = ios
    ? [
        { icon: <Share className="h-5 w-5" />, text: "Tap the Share button in Safari's toolbar" },
        { icon: <Smartphone className="h-5 w-5" />, text: "Choose “Add to Home Screen”" },
        { icon: <Check className="h-5 w-5" />, text: "Open MarketPulse from your home screen" },
      ]
    : [
        { icon: <Share className="h-5 w-5" />, text: "Open the browser menu (⋮)" },
        { icon: <Smartphone className="h-5 w-5" />, text: "Choose “Install app” or “Add to Home screen”" },
        { icon: <Check className="h-5 w-5" />, text: "Launch it like any other app" },
      ];

  return (
    <ol className="mt-5 space-y-2">
      {steps.map((s, i) => (
        <motion.li
          key={s.text}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...spring, delay: 0.05 + i * 0.07 }}
          className="flex items-center gap-3 rounded-[14px] p-3.5"
          style={{ background: IOS.color.surfaceRaised }}
        >
          <span
            className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px]"
            style={{ background: IOS.color.blue, color: "#fff" }}
          >
            {s.icon}
          </span>
          <span className="text-[15px] leading-snug">{s.text}</span>
        </motion.li>
      ))}
    </ol>
  );
}

/* ── Splash screen ───────────────────────────────────────────────────────── */

/** The launch screen a native app shows while it boots. */
export function Splash({ show }: { show: boolean }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.04 }}
          transition={{ duration: 0.45, ease: [0.32, 0.72, 0, 1] }}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black"
        >
          <motion.div
            initial={{ scale: 0.86, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ ...spring, delay: 0.05 }}
            className="grid h-20 w-20 place-items-center rounded-[20px]"
            style={{
              background: "linear-gradient(140deg, rgba(34,211,165,0.28), rgba(10,132,255,0.22))",
              border: "1px solid rgba(255,255,255,0.12)",
            }}
          >
            <svg viewBox="0 0 48 48" className="h-11 w-11">
              <motion.path
                d="M6 34 L16 22 L24 28 L32 14 L42 8"
                fill="none"
                stroke="#30D158"
                strokeWidth={4}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.9, ease: "easeOut", delay: 0.15 }}
              />
            </svg>
          </motion.div>

          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35 }}
            className="mt-4 text-[17px] font-semibold tracking-[-0.01em]"
          >
            MarketPulse
          </motion.p>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="mt-1 text-[13px]"
            style={{ color: IOS.color.tertiary }}
          >
            AI market intelligence
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Slim banner shown until the app is installed. */
export function InstallBanner({ install, onOpen }: { install: InstallState; onOpen: () => void }) {
  const [dismissed, setDismissed] = useState(() => sessionStorage.getItem("mp:install-dismissed") === "1");

  if (install.installed || dismissed) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -12, height: 0 }}
      animate={{ opacity: 1, y: 0, height: "auto" }}
      exit={{ opacity: 0, y: -12, height: 0 }}
      transition={spring}
      className="mx-3 mt-2 overflow-hidden rounded-[14px] p-3"
      style={{ background: IOS.color.surface }}
    >
      <div className="flex items-center gap-3">
        <div
          className="grid h-9 w-9 shrink-0 place-items-center rounded-[9px]"
          style={{ background: "linear-gradient(140deg, rgba(34,211,165,0.3), rgba(10,132,255,0.25))" }}
        >
          <Smartphone className="h-4.5 w-4.5" style={{ color: IOS.color.green }} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] font-semibold leading-tight">Install MarketPulse</p>
          <p className="text-[12.5px]" style={{ color: IOS.color.secondary }}>
            Full screen, own icon, works offline
          </p>
        </div>
        <button
          onClick={onOpen}
          className="shrink-0 rounded-full px-3.5 py-1.5 text-[14px] font-semibold text-white"
          style={{ background: IOS.color.blue }}
        >
          {install.canPrompt ? "Install" : "How"}
        </button>
        <button
          onClick={() => {
            sessionStorage.setItem("mp:install-dismissed", "1");
            setDismissed(true);
          }}
          className="shrink-0 rounded-full p-1"
          style={{ background: IOS.color.fill }}
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </motion.div>
  );
}

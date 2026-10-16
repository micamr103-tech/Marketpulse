import clsx, { type ClassValue } from "clsx";
import type { Direction } from "../types";

export const cx = (...args: ClassValue[]) => clsx(args);

export function fmtPrice(n: number | null | undefined, currency = "USD"): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  const digits = abs >= 1000 ? 2 : abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(n);
  } catch {
    return `${n.toFixed(digits)} ${currency}`;
  }
}

export function fmtNum(n: number | null | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function fmtPct(n: number | null | undefined, digits = 2, sign = true): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${sign && n > 0 ? "+" : ""}${n.toFixed(digits)}%`;
}

export function fmtCompact(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(Math.round(n));
}

export function timeAgo(ts: number | null | undefined): string {
  if (!ts) return "—";
  const diff = Date.now() - ts;
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

export const bullBear = (v: number) => (v > 0 ? "text-bull" : v < 0 ? "text-bear" : "text-mute");

export const dirTone = (d: Direction | undefined) =>
  d === "bullish" ? "text-bull" : d === "bearish" ? "text-bear" : "text-mute";

export const dirRing = (d: Direction | undefined) =>
  d === "bullish"
    ? "rgba(34,211,165,0.5)"
    : d === "bearish"
      ? "rgba(255,77,109,0.5)"
      : "rgba(125,139,161,0.45)";

export function sparkPath(values: number[], width: number, height: number) {
  if (!values?.length) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const step = width / Math.max(1, values.length - 1);
  return values
    .map((v, i) => `${i === 0 ? "M" : "L"}${(i * step).toFixed(2)},${(height - ((v - min) / span) * height).toFixed(2)}`)
    .join(" ");
}
import { useEffect, useRef, useState } from "react";

/**
 * Animated number: eases from the previous value to the new one.
 * Used for prices, percentages and the probability dial.
 */
export function useCountUp(value: number, duration = 900, decimals = 2) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (!Number.isFinite(value)) return;
    const from = fromRef.current;
    const delta = value - from;
    if (Math.abs(delta) < 10 ** -decimals) {
      setDisplay(value);
      fromRef.current = value;
      return;
    }

    const start = performance.now();
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const current = from + delta * ease(t);
      setDisplay(current);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = value;
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      fromRef.current = value;
    };
  }, [value, duration, decimals]);

  return display;
}

/** Fires `fn` every `ms` while `active`, pausing while the tab is hidden. */
export function useInterval(fn: () => void, ms: number | null) {
  const savedRef = useRef(fn);
  useEffect(() => {
    savedRef.current = fn;
  }, [fn]);

  useEffect(() => {
    if (ms == null) return;
    let id: number;
    const run = () => {
      if (!document.hidden) savedRef.current();
    };
    id = window.setInterval(run, ms);
    return () => window.clearInterval(id);
  }, [ms]);
}

/** Debounced value — used by the sidebar search field. */
export function useDebounced<T>(value: T, ms = 180) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}
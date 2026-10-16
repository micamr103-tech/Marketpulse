import { useEffect, useState } from "react";

/**
 * True on phone-sized viewports. Matches CSS, so it stays correct when the
 * window is resized or a tablet is rotated.
 */
export function useIsPhone(breakpoint = 768): boolean {
  const [isPhone, setIsPhone] = useState(() =>
    typeof window === "undefined" ? false : window.innerWidth < breakpoint
  );

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const onChange = () => setIsPhone(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [breakpoint]);

  return isPhone;
}

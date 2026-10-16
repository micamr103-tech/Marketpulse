/**
 * iOS-flavoured design tokens and motion.
 *
 * The desktop app uses the dense "terminal" look; on phones the app switches to
 * Apple's system language — grouped inset lists, large collapsing titles, a
 * translucent tab bar and the standard spring curve.
 */

export const IOS = {
  /* Apple's dark palette */
  color: {
    bg: "#000000",
    bgElevated: "#0A0A0C",
    surface: "#1C1C1E",
    surfaceRaised: "#2C2C2E",
    surfacePressed: "#3A3A3C",
    fill: "rgba(120,120,128,0.24)",
    fillStrong: "rgba(120,120,128,0.36)",
    separator: "rgba(255,255,255,0.12)",
    label: "#FFFFFF",
    secondary: "rgba(235,235,245,0.62)",
    tertiary: "rgba(235,235,245,0.32)",
    blue: "#0A84FF",
    green: "#30D158",
    red: "#FF453A",
    orange: "#FF9F0A",
    purple: "#BF5AF2",
  },
  /* Corner radii, per Apple's HIG */
  radius: { sm: 10, md: 14, lg: 18, xl: 24, pill: 999 },
  /* Safe areas: notch, status bar and home indicator */
  safe: {
    top: "env(safe-area-inset-top, 0px)",
    bottom: "env(safe-area-inset-bottom, 0px)",
    left: "env(safe-area-inset-left, 0px)",
    right: "env(safe-area-inset-right, 0px)",
  },
} as const;

/** UIKit's standard spring — used for every transition on iOS. */
export const spring = { type: "spring", stiffness: 420, damping: 34, mass: 0.9 } as const;
export const springSoft = { type: "spring", stiffness: 260, damping: 30, mass: 1 } as const;
export const springSnappy = { type: "spring", stiffness: 600, damping: 34, mass: 0.7 } as const;

/** Tab bar metrics, excluding the home-indicator inset. */
export const TAB_BAR_HEIGHT = 52;

/** Light haptic on tab change where the platform supports it (Android). */
export function haptic(pattern: number | number[] = 8) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* iOS Safari has no vibration API — silently skip */
  }
}

/**
 * How this build is being run. Everything below the packaged Android app
 * (browser, installed PWA, the Electron desktop app) can still be installed or
 * updated, so install prompts belong there — but inside the APK they are
 * nonsense, since the app is already on the launcher.
 */

/**
 * True inside the packaged Android app.
 *
 * The APK bundles the web build and serves it from a virtual https origin
 * (https://marketpulse.local) so it gets a real secure origin: stable
 * localStorage, normal CORS behaviour, and a service-worker check that passes.
 * That host is unique to the native shell, which makes it a reliable signal.
 */
export const isPackagedApp = () => location.hostname === "marketpulse.local";

/** True when running as an installed app rather than a browser tab. */
export const isInstalledApp = () =>
  isPackagedApp() ||
  matchMedia("(display-mode: standalone)").matches ||
  (navigator as { standalone?: boolean }).standalone === true ||
  location.protocol === "file:";
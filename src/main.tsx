import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

/* Register the service worker so the app installs and keeps working offline.
   Production only — a dev-time SW would serve stale bundles. The packaged
   Android app serves the bundle from a virtual origin, where there is nothing
   to gain from one (the files are already local). */
import { isPackagedApp } from "./lib/platform";

if (
  "serviceWorker" in navigator &&
  import.meta.env.PROD &&
  !isPackagedApp() &&
  !new URLSearchParams(location.search).has("nosw")
) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* unsupported or blocked — the app still works, just without offline */
    });
  });
}

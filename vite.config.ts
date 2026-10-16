import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/**
 * Two build flavours from one source tree:
 *  • default        → static web app (PWA). Absolute paths for the SW + manifest.
 *  • mode=electron  → bundled into the desktop app and loaded over file://,
 *                     so every asset reference must be relative.
 */
export default defineConfig(({ mode }) => {
  const forElectron = mode === "electron";

  return {
    base: forElectron ? "./" : "/",
    plugins: [react(), tailwindcss()],
    server: {
      port: 5173,
      host: true,
    },
    build: {
      outDir: "dist",
      sourcemap: false,
      // transformers.js ships a large ONNX/WASM runtime; keep it in its own
      // chunk so the app shell loads instantly and the model code is fetched
      // only when the on-device AI is first used.
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes("@huggingface/transformers")) return "on-device-ai";
            if (id.includes("recharts") || id.includes("d3-")) return "charts";
            if (id.includes("framer-motion")) return "motion";
            if (id.includes("node_modules/react")) return "react";
          },
        },
      },
      chunkSizeWarningLimit: 2200,
    },
  };
});

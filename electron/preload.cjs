// Preload runs in an isolated world. The app needs no Node access at all —
// this only marks the environment so the renderer can detect it's in Electron.
const { contextBridge } = require("electron");

contextBridge.exposeInMainWorld("marketpulseDesktop", {
  isDesktop: true,
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
  },
});

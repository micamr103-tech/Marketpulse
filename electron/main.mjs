/**
 * Electron main process.
 *
 * The app is completely static — everything (data fetching, analysis, the
 * on-device model) happens inside the renderer, so there is no server to run,
 * no port to pick and nothing to install alongside it.
 */
import { app, BrowserWindow, shell, session, Menu, nativeTheme } from "electron";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;
const DEV_URL = process.env.VITE_DEV_SERVER_URL || "http://localhost:5173";

/* Single instance: clicking the icon again focuses the existing window. */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

function createWindow() {
  nativeTheme.themeSource = "dark";

  const win = new BrowserWindow({
    width: 1500,
    height: 950,
    minWidth: 420,
    minHeight: 560,
    show: false,
    backgroundColor: "#05070b",
    title: "MarketPulse",
    icon: path.join(__dirname, "..", "build", "icon-256.png"),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  });

  win.once("ready-to-show", () => win.show());

  // External links open in the real browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  // The renderer is an untrusted-content surface: no node, no extra permissions.
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));

  if (isDev) {
    win.loadURL(DEV_URL);
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  return win;
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: "MarketPulse",
        submenu: [
          { role: "reload" },
          { role: "forceReload" },
          { role: "toggleDevTools" },
          { type: "separator" },
          { role: "quit" },
        ],
      },
      {
        label: "View",
        submenu: [
          { role: "zoomIn" },
          { role: "zoomOut" },
          { role: "resetZoom" },
          { type: "separator" },
          { role: "togglefullscreen" },
        ],
      },
      {
        label: "Edit",
        submenu: [{ role: "copy" }, { role: "selectAll" }],
      },
    ])
  );

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

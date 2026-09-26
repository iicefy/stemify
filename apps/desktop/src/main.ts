import { app, BrowserWindow, Menu, dialog, shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import type { Server } from "node:http";
import { createSplash, manualCheckForUpdates, runStartupUpdate, startBackgroundUpdates } from "./updater/index.js";

let server: Server | null = null;
let mainWindow: BrowserWindow | null = null;
let stopSeparation: () => void = () => {};
let isSeparating: () => boolean = () => false;

/**
 * Points the API server at the right places *before* it is imported (its
 * modules read these at load time). Packaged, everything - the web build,
 * Python, the Demucs model - lives inside the .app; user data goes to
 * Application Support. Unpackaged (`electron .` from the repo) it reuses the
 * repo's own data, web build and worker venv.
 */
function configureEnvironment(): void {
  if (!app.isPackaged) return;

  const resources = process.resourcesPath;
  const userData = app.getPath("userData");

  // The bundled model cache is read-only inside the app (and on a mounted
  // .dmg), but the Hugging Face client wants to write lock files - so give it
  // a writable copy, made once.
  const hfHome = path.join(userData, "hf-home");
  if (!fs.existsSync(hfHome)) fs.cpSync(path.join(resources, "hf-home"), hfHome, { recursive: true });

  process.env.STEMIFY_DATA_DIR = path.join(userData, "data");
  process.env.STEMIFY_WEB_DIST = path.join(resources, "web");
  // python-build-standalone lays the interpreter out differently per OS.
  process.env.STEMIFY_PYTHON =
    process.platform === "win32"
      ? path.join(resources, "python", "python.exe")
      : path.join(resources, "python", "bin", "python3");
  process.env.STEMIFY_WORKER_SCRIPT = path.join(resources, "worker", "separate.py");
  process.env.HF_HOME = hfHome;
  process.env.HF_HUB_OFFLINE = "1"; // the model is bundled; never touch the network
}

async function startBackend(): Promise<string> {
  const api = await import("../../api/src/server.js");
  const separation = await import("../../api/src/separation.js");
  stopSeparation = separation.stopSeparation;
  isSeparating = separation.isSeparating;
  // Loopback only, on a free port: the app is a private, single-user tool.
  const started = await api.startServer({ port: 0, host: "127.0.0.1" });
  server = started.server;
  return `http://127.0.0.1:${started.port}`;
}

function createWindow(origin: string): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 560,
    show: false,
    backgroundColor: "#0b0b0c",
    title: "Stemify",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      // Playback starts from a keyboard shortcut as often as from a click;
      // the app is the only content, so don't require a click first.
      autoplayPolicy: "no-user-gesture-required",
    },
  });
  mainWindow = win;

  win.once("ready-to-show", () => win.show());
  win.on("closed", () => {
    mainWindow = null;
  });

  // Anything that isn't the app itself opens in the user's browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(origin)) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  void win.loadURL(origin);
}

function buildMenu(): void {
  const isMac = process.platform === "darwin";
  const checkForUpdates: Electron.MenuItemConstructorOptions = {
    label: "Check for Updates…",
    click: () => void manualCheckForUpdates(() => mainWindow, () => isSeparating()),
  };
  const template: Electron.MenuItemConstructorOptions[] = [
    isMac
      ? {
          label: app.name,
          submenu: [{ role: "about" }, checkForUpdates, { type: "separator" }, { role: "hide" }, { role: "hideOthers" }, { type: "separator" }, { role: "quit" }],
        }
      : { label: "File", submenu: [checkForUpdates, { type: "separator" }, { role: "quit" }] },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [{ role: "reload" }, { role: "toggleDevTools" }, { type: "separator" }, { role: "togglefullscreen" }],
    },
    { role: "windowMenu" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    try {
      configureEnvironment();

      // Like Discord: check for a newer version first, and if there is one,
      // install it and restart before the main window ever opens. The backend
      // starts in parallel so a normal launch isn't slowed down.
      const splash = createSplash();
      const backend = startBackend();
      backend.catch(() => {}); // surfaced below; avoids an unhandled rejection while updating

      if ((await runStartupUpdate(splash)) === "installing") return; // the app is quitting

      const origin = await backend;
      buildMenu();
      createWindow(origin);
      splash.close();
      startBackgroundUpdates(() => mainWindow, () => isSeparating());
    } catch (err) {
      dialog.showErrorBox("Stemify could not start", err instanceof Error ? (err.stack ?? err.message) : String(err));
      app.quit();
    }
  });

  app.on("window-all-closed", () => app.quit());

  app.on("before-quit", () => {
    stopSeparation();
    server?.close();
  });
}

/**
 * Electron entry point: app lifecycle only. The pieces live in app/
 * (environment, backend, window, menu) and updater/.
 */
import { app, BrowserWindow, dialog } from "electron";
import { startBackend, type Backend } from "./app/backend.js";
import { configureEnvironment } from "./app/environment.js";
import { createMainWindow } from "./app/mainWindow.js";
import { buildMenu } from "./app/menu.js";
import { createSplash, runStartupUpdate, startBackgroundUpdates } from "./updater/index.js";

let backend: Backend | null = null;
let mainWindow: BrowserWindow | null = null;

const getWindow = () => mainWindow;
const isBusy = () => backend?.isSeparating() ?? false;

async function launch(): Promise<void> {
  configureEnvironment();

  // Like Discord: check for a newer version first, and if there is one,
  // install it and restart before the main window ever opens. The backend
  // starts in parallel so a normal launch isn't slowed down.
  const splash = createSplash();
  const starting = startBackend();
  // Recorded as soon as it's up, so quitting mid-update still stops it.
  starting.then((b) => (backend = b)).catch(() => {}); // errors surface below

  if ((await runStartupUpdate(splash)) === "installing") return; // the app is quitting

  const { origin } = await starting;
  buildMenu(getWindow, isBusy);
  mainWindow = createMainWindow(origin);
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  splash.close();
  startBackgroundUpdates(getWindow, isBusy);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    try {
      await launch();
    } catch (err) {
      dialog.showErrorBox("Stemify could not start", err instanceof Error ? (err.stack ?? err.message) : String(err));
      app.quit();
    }
  });

  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", () => backend?.stop());
}

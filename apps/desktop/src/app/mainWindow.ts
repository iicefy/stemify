import { BrowserWindow, shell } from "electron";

/** The app's one window, showing the web UI served by the backend at `origin`. */
export function createMainWindow(origin: string): BrowserWindow {
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

  win.once("ready-to-show", () => win.show());

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
  return win;
}

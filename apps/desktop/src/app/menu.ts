import { app, Menu, type BrowserWindow, type MenuItemConstructorOptions } from "electron";
import { manualCheckForUpdates } from "../updater/index.js";

export function buildMenu(getWindow: () => BrowserWindow | null, isBusy: () => boolean): void {
  const isMac = process.platform === "darwin";
  const checkForUpdates: MenuItemConstructorOptions = {
    label: "Check for Updates…",
    click: () => void manualCheckForUpdates(getWindow, isBusy),
  };
  const template: MenuItemConstructorOptions[] = [
    isMac
      ? {
          label: app.name,
          submenu: [
            { role: "about" },
            checkForUpdates,
            { type: "separator" },
            { role: "hide" },
            { role: "hideOthers" },
            { type: "separator" },
            { role: "quit" },
          ],
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

// Windows: electron-updater (NSIS installer, downloads only the changed blocks).
import { log, testFeedUrl } from "./feed.js";
import type { PendingUpdate } from "./types.js";

export async function findWindowsUpdate(): Promise<PendingUpdate | null> {
  const { autoUpdater } = await import("electron-updater");
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  const write = (m: unknown) => log(`updater: ${m}`);
  autoUpdater.logger = { info: write, warn: write, error: write, debug: () => {} };
  const testUrl = testFeedUrl();
  if (testUrl) autoUpdater.setFeedURL({ provider: "generic", url: testUrl });

  const result = await autoUpdater.checkForUpdates();
  if (!result?.isUpdateAvailable) return null;

  return {
    version: result.updateInfo.version,
    requiresInstaller: false,
    async prepare(hooks) {
      hooks.status(`Downloading Stemify ${result.updateInfo.version}…`);
      autoUpdater.on("download-progress", (p) => hooks.progress(p.percent / 100));
      await autoUpdater.downloadUpdate();
      hooks.status("Installing…");
      hooks.progress(null);
      return { apply: () => autoUpdater.quitAndInstall(true, true) };
    },
  };
}

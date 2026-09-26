/**
 * In-app updates, Discord-style: check at startup (and install before the
 * main window opens), then quietly in the background, plus a "Check for
 * Updates…" menu item. Published as GitHub release assets - see
 * scripts/release.sh. Platform specifics live in mac.ts and windows.ts.
 */
import { app, BrowserWindow, shell } from "electron";
import { showMessage } from "./dialogs.js";
import { errorText, log, RELEASES_PAGE, testFeedUrl, withTimeout } from "./feed.js";
import { findMacUpdate } from "./mac.js";
import { createSplash, type Splash } from "./splash.js";
import type { PendingUpdate, UpdateHooks } from "./types.js";
import { findWindowsUpdate } from "./windows.js";

export { createSplash } from "./splash.js";

const CHECK_EVERY_MS = 4 * 60 * 60 * 1000;
const STARTUP_CHECK_TIMEOUT_MS = 6000;
const CHECK_TIMEOUT_MS = 15000;

const noopHooks: UpdateHooks = { status: () => {}, progress: () => {} };

type GetWindow = () => BrowserWindow | null;
type IsBusy = () => boolean;

/** False when this build can't self-update at all (running from source). */
function updatesSupported(): boolean {
  if (testFeedUrl()) return true;
  return app.isPackaged && (process.platform === "darwin" || process.platform === "win32");
}

async function findUpdate(timeoutMs: number): Promise<PendingUpdate | null> {
  if (!updatesSupported()) return null;
  const check = process.platform === "darwin" ? findMacUpdate() : findWindowsUpdate();
  return withTimeout(check, timeoutMs, "The update check");
}

/**
 * Runs before the main window opens. If a newer version exists it is
 * downloaded and installed right here (the app restarts itself). Any problem
 * (offline, slow, bad download) just means "carry on with the version you have".
 */
export async function runStartupUpdate(splash: Splash): Promise<"installing" | "none"> {
  try {
    splash.status("Checking for updates…");
    const pending = await findUpdate(STARTUP_CHECK_TIMEOUT_MS);
    if (!pending || pending.requiresInstaller) return "none";
    log(`startup: updating ${app.getVersion()} -> ${pending.version}`);
    splash.status(`Updating to ${pending.version}…`);
    const ready = await pending.prepare(splash);
    ready.apply();
    return "installing";
  } catch (err) {
    log(`startup update skipped: ${errorText(err)}`);
    return "none";
  }
}

async function offerInstaller(win: BrowserWindow | null, version: string): Promise<void> {
  const response = await showMessage(win, {
    type: "info",
    message: `Stemify ${version} is available`,
    detail: "This update includes bigger changes, so it needs a fresh install. Your songs are kept.",
    buttons: ["Open download page", "Later"],
    defaultId: 0,
    cancelId: 1,
  });
  if (response === 0) void shell.openExternal(RELEASES_PAGE);
}

// Background state: an update downloaded but not yet applied, and whether
// the "needs a fresh install" prompt was already shown this session.
let readyUpdate: { version: string; apply: () => void } | null = null;
let installerOffered = false;

async function promptRestart(win: BrowserWindow | null, isBusy: IsBusy): Promise<void> {
  if (!readyUpdate || isBusy()) return; // never interrupt a running separation
  const response = await showMessage(win, {
    type: "info",
    message: `Stemify ${readyUpdate.version} is ready`,
    detail: "Restart to finish updating. Your songs are not affected.",
    buttons: ["Restart now", "Later"],
    defaultId: 0,
    cancelId: 1,
  });
  if (response === 0) readyUpdate.apply();
}

async function checkInBackground(getWindow: GetWindow, isBusy: IsBusy): Promise<void> {
  if (readyUpdate) return promptRestart(getWindow(), isBusy);
  const pending = await findUpdate(CHECK_TIMEOUT_MS);
  if (!pending) return;
  if (pending.requiresInstaller) {
    if (!installerOffered) {
      installerOffered = true;
      await offerInstaller(getWindow(), pending.version);
    }
    return;
  }
  log(`background: downloading ${pending.version}`);
  const ready = await pending.prepare(noopHooks);
  readyUpdate = { version: pending.version, apply: ready.apply };
  await promptRestart(getWindow(), isBusy);
}

/** Quietly checks a minute after launch and every few hours after that. */
export function startBackgroundUpdates(getWindow: GetWindow, isBusy: IsBusy): void {
  if (!updatesSupported()) return;
  const tick = () =>
    void checkInBackground(getWindow, isBusy).catch((err) => log(`background check failed: ${errorText(err)}`));
  setTimeout(tick, 60_000);
  setInterval(tick, CHECK_EVERY_MS);
}

/** The "Check for Updates…" menu item: always answers, never silent. */
export async function manualCheckForUpdates(getWindow: GetWindow, isBusy: IsBusy): Promise<void> {
  const win = getWindow();
  const say = (message: string, detail?: string) => showMessage(win, { type: "info", message, detail, buttons: ["OK"] });

  if (!updatesSupported()) {
    await say("Updates are only available in the installed app.");
    return;
  }

  try {
    const pending = await findUpdate(CHECK_TIMEOUT_MS);
    if (!pending) {
      await say("You’re up to date", `Stemify ${app.getVersion()} is the latest version.`);
      return;
    }
    if (pending.requiresInstaller) {
      await offerInstaller(win, pending.version);
      return;
    }
    if (isBusy()) {
      await say(
        `Stemify ${pending.version} is available`,
        "A song is being separated right now. Try again when it finishes so it isn’t interrupted."
      );
      return;
    }

    const response = await showMessage(win, {
      type: "question",
      message: `Update to Stemify ${pending.version}?`,
      detail: "It downloads, installs and restarts on its own. Your songs are not affected.",
      buttons: ["Update now", "Cancel"],
      defaultId: 0,
      cancelId: 1,
    });
    if (response !== 0) return;

    const splash = createSplash();
    try {
      splash.status(`Updating to ${pending.version}…`);
      const ready = await pending.prepare(splash);
      ready.apply();
    } catch (err) {
      splash.close();
      throw err;
    }
  } catch (err) {
    log(`manual check failed: ${errorText(err)}`);
    await say("Couldn’t check for updates", errorText(err));
  }
}

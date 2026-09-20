import { app, BrowserWindow, dialog, shell } from "electron";
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const RELEASES_PAGE = "https://github.com/iicefy/stemify/releases/latest";
// `latest/download/<file>` always resolves to that file in the newest release.
const DEFAULT_FEED = `${RELEASES_PAGE}/download`;
const CHECK_EVERY_MS = 4 * 60 * 60 * 1000;

/** Overridable so updates can be tested against a local folder. */
const feedBase = () => process.env.STEMIFY_UPDATE_URL ?? DEFAULT_FEED;

export interface UpdateHooks {
  status(text: string): void;
  /** 0..1, or null while the length is unknown / installing. */
  progress(fraction: number | null): void;
}

export interface ReadyUpdate {
  /** Quits the app and installs; the new version starts by itself. */
  apply(): void;
}

export interface PendingUpdate {
  version: string;
  /** The new version changes something the small update can't (Electron, Python...). */
  requiresInstaller: boolean;
  prepare(hooks: UpdateHooks): Promise<ReadyUpdate>;
}

interface Manifest {
  version: string;
  /** Identifies the parts of the app the small update does NOT replace. */
  base: string;
  mac?: Record<string, { file: string; sha512: string; size: number }>;
}

const noopHooks: UpdateHooks = { status: () => {}, progress: () => {} };

function log(message: string): void {
  try {
    const dir = path.join(app.getPath("userData"), "updates");
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, "update.log"), `${new Date().toISOString()} ${message}\n`);
  } catch {
    // Logging must never break the app.
  }
}

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

function isNewer(candidate: string, current: string): boolean {
  const a = candidate.split(".").map((n) => parseInt(n, 10) || 0);
  const b = current.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return false;
}

function installedBase(): string {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.resourcesPath, "base.json"), "utf8")).base ?? "";
  } catch {
    return "";
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${what} timed out`)), ms)),
  ]);
}

async function download(
  url: string,
  dest: string,
  expectedSha512: string,
  expectedSize: number,
  onProgress: (fraction: number) => void
): Promise<void> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) throw new Error(`Download failed (HTTP ${res.status})`);
  if (!process.env.STEMIFY_UPDATE_URL && !res.url.startsWith("https://")) throw new Error("Refusing a non-HTTPS download");

  const total = Number(res.headers.get("content-length")) || expectedSize || 0;
  const hash = createHash("sha512");
  let received = 0;
  const counter = new Transform({
    transform(chunk: Buffer, _enc, cb) {
      hash.update(chunk);
      received += chunk.length;
      if (total) onProgress(Math.min(1, received / total));
      cb(null, chunk);
    },
  });
  await pipeline(Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]), counter, fs.createWriteStream(dest));

  if (hash.digest("hex") !== expectedSha512) throw new Error("The update failed its integrity check");
}

// ---------------------------------------------------------------------------
// macOS: the app isn't signed, so the standard updater can't be used. Instead a
// small "code only" payload (app.asar, web build, worker script, Info.plist -
// about 2 MB) is downloaded, verified against its SHA-512, and swapped into the
// app bundle by a helper script once the app has quit. The Python runtime and
// model (700 MB) are left alone.
// ---------------------------------------------------------------------------

const SWAP_SCRIPT = `#!/bin/sh
# usage: apply-update.sh <pid> <bundle> <stage> <backup> [app args...]
PID="$1"; BUNDLE="$2"; STAGE="$3"; BACKUP="$4"; shift 4
R="$BUNDLE/Contents/Resources"

# Wait for the running app to exit; never touch a running app.
i=0
while kill -0 "$PID" 2>/dev/null; do
  i=$((i + 1)); [ "$i" -gt 100 ] && { echo "app did not quit; aborting"; exit 1; }
  sleep 0.3
done

restore() {
  echo "swap failed; restoring the previous version"
  rm -rf "$R/app.asar" "$R/web" "$R/worker"
  cp -R "$BACKUP/app.asar" "$BACKUP/web" "$BACKUP/worker" "$R/"
  cp "$BACKUP/Info.plist" "$BUNDLE/Contents/Info.plist"
}

rm -rf "$BACKUP"; mkdir -p "$BACKUP" || exit 1
cp -R "$R/app.asar" "$R/web" "$R/worker" "$BACKUP/" && cp "$BUNDLE/Contents/Info.plist" "$BACKUP/Info.plist" || { echo "backup failed"; exit 1; }

if rm -rf "$R/app.asar" "$R/web" "$R/worker" \\
   && cp -R "$STAGE/Contents/Resources/app.asar" "$STAGE/Contents/Resources/web" "$STAGE/Contents/Resources/worker" "$R/" \\
   && cp "$STAGE/Contents/Info.plist" "$BUNDLE/Contents/Info.plist"; then
  echo "updated"
else
  restore
fi

# Under test the app is started directly so its flags and environment carry over.
if [ -n "$STEMIFY_UPDATE_URL" ]; then
  "$BUNDLE/Contents/MacOS/Stemify" "$@" >/dev/null 2>&1 &
else
  open "$BUNDLE"
fi
`;

async function prepareMacUpdate(manifest: Manifest, hooks: UpdateHooks): Promise<ReadyUpdate> {
  const entry = manifest.mac?.[process.arch];
  if (!entry) throw new Error(`No update is published for ${process.arch}`);

  const bundle = path.resolve(process.execPath, "..", "..", "..");
  const resources = path.join(bundle, "Contents", "Resources");
  try {
    fs.accessSync(resources, fs.constants.W_OK);
  } catch {
    throw new Error("Stemify doesn't have permission to update itself here");
  }

  const dir = path.join(app.getPath("userData"), "updates", manifest.version);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const zip = path.join(dir, "payload.zip");

  hooks.status(`Downloading Stemify ${manifest.version}…`);
  await download(`${feedBase()}/${entry.file}`, zip, entry.sha512, entry.size, (f) => hooks.progress(f));

  hooks.status("Installing…");
  hooks.progress(null);
  const stage = path.join(dir, "stage");
  await execFileAsync("/usr/bin/ditto", ["-x", "-k", zip, stage]);
  for (const required of ["Contents/Info.plist", "Contents/Resources/app.asar", "Contents/Resources/web/index.html", "Contents/Resources/worker/separate.py"]) {
    if (!fs.existsSync(path.join(stage, required))) throw new Error(`The update is incomplete (${required} is missing)`);
  }

  const script = path.join(dir, "apply-update.sh");
  fs.writeFileSync(script, SWAP_SCRIPT, { mode: 0o755 });
  const backup = path.join(app.getPath("userData"), "updates", "backup");

  return {
    apply() {
      const logFd = fs.openSync(path.join(app.getPath("userData"), "updates", "update.log"), "a");
      spawn("/bin/sh", [script, String(process.pid), bundle, stage, backup, ...process.argv.slice(1)], {
        detached: true,
        stdio: ["ignore", logFd, logFd],
      }).unref();
      app.quit();
    },
  };
}

async function findMacUpdate(): Promise<PendingUpdate | null> {
  const res = await fetch(`${feedBase()}/update.json`, { redirect: "follow", cache: "no-store" });
  if (!res.ok) throw new Error(`Update check failed (HTTP ${res.status})`);
  const manifest = (await res.json()) as Manifest;
  if (!isNewer(manifest.version, app.getVersion())) return null;

  return {
    version: manifest.version,
    requiresInstaller: !manifest.mac?.[process.arch] || manifest.base !== installedBase(),
    prepare: (hooks) => prepareMacUpdate(manifest, hooks),
  };
}

// ---------------------------------------------------------------------------
// Windows: electron-updater (NSIS installer, downloads only the changed blocks).
// ---------------------------------------------------------------------------

async function findWindowsUpdate(): Promise<PendingUpdate | null> {
  const { autoUpdater } = await import("electron-updater");
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.logger = { info: (m: unknown) => log(`updater: ${m}`), warn: (m: unknown) => log(`updater: ${m}`), error: (m: unknown) => log(`updater: ${m}`), debug: () => {} };
  if (process.env.STEMIFY_UPDATE_URL) autoUpdater.setFeedURL({ provider: "generic", url: process.env.STEMIFY_UPDATE_URL });

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

// ---------------------------------------------------------------------------

/** Undefined when this build can't self-update at all (running from source). */
function updatesSupported(): boolean {
  if (process.env.STEMIFY_UPDATE_URL) return true;
  return app.isPackaged && (process.platform === "darwin" || process.platform === "win32");
}

export async function findUpdate(timeoutMs: number): Promise<PendingUpdate | null> {
  if (!updatesSupported()) return null;
  const check = process.platform === "darwin" ? findMacUpdate() : findWindowsUpdate();
  return withTimeout(check, timeoutMs, "The update check");
}

export interface Splash extends UpdateHooks {
  close(): void;
}

export function createSplash(): Splash {
  const html = `<!doctype html><meta charset="utf-8"><style>
    body{margin:0;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#151517;color:#f0f0f1;font:13px system-ui,sans-serif;-webkit-app-region:drag;user-select:none;overflow:hidden}
    h1{margin:0 0 14px;font-size:20px;font-weight:600}
    #s{color:#86868c;margin-bottom:14px;min-height:16px}
    .bar{width:220px;height:4px;background:#26262a;border-radius:2px;overflow:hidden}
    #b{height:100%;width:0;background:#3b82f6;border-radius:2px;transition:width .2s}
    #b.ind{width:40%;animation:slide 1.1s ease-in-out infinite}
    @keyframes slide{0%{margin-left:-40%}100%{margin-left:100%}}
  </style><h1>Stemify</h1><div id="s">Starting…</div><div class="bar"><div id="b" class="ind"></div></div>
  <script>
    function setStatus(t){document.getElementById('s').textContent=t}
    function setProgress(f){var b=document.getElementById('b');if(f===null){b.className='ind';b.style.width=''}else{b.className='';b.style.width=Math.round(f*100)+'%'}}
  </script>`;
  const win = new BrowserWindow({
    width: 340,
    height: 190,
    frame: false,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    show: false,
    backgroundColor: "#151517",
    title: "Stemify",
    webPreferences: { sandbox: true, contextIsolation: true },
  });
  win.once("ready-to-show", () => win.show());
  void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);

  const exec = (code: string) => {
    if (!win.isDestroyed()) void win.webContents.executeJavaScript(code).catch(() => {});
  };
  return {
    status: (text) => exec(`setStatus(${JSON.stringify(text)})`),
    progress: (f) => exec(`setProgress(${f === null ? "null" : f})`),
    close: () => {
      if (!win.isDestroyed()) win.close();
    },
  };
}

/**
 * Runs before the main window opens. If a newer version exists it is
 * downloaded and installed right here (the app restarts itself) - like
 * Discord. Any problem (offline, slow, bad download) just means "carry on
 * with the version you have".
 */
export async function runStartupUpdate(splash: Splash): Promise<"installing" | "none"> {
  try {
    splash.status("Checking for updates…");
    const pending = await findUpdate(6000);
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
  const options = {
    type: "info" as const,
    message: `Stemify ${version} is available`,
    detail: "This update includes bigger changes, so it needs a fresh install. Your songs are kept.",
    buttons: ["Open download page", "Later"],
    defaultId: 0,
    cancelId: 1,
  };
  const { response } = win ? await dialog.showMessageBox(win, options) : await dialog.showMessageBox(options);
  if (response === 0) void shell.openExternal(RELEASES_PAGE);
}

let readyUpdate: { version: string; apply: () => void } | null = null;
let installerOffered = false;

async function promptRestart(win: BrowserWindow | null, isBusy: () => boolean): Promise<void> {
  if (!readyUpdate || isBusy()) return; // never interrupt a running separation
  const options = {
    type: "info" as const,
    message: `Stemify ${readyUpdate.version} is ready`,
    detail: "Restart to finish updating. Your songs are not affected.",
    buttons: ["Restart now", "Later"],
    defaultId: 0,
    cancelId: 1,
  };
  const { response } = win ? await dialog.showMessageBox(win, options) : await dialog.showMessageBox(options);
  if (response === 0) readyUpdate.apply();
}

async function checkInBackground(getWindow: () => BrowserWindow | null, isBusy: () => boolean): Promise<void> {
  if (readyUpdate) return promptRestart(getWindow(), isBusy);
  const pending = await findUpdate(15000);
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
export function startBackgroundUpdates(getWindow: () => BrowserWindow | null, isBusy: () => boolean): void {
  if (!updatesSupported()) return;
  const tick = () => void checkInBackground(getWindow, isBusy).catch((err) => log(`background check failed: ${errorText(err)}`));
  setTimeout(tick, 60_000);
  setInterval(tick, CHECK_EVERY_MS);
}

/** The "Check for Updates…" menu item: always answers, never silent. */
export async function manualCheckForUpdates(getWindow: () => BrowserWindow | null, isBusy: () => boolean): Promise<void> {
  const win = getWindow();
  const say = (message: string, detail?: string) => {
    const options = { type: "info" as const, message, detail, buttons: ["OK"] };
    return win ? dialog.showMessageBox(win, options) : dialog.showMessageBox(options);
  };

  if (!updatesSupported()) {
    await say("Updates are only available in the installed app.");
    return;
  }

  try {
    const pending = await findUpdate(15000);
    if (!pending) {
      await say("You’re up to date", `Stemify ${app.getVersion()} is the latest version.`);
      return;
    }
    if (pending.requiresInstaller) {
      await offerInstaller(win, pending.version);
      return;
    }
    if (isBusy()) {
      await say(`Stemify ${pending.version} is available`, "A song is being separated right now. Try again when it finishes so it isn’t interrupted.");
      return;
    }

    const ask = { type: "question" as const, message: `Update to Stemify ${pending.version}?`, detail: "It downloads, installs and restarts on its own. Your songs are not affected.", buttons: ["Update now", "Cancel"], defaultId: 0, cancelId: 1 };
    const { response } = win ? await dialog.showMessageBox(win, ask) : await dialog.showMessageBox(ask);
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

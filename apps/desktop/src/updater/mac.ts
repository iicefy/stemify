// macOS: the app isn't signed, so the standard updater can't be used. Instead a
// small "code only" payload (app.asar, web build, worker script, Info.plist -
// about 1 MB) is downloaded, verified against its SHA-512, and swapped into the
// app bundle by a helper script once the app has quit. The Python runtime and
// model (700 MB) are left alone.
import { app } from "electron";
import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import SWAP_SCRIPT from "./apply-update.sh";
import { download, feedBase, logPath, updatesDir } from "./feed.js";
import type { Manifest, PendingUpdate, ReadyUpdate, UpdateHooks } from "./types.js";
import { isNewer } from "./version.js";

const execFileAsync = promisify(execFile);

/** Everything the swap script replaces must be in the payload. */
const REQUIRED_FILES = [
  "Contents/Info.plist",
  "Contents/Resources/app.asar",
  "Contents/Resources/web/index.html",
  "Contents/Resources/worker/separate.py",
];

function installedBase(): string {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.resourcesPath, "base.json"), "utf8")).base ?? "";
  } catch {
    return "";
  }
}

async function prepare(manifest: Manifest, hooks: UpdateHooks): Promise<ReadyUpdate> {
  const entry = manifest.mac?.[process.arch];
  if (!entry) throw new Error(`No update is published for ${process.arch}`);

  const bundle = path.resolve(process.execPath, "..", "..", "..");
  const resources = path.join(bundle, "Contents", "Resources");
  try {
    fs.accessSync(resources, fs.constants.W_OK);
  } catch {
    throw new Error("Stemify doesn't have permission to update itself here");
  }

  const dir = path.join(updatesDir(), manifest.version);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const zip = path.join(dir, "payload.zip");

  hooks.status(`Downloading Stemify ${manifest.version}…`);
  await download(`${feedBase()}/${entry.file}`, zip, entry.sha512, entry.size, (f) => hooks.progress(f));

  hooks.status("Installing…");
  hooks.progress(null);
  const stage = path.join(dir, "stage");
  await execFileAsync("/usr/bin/ditto", ["-x", "-k", zip, stage]);
  for (const required of REQUIRED_FILES) {
    if (!fs.existsSync(path.join(stage, required))) throw new Error(`The update is incomplete (${required} is missing)`);
  }

  const script = path.join(dir, "apply-update.sh");
  fs.writeFileSync(script, SWAP_SCRIPT, { mode: 0o755 });
  const backup = path.join(updatesDir(), "backup");

  return {
    apply() {
      const logFd = fs.openSync(logPath(), "a");
      spawn("/bin/sh", [script, String(process.pid), bundle, stage, backup, ...process.argv.slice(1)], {
        detached: true,
        stdio: ["ignore", logFd, logFd],
      }).unref();
      app.quit();
    },
  };
}

export async function findMacUpdate(): Promise<PendingUpdate | null> {
  const res = await fetch(`${feedBase()}/update.json`, { redirect: "follow", cache: "no-store" });
  if (!res.ok) throw new Error(`Update check failed (HTTP ${res.status})`);
  const manifest = (await res.json()) as Manifest;
  if (!isNewer(manifest.version, app.getVersion())) return null;

  return {
    version: manifest.version,
    requiresInstaller: !manifest.mac?.[process.arch] || manifest.base !== installedBase(),
    prepare: (hooks) => prepare(manifest, hooks),
  };
}

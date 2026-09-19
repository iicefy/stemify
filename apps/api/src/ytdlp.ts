import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { DATA_DIR } from "./paths.js";

// yt-dlp is downloaded on first use rather than bundled: YouTube changes its
// site often enough that a frozen copy stops working within weeks, so the app
// keeps a self-updating binary in its data folder instead.
const BIN_DIR = path.join(DATA_DIR, "bin");
const IS_WIN = process.platform === "win32";
const RELEASE_ASSET = IS_WIN ? "yt-dlp.exe" : process.platform === "darwin" ? "yt-dlp_macos" : "yt-dlp_linux";
const BINARY = path.join(BIN_DIR, IS_WIN ? "yt-dlp.exe" : "yt-dlp");
const STALE_AFTER_MS = 3 * 24 * 60 * 60 * 1000;

export interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

let ensuring: Promise<void> | null = null;

async function download(): Promise<void> {
  fs.mkdirSync(BIN_DIR, { recursive: true });
  const res = await fetch(`https://github.com/yt-dlp/yt-dlp/releases/latest/download/${RELEASE_ASSET}`);
  if (!res.ok || !res.body) throw new Error(`Could not download yt-dlp (HTTP ${res.status})`);
  const tmp = `${BINARY}.download`;
  await pipeline(Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]), fs.createWriteStream(tmp));
  fs.chmodSync(tmp, 0o755);
  fs.renameSync(tmp, BINARY);
}

export function run(args: string[]): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    // Titles are often non-Latin; force UTF-8 so they survive the pipe.
    const child = spawn(BINARY, args, { env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" } });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (c) => (stdout += c));
    child.stderr.setEncoding("utf8").on("data", (c) => (stderr += c));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

/** Self-update in place (yt-dlp's own updater) and reset the freshness clock. */
export async function updateYtDlp(): Promise<void> {
  await run(["-U"]).catch(() => undefined);
  const now = new Date();
  fs.utimesSync(BINARY, now, now);
}

/** Makes sure a usable, reasonably fresh yt-dlp exists; returns nothing, use `run`. */
export function ensureYtDlp(): Promise<void> {
  ensuring ??= (async () => {
    try {
      if (!fs.existsSync(BINARY)) {
        await download();
      } else if (Date.now() - fs.statSync(BINARY).mtimeMs > STALE_AFTER_MS) {
        await updateYtDlp();
      }
    } finally {
      ensuring = null;
    }
  })();
  return ensuring;
}

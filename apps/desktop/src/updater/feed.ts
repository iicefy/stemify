import { app } from "electron";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

export const RELEASES_PAGE = "https://github.com/iicefy/stemify/releases/latest";
// `latest/download/<file>` always resolves to that file in the newest release.
const DEFAULT_FEED = `${RELEASES_PAGE}/download`;

/** Set to test updates against a local folder/server instead of GitHub. */
export const testFeedUrl = (): string | undefined => process.env.STEMIFY_UPDATE_URL;

export const feedBase = (): string => testFeedUrl() ?? DEFAULT_FEED;

/** Where downloads, the swap script, its backup and the log live. */
export const updatesDir = (): string => path.join(app.getPath("userData"), "updates");
export const logPath = (): string => path.join(updatesDir(), "update.log");

export function log(message: string): void {
  try {
    fs.mkdirSync(updatesDir(), { recursive: true });
    fs.appendFileSync(logPath(), `${new Date().toISOString()} ${message}\n`);
  } catch {
    // Logging must never break the app.
  }
}

export const errorText = (err: unknown): string => (err instanceof Error ? err.message : String(err));

export function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`${what} timed out`)), ms)),
  ]);
}

/** Streams `url` to `dest`, verifying its SHA-512 on the way. */
export async function download(
  url: string,
  dest: string,
  expectedSha512: string,
  expectedSize: number,
  onProgress: (fraction: number) => void
): Promise<void> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) throw new Error(`Download failed (HTTP ${res.status})`);
  if (!testFeedUrl() && !res.url.startsWith("https://")) throw new Error("Refusing a non-HTTPS download");

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

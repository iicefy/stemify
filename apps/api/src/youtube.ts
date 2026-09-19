import { randomUUID } from "node:crypto";
import { db } from "./db.js";
import { UPLOADS_DIR } from "./paths.js";
import { enqueueSeparation } from "./separation.js";
import { ensureYtDlp, run, updateYtDlp } from "./ytdlp.js";

const ALLOWED_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"]);
const MAX_MINUTES = 60;

/** Returns a clean https YouTube URL, or null. Anything else is rejected outright. */
export function parseYoutubeUrl(input: unknown): URL | null {
  if (typeof input !== "string") return null;
  try {
    const url = new URL(input.trim());
    return url.protocol === "https:" && ALLOWED_HOSTS.has(url.hostname) ? url : null;
  } catch {
    return null;
  }
}

const markFailed = db.prepare("UPDATE songs SET status = 'failed', error_message = ? WHERE id = ?");
const markDownloaded = db.prepare(
  "UPDATE songs SET title = ?, original_path = ?, status = 'processing' WHERE id = ?"
);
export const insertPendingSong = db.prepare(
  `INSERT INTO songs (id, title, original_path, status, created_at)
   VALUES (?, ?, '', 'downloading', ?)`
);

function download(id: string, url: URL) {
  return run([
    "--no-playlist",
    "--playlist-items", "1",
    "--no-simulate",
    "--no-warnings",
    "--no-progress",
    // Audio-only m4a needs no ffmpeg and decodes fine in the separation worker.
    "-f", "bestaudio[ext=m4a]/bestaudio[acodec^=mp4a]/best[ext=mp4]",
    "--match-filter", `duration<=${MAX_MINUTES * 60}`,
    "--max-filesize", "300M",
    "-o", `${UPLOADS_DIR}/${id}.%(ext)s`,
    "--print", "title",
    "--print", "after_move:filepath",
    "--", // the URL can never be read as an option
    url.href,
  ]);
}

/** Runs in the background: download, then hand the file to the normal separation queue. */
export async function startYoutubeImport(id: string, url: URL): Promise<void> {
  try {
    await ensureYtDlp();
    let result = await download(id, url);
    if (result.code !== 0) {
      // Most failures are yt-dlp lagging behind a YouTube change - update and retry once.
      await updateYtDlp();
      result = await download(id, url);
    }

    const lines = result.stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const filePath = lines.length >= 2 ? lines[lines.length - 1] : null;
    if (result.code !== 0 || !filePath) {
      const reason =
        result.code === 0
          ? `Video is longer than ${MAX_MINUTES} minutes or too large`
          : (result.stderr.split(/\r?\n/).filter(Boolean).pop() ?? "Download failed");
      markFailed.run(reason.replace(/^ERROR:\s*/, ""), id);
      return;
    }

    markDownloaded.run(lines[0], filePath, id);
    enqueueSeparation(id, filePath);
  } catch (err) {
    markFailed.run(err instanceof Error ? err.message : String(err), id);
  }
}

export function newSongId(): string {
  return randomUUID();
}

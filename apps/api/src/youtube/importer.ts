import { UPLOADS_DIR } from "../infra/paths.js";
import { enqueueSeparation } from "../separation/queue.js";
import { markSongDownloaded, markSongFailed, songExists } from "../db/songRepository.js";
import { removeFile } from "../infra/storage.js";
import { ensureYtDlp, runYtDlp, updateYtDlp } from "./ytdlp.js";

const MAX_MINUTES = 60;

function download(songId: string, url: URL) {
  return runYtDlp([
    "--no-playlist",
    "--playlist-items", "1",
    "--no-simulate",
    "--no-warnings",
    "--no-progress",
    // Audio-only m4a needs no ffmpeg and decodes fine in the separation worker.
    "-f", "bestaudio[ext=m4a]/bestaudio[acodec^=mp4a]/best[ext=mp4]",
    "--match-filter", `duration<=${MAX_MINUTES * 60}`,
    "--max-filesize", "300M",
    "-o", `${UPLOADS_DIR}/${songId}.%(ext)s`,
    "--print", "title",
    "--print", "after_move:filepath",
    "--", // the URL can never be read as an option
    url.href,
  ]);
}

/**
 * Runs in the background: download, then hand the file to the normal
 * separation queue. Never throws - every failure ends up on the song.
 */
export async function startYoutubeImport(songId: string, url: URL): Promise<void> {
  try {
    await ensureYtDlp();
    let result = await download(songId, url);
    if (result.code !== 0) {
      // Most failures are yt-dlp lagging behind a YouTube change - update and retry once.
      await updateYtDlp();
      result = await download(songId, url);
    }

    // Printed in order: the title, then the final file path.
    const lines = result.stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const filePath = lines.length >= 2 ? lines[lines.length - 1] : null;
    if (result.code !== 0 || !filePath) {
      const reason =
        result.code === 0
          ? `Video is longer than ${MAX_MINUTES} minutes or too large`
          : (result.stderr.split(/\r?\n/).filter(Boolean).pop() ?? "Download failed");
      markSongFailed(songId, reason.replace(/^ERROR:\s*/, ""));
      return;
    }

    // Deleted while downloading: drop the file instead of separating it.
    if (!songExists(songId)) {
      removeFile(filePath);
      return;
    }

    markSongDownloaded(songId, lines[0], filePath);
    enqueueSeparation(songId, filePath);
  } catch (err) {
    markSongFailed(songId, err instanceof Error ? err.message : String(err));
  }
}

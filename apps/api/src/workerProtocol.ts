/**
 * The contract between the API and the separation worker (worker/separate.py).
 * The worker is Python, so it can't share these types - this file is the
 * reference both sides follow; change them together.
 *
 * Invocation:
 *   <python> separate.py <input_path> <song_id> <stems_dir>
 *
 * While running, stdout may carry progress lines (everything else on stdout
 * and stderr is just logged):
 *   PROGRESS <fraction 0..1>
 *
 * Before exiting - success or failure - it writes
 * <stems_dir>/<song_id>/manifest.json, one of:
 *   {"status": "done",   "stems": {"<stem name>": "<file name in that folder>", ...}}
 *   {"status": "failed", "error": "<message shown to the user>"}
 * No manifest (crash, killed) counts as a failure.
 */

export type Manifest = { status: "done"; stems: Record<string, string> } | { status: "failed"; error: string };

export function workerArgs(script: string, inputPath: string, songId: string, stemsDir: string): string[] {
  return [script, inputPath, songId, stemsDir];
}

const PROGRESS_LINE = /^PROGRESS ([0-9]*\.?[0-9]+)$/;

/** The fraction from a `PROGRESS <n>` line (clamped to 0..1), or null for any other line. */
export function parseProgressLine(line: string): number | null {
  const match = PROGRESS_LINE.exec(line.trim());
  return match ? Math.min(1, Math.max(0, Number(match[1]))) : null;
}

// A stem file must be a plain name inside the song's folder - never a path
// that could point anywhere else on disk.
const SAFE_FILE_NAME = /^[\w.-]+$/;

/** Validates a parsed manifest.json; null if it doesn't match the contract. */
export function parseManifest(raw: unknown): Manifest | null {
  if (typeof raw !== "object" || raw === null) return null;
  const m = raw as Record<string, unknown>;

  if (m.status === "failed") {
    return { status: "failed", error: typeof m.error === "string" && m.error ? m.error : "Separation failed" };
  }
  if (m.status !== "done" || typeof m.stems !== "object" || m.stems === null) return null;

  const entries = Object.entries(m.stems as Record<string, unknown>);
  if (entries.length === 0) return null;
  for (const [name, file] of entries) {
    if (!name || typeof file !== "string" || !SAFE_FILE_NAME.test(file) || file.startsWith(".")) return null;
  }
  return { status: "done", stems: Object.fromEntries(entries) as Record<string, string> };
}

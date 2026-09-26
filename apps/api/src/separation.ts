import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { clearProgress, reportProgress } from "./events.js";
import { STEMS_DIR, WORKER_PYTHON, WORKER_SCRIPT } from "./paths.js";
import { completeSeparation, markSongFailed, songExists } from "./songRepository.js";
import { removeStems, stemsDirFor } from "./storage.js";
import { parseManifest, parseProgressLine, workerArgs, type Manifest } from "./workerProtocol.js";

interface Job {
  songId: string;
  inputPath: string;
}

const queue: Job[] = [];
let running = false;
let current: { songId: string; child: ChildProcess } | null = null;

/** True while a song is being separated or is waiting in line. */
export function isSeparating(): boolean {
  return running || queue.length > 0;
}

/** Forget a song's queued job, or stop it if it's the one running (its song was deleted). */
export function cancelSeparation(songId: string): void {
  const queued = queue.findIndex((job) => job.songId === songId);
  if (queued !== -1) queue.splice(queued, 1);
  if (current?.songId === songId) current.child.kill();
}

/** Stop the running separation and drop queued jobs (used when the app quits). */
export function stopSeparation(): void {
  queue.length = 0;
  current?.child.kill();
}

export function enqueueSeparation(songId: string, inputPath: string): void {
  queue.push({ songId, inputPath });
  void processQueue();
}

// One job at a time: Demucs is heavy (GPU/CPU-bound), and this all runs on
// a single local machine, so running jobs concurrently would just make
// each one slower rather than actually parallelizing.
async function processQueue(): Promise<void> {
  if (running) return;
  running = true;
  try {
    let job: Job | undefined;
    while ((job = queue.shift())) {
      await runSeparation(job);
    }
  } finally {
    running = false;
  }
}

function runSeparation({ songId, inputPath }: Job): Promise<void> {
  return new Promise((resolve) => {
    const child = spawn(WORKER_PYTHON, workerArgs(WORKER_SCRIPT, inputPath, songId, STEMS_DIR), {
      // Keep the interpreter from writing .pyc files or reading user
      // site-packages - matters for a read-only bundled app.
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1", PYTHONNOUSERSITE: "1" },
    });
    current = { songId, child };

    reportProgress(songId, 0);
    readline.createInterface({ input: child.stdout }).on("line", (line) => {
      const progress = parseProgressLine(line);
      if (progress === null) process.stdout.write(`[worker ${songId}] ${line}\n`);
      else reportProgress(songId, progress);
    });
    child.stderr.on("data", (chunk) => process.stderr.write(`[worker ${songId}] ${chunk}`));

    let failedToStart = false;
    child.on("error", (err) => {
      // e.g. worker/.venv doesn't exist yet - surface a clear message
      // instead of leaving the song stuck at "processing" forever.
      failedToStart = true;
      clearProgress(songId);
      markSongFailed(songId, `Failed to start separation worker: ${err.message}`);
      resolve();
    });

    child.on("close", () => {
      current = null;
      clearProgress(songId);
      // "close" can follow "error"; don't bury that clearer message under
      // a generic "no manifest" one.
      if (!failedToStart) finalize(songId);
      resolve();
    });
  });
}

function readManifest(dir: string): Manifest | null {
  try {
    return parseManifest(JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf-8")));
  } catch {
    return null; // missing/unreadable counts as a failure
  }
}

function finalize(songId: string): void {
  // The song may have been deleted while it was being separated.
  if (!songExists(songId)) {
    removeStems(songId);
    return;
  }

  const dir = stemsDirFor(songId);
  const manifest = readManifest(dir);
  if (!manifest) {
    markSongFailed(songId, "Separation failed (no valid manifest produced)");
    return;
  }
  if (manifest.status === "failed") {
    markSongFailed(songId, manifest.error);
    return;
  }

  completeSeparation(
    songId,
    Object.entries(manifest.stems).map(([name, file]) => ({ name, filePath: path.join(dir, file) }))
  );
}

import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { db } from "./db.js";
import { STEMS_DIR, WORKER_PYTHON, WORKER_SCRIPT } from "./paths.js";

interface Job {
  songId: string;
  inputPath: string;
}

interface Manifest {
  status: "done" | "failed";
  stems?: Record<string, string>;
  error?: string;
}

const markFailed = db.prepare(
  "UPDATE songs SET status = 'failed', error_message = ? WHERE id = ?"
);
const markReady = db.prepare("UPDATE songs SET status = 'ready' WHERE id = ?");
const insertStem = db.prepare(
  "INSERT INTO stems (id, song_id, name, file_path) VALUES (?, ?, ?, ?)"
);

const queue: Job[] = [];
let running = false;
let current: ChildProcess | null = null;
let currentSongId: string | null = null;

/** True while a song is being separated or is waiting in line. */
export function isSeparating(): boolean {
  return running || queue.length > 0;
}

/** Forget a song's queued job, or stop it if it's the one running (its song was deleted). */
export function cancelSeparation(songId: string): void {
  const queued = queue.findIndex((job) => job.songId === songId);
  if (queued !== -1) queue.splice(queued, 1);
  if (currentSongId === songId) current?.kill();
}

/** Stop the running separation and drop queued jobs (used when the app quits). */
export function stopSeparation(): void {
  queue.length = 0;
  current?.kill();
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

function runSeparation(job: Job): Promise<void> {
  const { songId, inputPath } = job;

  return new Promise((resolve) => {
    const child = spawn(WORKER_PYTHON, [WORKER_SCRIPT, inputPath, songId, STEMS_DIR], {
      // Keep the interpreter from writing .pyc files or reading user
      // site-packages - matters for a read-only bundled app.
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1", PYTHONNOUSERSITE: "1" },
    });
    current = child;
    currentSongId = songId;

    child.stdout.on("data", (chunk) => process.stdout.write(`[worker ${songId}] ${chunk}`));
    child.stderr.on("data", (chunk) => process.stderr.write(`[worker ${songId}] ${chunk}`));

    child.on("error", (err) => {
      // e.g. worker/.venv doesn't exist yet - surface a clear message
      // instead of leaving the song stuck at "processing" forever.
      markFailed.run(`Failed to start separation worker: ${err.message}`, songId);
      resolve();
    });

    child.on("close", () => {
      current = null;
      currentSongId = null;
      finalize(songId);
      resolve();
    });
  });
}

function finalize(songId: string): void {
  // The song may have been deleted while it was being separated.
  if (!db.prepare("SELECT 1 FROM songs WHERE id = ?").get(songId)) {
    fs.rm(path.join(STEMS_DIR, songId), { recursive: true, force: true }, () => {});
    return;
  }

  const songStemsDir = path.join(STEMS_DIR, songId);
  const manifestPath = path.join(songStemsDir, "manifest.json");

  let manifest: Manifest | null = null;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  } catch {
    // Missing/unreadable manifest is treated as failure below.
  }

  if (!manifest || manifest.status !== "done" || !manifest.stems) {
    const message = manifest?.error ?? "Separation failed (no manifest produced)";
    markFailed.run(message, songId);
    return;
  }

  const insertAll = db.transaction((stems: Record<string, string>) => {
    for (const [name, filename] of Object.entries(stems)) {
      insertStem.run(randomUUID(), songId, name, path.join(songStemsDir, filename));
    }
    markReady.run(songId);
  });

  insertAll(manifest.stems);
}

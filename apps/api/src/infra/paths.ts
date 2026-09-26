import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * The repo checkout this code runs from, found by walking up to the folder
 * that holds worker/separate.py. Searching (rather than counting "..") keeps
 * it right both from source (tsx) and from the desktop app's esbuild bundle,
 * which live at different depths. Only used when running from the repo; the
 * packaged app sets every STEMIFY_* path below explicitly.
 */
function findRepoRoot(start: string): string {
  for (let dir = start; ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, "worker", "separate.py"))) return dir;
    if (path.dirname(dir) === dir) return process.cwd();
  }
}

export const REPO_ROOT = findRepoRoot(path.dirname(fileURLToPath(import.meta.url)));

// Each location can be overridden by the environment so the same server code
// runs from the repo (dev) or from inside a packaged desktop app, where the
// data lives in the user's Application Support folder and Python ships in the
// app bundle.
export const DATA_DIR = process.env.STEMIFY_DATA_DIR ?? path.join(REPO_ROOT, "data");
export const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
export const STEMS_DIR = path.join(DATA_DIR, "stems");
export const DB_PATH = path.join(DATA_DIR, "db.sqlite");
export const WEB_DIST_DIR = process.env.STEMIFY_WEB_DIST ?? path.join(REPO_ROOT, "apps", "web", "dist");

export const WORKER_DIR = path.join(REPO_ROOT, "worker");
const VENV_PYTHON =
  process.platform === "win32" ? path.join(".venv", "Scripts", "python.exe") : path.join(".venv", "bin", "python");
export const WORKER_PYTHON = process.env.STEMIFY_PYTHON ?? path.join(WORKER_DIR, VENV_PYTHON);
export const WORKER_SCRIPT = process.env.STEMIFY_WORKER_SCRIPT ?? path.join(WORKER_DIR, "separate.py");

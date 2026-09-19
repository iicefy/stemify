import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

// apps/api/src -> repo root is three levels up
export const REPO_ROOT = path.resolve(here, "..", "..", "..");

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
export const WORKER_PYTHON = process.env.STEMIFY_PYTHON ?? path.join(WORKER_DIR, ".venv", "bin", "python");
export const WORKER_SCRIPT = process.env.STEMIFY_WORKER_SCRIPT ?? path.join(WORKER_DIR, "separate.py");

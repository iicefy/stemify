import { app } from "electron";
import fs from "node:fs";
import path from "node:path";

/**
 * Points the API server at the right places *before* it is imported (its
 * modules read these at load time). Packaged, everything - the web build,
 * Python, the Demucs model - lives inside the .app; user data goes to
 * Application Support. Unpackaged (`electron .` from the repo) it reuses the
 * repo's own data, web build and worker venv.
 */
export function configureEnvironment(): void {
  if (!app.isPackaged) return;

  const resources = process.resourcesPath;
  const userData = app.getPath("userData");

  // The bundled model cache is read-only inside the app (and on a mounted
  // .dmg), but the Hugging Face client wants to write lock files - so give it
  // a writable copy, made once.
  const hfHome = path.join(userData, "hf-home");
  if (!fs.existsSync(hfHome)) fs.cpSync(path.join(resources, "hf-home"), hfHome, { recursive: true });

  process.env.STEMIFY_DATA_DIR = path.join(userData, "data");
  process.env.STEMIFY_WEB_DIST = path.join(resources, "web");
  // python-build-standalone lays the interpreter out differently per OS.
  process.env.STEMIFY_PYTHON =
    process.platform === "win32"
      ? path.join(resources, "python", "python.exe")
      : path.join(resources, "python", "bin", "python3");
  process.env.STEMIFY_WORKER_SCRIPT = path.join(resources, "worker", "separate.py");
  process.env.HF_HOME = hfHome;
  process.env.HF_HUB_OFFLINE = "1"; // the model is bundled; never touch the network
}

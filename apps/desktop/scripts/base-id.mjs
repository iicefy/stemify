// Writes build/base.json: an ID for everything the small in-app update does
// NOT replace (Electron, the native SQLite module, the bundled Python and its
// packages). An installed app only accepts a small update built on the same
// base; otherwise the user is pointed at a fresh installer.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const requirements = fs.readFileSync(path.join(root, "..", "..", "worker", "requirements.txt"), "utf8");
const prepare = fs.readFileSync(path.join(here, "prepare-python.sh"), "utf8");
const pyTag = /PBS_TAG="([^"]+)"/.exec(prepare)?.[1] ?? "?";
const pyVersion = /PY_VERSION="([^"]+)"/.exec(prepare)?.[1] ?? "?";

const parts = [
  `electron:${pkg.devDependencies.electron}`,
  `sqlite:${pkg.dependencies["better-sqlite3"]}`,
  `updater:${pkg.dependencies["electron-updater"]}`,
  `python:${pyVersion}+${pyTag}`,
  `requirements:${createHash("sha256").update(requirements).digest("hex")}`,
];
const base = createHash("sha256").update(parts.join("\n")).digest("hex").slice(0, 16);

fs.mkdirSync(path.join(root, "build"), { recursive: true });
fs.writeFileSync(path.join(root, "build", "base.json"), JSON.stringify({ base }) + "\n");
console.log(`[base] ${base}`);

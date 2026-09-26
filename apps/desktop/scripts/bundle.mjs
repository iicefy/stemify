// Bundles the Electron main process together with the API server into one
// file. `electron` and the native SQLite module stay external.
import { build } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

await build({
  // Paths below are relative to apps/desktop, wherever this is run from.
  absWorkingDir: path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  entryPoints: ["src/main.ts"],
  outfile: "dist/main.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  external: ["electron", "electron-updater", "better-sqlite3"],
  // The Mac update's swap script is kept as a real .sh file and inlined here.
  loader: { ".sh": "text" },
  // Bundled CommonJS dependencies (express, multer...) call require() for
  // Node built-ins, which doesn't exist in an ES module by default.
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
  sourcemap: true,
  logLevel: "info",
});

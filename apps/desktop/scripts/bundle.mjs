// Bundles the Electron main process together with the API server into one
// file. `electron` and the native SQLite module stay external.
import { build } from "esbuild";

await build({
  entryPoints: ["src/main.ts"],
  outfile: "dist/main.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  external: ["electron", "better-sqlite3"],
  // Bundled CommonJS dependencies (express, multer...) call require() for
  // Node built-ins, which doesn't exist in an ES module by default.
  banner: {
    js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
  },
  sourcemap: true,
  logLevel: "info",
});

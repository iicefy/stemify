/**
 * The API's public surface, for embedding it in another process (the desktop
 * app). Import it only after setting any STEMIFY_* environment variables -
 * paths.ts reads them when the module loads.
 * Run standalone with src/main.ts.
 */
export { startServer } from "./server.js";
export { isSeparating, stopSeparation } from "./separation/queue.js";

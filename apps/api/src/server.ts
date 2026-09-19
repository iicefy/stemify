import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { songsRouter } from "./routes/songs.js";
import { WEB_DIST_DIR } from "./paths.js";
import { db } from "./db.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");

  app.use(cors());
  app.use("/api/songs", songsRouter);

  if (fs.existsSync(WEB_DIST_DIR)) {
    // Vite fingerprints everything under /assets, so it can be cached
    // forever; index.html must always be revalidated to pick up new builds.
    app.use(
      express.static(WEB_DIST_DIR, {
        index: false,
        setHeaders(res, filePath) {
          res.setHeader(
            "Cache-Control",
            filePath.includes(`${path.sep}assets${path.sep}`)
              ? "public, max-age=31536000, immutable"
              : "no-cache"
          );
        },
      })
    );
    app.get("*", (_req, res) => {
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile("index.html", { root: WEB_DIST_DIR });
    });
  }

  return app;
}

/**
 * Songs still marked "processing" at startup belong to a run that was killed
 * mid-separation (app quit, crash) - nothing is working on them any more, so
 * flag them rather than leaving them spinning forever.
 */
function failInterruptedJobs(): void {
  db.prepare(
    "UPDATE songs SET status = 'failed', error_message = 'Interrupted - the app was closed during separation' WHERE status = 'processing'"
  ).run();
}

export function startServer(options: { port?: number; host?: string } = {}): Promise<{ server: Server; port: number }> {
  failInterruptedJobs();
  const app = createApp();
  return new Promise((resolve, reject) => {
    const server = options.host ? app.listen(options.port ?? 0, options.host) : app.listen(options.port ?? 0);
    server.once("error", reject);
    server.once("listening", () => resolve({ server, port: (server.address() as AddressInfo).port }));
  });
}

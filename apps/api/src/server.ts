import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { songsRouter } from "./http/songsRouter.js";
import { WEB_DIST_DIR } from "./infra/paths.js";
import { errorHandler, HttpError } from "./http/errors.js";
import { failInterruptedSongs } from "./db/songRepository.js";

export function createApp() {
  const app = express();
  app.disable("x-powered-by");

  app.use(cors());
  app.use("/api/songs", songsRouter);
  app.use("/api", (_req, _res, next) => next(new HttpError(404, "Not found")));

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

  app.use(errorHandler);
  return app;
}

export function startServer(options: { port?: number; host?: string } = {}): Promise<{ server: Server; port: number }> {
  failInterruptedSongs();
  const app = createApp();
  return new Promise((resolve, reject) => {
    const server = options.host ? app.listen(options.port ?? 0, options.host) : app.listen(options.port ?? 0);
    server.once("error", reject);
    server.once("listening", () => resolve({ server, port: (server.address() as AddressInfo).port }));
  });
}

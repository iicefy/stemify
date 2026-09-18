import express from "express";
import cors from "cors";
import fs from "node:fs";
import path from "node:path";
import { songsRouter } from "./routes/songs.js";
import { WEB_DIST_DIR } from "./paths.js";
import "./db.js"; // ensure schema is created on boot

const app = express();
app.disable("x-powered-by");
const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;

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

app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});

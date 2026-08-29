import express from "express";
import cors from "cors";
import fs from "node:fs";
import { songsRouter } from "./routes/songs.js";
import { WEB_DIST_DIR } from "./paths.js";
import "./db.js"; // ensure schema is created on boot

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 3001;

app.use(cors());
app.use("/api/songs", songsRouter);

if (fs.existsSync(WEB_DIST_DIR)) {
  app.use(express.static(WEB_DIST_DIR));
  app.get("*", (_req, res) => {
    res.sendFile("index.html", { root: WEB_DIST_DIR });
  });
}

app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});

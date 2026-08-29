import { Router } from "express";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { db, type SongRow, type StemRow } from "../db.js";
import { UPLOADS_DIR, STEMS_DIR } from "../paths.js";
import { enqueueSeparation } from "../separation.js";

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB
  fileFilter: (_req, file, cb) => {
    const allowed = [".mp3", ".wav", ".flac", ".m4a", ".ogg"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowed.includes(ext)) {
      cb(new Error(`Unsupported file type: ${ext}`));
      return;
    }
    cb(null, true);
  },
});

export const songsRouter = Router();

songsRouter.post("/", upload.single("file"), (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }

  const id = randomUUID();
  // multer/busboy decode multipart headers as latin1, so a UTF-8 filename
  // (e.g. Thai song titles) arrives mis-decoded unless converted back.
  const originalName = Buffer.from(req.file.originalname, "latin1").toString("utf8");
  const title = path.parse(originalName).name;
  const createdAt = new Date().toISOString();

  db.prepare(
    `INSERT INTO songs (id, title, original_path, status, created_at)
     VALUES (?, ?, ?, 'processing', ?)`
  ).run(id, title, req.file.path, createdAt);

  enqueueSeparation(id, req.file.path);

  res.status(201).json({ id, title, status: "processing" });
});

songsRouter.get("/", (_req, res) => {
  const songs = db
    .prepare("SELECT * FROM songs ORDER BY created_at DESC")
    .all() as SongRow[];
  res.json(songs.map(toSongDto));
});

songsRouter.get("/:id", (req, res) => {
  const song = db
    .prepare("SELECT * FROM songs WHERE id = ?")
    .get(req.params.id) as SongRow | undefined;

  if (!song) {
    res.status(404).json({ error: "Song not found" });
    return;
  }

  const stems = db
    .prepare("SELECT * FROM stems WHERE song_id = ?")
    .all(song.id) as StemRow[];

  res.json({
    ...toSongDto(song),
    stems: stems.map((s) => ({ id: s.id, name: s.name })),
  });
});

songsRouter.delete("/:id", (req, res) => {
  const song = db
    .prepare("SELECT * FROM songs WHERE id = ?")
    .get(req.params.id) as SongRow | undefined;

  if (!song) {
    res.status(404).json({ error: "Song not found" });
    return;
  }

  db.prepare("DELETE FROM songs WHERE id = ?").run(song.id); // cascades to stems

  fs.rm(song.original_path, { force: true }, () => {});
  fs.rm(path.join(STEMS_DIR, song.id), { recursive: true, force: true }, () => {});

  res.status(204).end();
});

songsRouter.get("/:id/stems/:stemId", (req, res) => {
  const stem = db
    .prepare("SELECT * FROM stems WHERE id = ? AND song_id = ?")
    .get(req.params.stemId, req.params.id) as StemRow | undefined;

  if (!stem) {
    res.status(404).json({ error: "Stem not found" });
    return;
  }

  res.sendFile(stem.file_path);
});

function toSongDto(song: SongRow) {
  return {
    id: song.id,
    title: song.title,
    status: song.status,
    errorMessage: song.error_message,
    createdAt: song.created_at,
  };
}

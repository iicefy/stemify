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

// Prepared once at load - better-sqlite3 statements are meant to be reused,
// and re-preparing on every request re-parses the SQL each time.
const insertSong = db.prepare(
  `INSERT INTO songs (id, title, original_path, status, created_at)
   VALUES (?, ?, ?, 'processing', ?)`
);
const listSongs = db.prepare(
  "SELECT id, title, status, error_message, created_at FROM songs ORDER BY created_at DESC"
);
const getSong = db.prepare("SELECT * FROM songs WHERE id = ?");
const listStems = db.prepare("SELECT id, name FROM stems WHERE song_id = ?");
const deleteSong = db.prepare("DELETE FROM songs WHERE id = ?");
const getStem = db.prepare("SELECT file_path FROM stems WHERE id = ? AND song_id = ?");

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

  insertSong.run(id, title, req.file.path, createdAt);

  enqueueSeparation(id, req.file.path);

  res.status(201).json({ id, title, status: "processing" });
});

songsRouter.get("/", (_req, res) => {
  const songs = listSongs.all() as SongSummary[];
  res.json(songs.map(toSongDto));
});

songsRouter.get("/:id", (req, res) => {
  const song = getSong.get(req.params.id) as SongRow | undefined;

  if (!song) {
    res.status(404).json({ error: "Song not found" });
    return;
  }

  res.json({
    ...toSongDto(song),
    stems: listStems.all(song.id),
  });
});

songsRouter.delete("/:id", (req, res) => {
  const song = getSong.get(req.params.id) as SongRow | undefined;

  if (!song) {
    res.status(404).json({ error: "Song not found" });
    return;
  }

  deleteSong.run(song.id); // cascades to stems

  fs.rm(song.original_path, { force: true }, () => {});
  fs.rm(path.join(STEMS_DIR, song.id), { recursive: true, force: true }, () => {});

  res.status(204).end();
});

songsRouter.get("/:id/stems/:stemId", (req, res) => {
  const stem = getStem.get(req.params.stemId, req.params.id) as Pick<StemRow, "file_path"> | undefined;

  if (!stem) {
    res.status(404).json({ error: "Stem not found" });
    return;
  }

  // Stem ids are random UUIDs and the audio never changes once written, so
  // the browser can keep it and skip re-downloading ~40MB per stem on
  // every reopen of the same song.
  res.sendFile(stem.file_path, { maxAge: "1y", immutable: true });
});

type SongSummary = Pick<SongRow, "id" | "title" | "status" | "error_message" | "created_at">;

function toSongDto(song: SongSummary) {
  return {
    id: song.id,
    title: song.title,
    status: song.status,
    errorMessage: song.error_message,
    createdAt: song.created_at,
  };
}

import express, { Router, type Request } from "express";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  AUDIO_EXTENSIONS,
  MAX_TITLE_LENGTH,
  isAudioFileName,
  type LibraryEvent,
  type SongDetail,
  type SongSettings,
} from "@musicapp/shared";
import { currentProgress, subscribe } from "../events.js";
import { UPLOADS_DIR } from "../paths.js";
import { HttpError } from "../http.js";
import { cancelSeparation, enqueueSeparation } from "../separation.js";
import * as songs from "../songRepository.js";
import { removeFile, removeStems } from "../storage.js";
import { startYoutubeImport } from "../youtube.js";
import { parseYoutubeUrl } from "../youtubeUrl.js";

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (_req, file, cb) => cb(null, `${randomUUID()}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 200 * 1024 * 1024 }, // 200MB
  fileFilter: (_req, file, cb) => {
    if (isAudioFileName(file.originalname)) cb(null, true);
    else cb(new HttpError(400, `Unsupported file type - use ${AUDIO_EXTENSIONS.join(", ")}`));
  },
});

const smallJson = express.json({ limit: "10kb" });
const SSE_KEEPALIVE_MS = 25_000;

function requireSong(req: Request<{ id: string }>): songs.SongRow {
  const song = songs.getSong(req.params.id);
  if (!song) throw new HttpError(404, "Song not found");
  return song;
}

export const songsRouter = Router();

songsRouter.get("/", (_req, res) => {
  res.json(songs.listSongs());
});

// Server-Sent Events: pushes LibraryEvents so the library never has to poll.
// Registered before "/:id" so "events" isn't taken for a song id.
songsRouter.get("/events", (req, res) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  const send = (event: LibraryEvent) => res.write(`data: ${JSON.stringify(event)}\n\n`);

  res.write("retry: 2000\n\n"); // reconnect quickly if the connection drops
  currentProgress().forEach(send);
  const unsubscribe = subscribe(send);
  // Comments keep idle connections from being timed out along the way.
  const keepAlive = setInterval(() => res.write(": keep-alive\n\n"), SSE_KEEPALIVE_MS);

  req.on("close", () => {
    clearInterval(keepAlive);
    unsubscribe();
  });
});

songsRouter.post("/", upload.single("file"), (req, res) => {
  if (!req.file) throw new HttpError(400, "No file uploaded");

  // multer/busboy decode multipart headers as latin1, so a UTF-8 filename
  // (e.g. Thai song titles) arrives mis-decoded unless converted back.
  const originalName = Buffer.from(req.file.originalname, "latin1").toString("utf8");
  const song = songs.createSong({
    title: path.parse(originalName).name.slice(0, MAX_TITLE_LENGTH),
    status: "processing",
    originalPath: req.file.path,
  });
  enqueueSeparation(song.id, req.file.path);

  res.status(201).json(song);
});

songsRouter.post("/youtube", smallJson, (req, res) => {
  const url = parseYoutubeUrl(req.body?.url);
  if (!url) throw new HttpError(400, "Enter a valid YouTube link");

  // The link stands in as the title until the download reports the real one.
  const song = songs.createSong({ title: url.href, status: "downloading", sourceUrl: url.href });
  void startYoutubeImport(song.id, url);

  res.status(201).json(song);
});

songsRouter.get("/:id", (req, res) => {
  const song = requireSong(req);
  res.json({
    ...songs.toSongDto(song),
    stems: songs.listStems(song.id),
    // Opaque to the API; the player validates it before using any of it.
    settings: songs.parseSongSettings(song.settings) as SongSettings | null,
  } satisfies SongDetail);
});

songsRouter.patch("/:id", smallJson, (req, res) => {
  const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
  if (title.length === 0 || title.length > MAX_TITLE_LENGTH) {
    throw new HttpError(400, `Title must be 1-${MAX_TITLE_LENGTH} characters`);
  }
  if (!songs.renameSong(req.params.id, title)) throw new HttpError(404, "Song not found");

  res.json({ id: req.params.id, title });
});

songsRouter.put("/:id/settings", express.json({ limit: "20kb" }), (req, res) => {
  const settings: unknown = req.body;
  if (typeof settings !== "object" || settings === null || Array.isArray(settings)) {
    throw new HttpError(400, "Settings must be a JSON object");
  }
  if (!songs.saveSongSettings(req.params.id, settings)) throw new HttpError(404, "Song not found");

  res.status(204).end();
});

songsRouter.post("/:id/retry", (req, res) => {
  const song = requireSong(req);
  if (song.status !== "failed") throw new HttpError(400, "Only failed songs can be retried");

  if (song.original_path && fs.existsSync(song.original_path)) {
    removeStems(song.id);
    songs.setSongStatus(song.id, "processing");
    enqueueSeparation(song.id, song.original_path);
    res.json({ id: song.id, status: "processing" });
    return;
  }

  const url = parseYoutubeUrl(song.source_url);
  if (url) {
    songs.setSongStatus(song.id, "downloading");
    void startYoutubeImport(song.id, url);
    res.json({ id: song.id, status: "downloading" });
    return;
  }

  throw new HttpError(400, "The original file is gone. Delete this song and add it again.");
});

songsRouter.delete("/:id", (req, res) => {
  const song = requireSong(req);

  songs.deleteSong(song.id);
  cancelSeparation(song.id);
  removeFile(song.original_path);
  removeStems(song.id);

  res.status(204).end();
});

songsRouter.get("/:id/stems/:stemId", (req, res) => {
  const filePath = songs.getStemPath(req.params.id, req.params.stemId);
  if (!filePath) throw new HttpError(404, "Stem not found");

  // Stem ids are random UUIDs and the audio never changes once written, so
  // the browser can keep it and skip re-downloading ~40MB per stem on
  // every reopen of the same song.
  res.sendFile(filePath, { maxAge: "1y", immutable: true });
});

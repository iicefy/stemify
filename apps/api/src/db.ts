import Database from "better-sqlite3";
import fs from "node:fs";
import { DATA_DIR, DB_PATH, UPLOADS_DIR, STEMS_DIR } from "./paths.js";

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });
fs.mkdirSync(STEMS_DIR, { recursive: true });

export const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
// NORMAL is the recommended pairing with WAL: still crash-safe for the DB
// file, but skips an fsync per commit.
db.pragma("synchronous = NORMAL");
db.pragma("busy_timeout = 5000");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS songs (
    id            TEXT PRIMARY KEY,
    title         TEXT NOT NULL,
    original_path TEXT NOT NULL,
    status        TEXT NOT NULL, -- 'processing' | 'ready' | 'failed'
    error_message TEXT,
    created_at    TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS stems (
    id        TEXT PRIMARY KEY,
    song_id   TEXT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
    name      TEXT NOT NULL,
    file_path TEXT NOT NULL
  );

  -- Stems are always looked up (and cascade-deleted) by song.
  CREATE INDEX IF NOT EXISTS idx_stems_song_id ON stems(song_id);
  CREATE INDEX IF NOT EXISTS idx_songs_created_at ON songs(created_at DESC);
`);

export type SongStatus = "processing" | "ready" | "failed";

export interface SongRow {
  id: string;
  title: string;
  original_path: string;
  status: SongStatus;
  error_message: string | null;
  created_at: string;
}

export interface StemRow {
  id: string;
  song_id: string;
  name: string;
  file_path: string;
}

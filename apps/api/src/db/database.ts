import Database from "better-sqlite3";
import fs from "node:fs";
import { DATA_DIR, DB_PATH, UPLOADS_DIR, STEMS_DIR } from "../infra/paths.js";

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
    status        TEXT NOT NULL, -- 'downloading' | 'processing' | 'ready' | 'failed'
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

/** Columns added after the first release; existing libraries gain them on startup. */
function addColumnIfMissing(table: string, column: string, type: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!columns.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
}

// Where a YouTube song came from, so a failed download can be retried.
addColumnIfMissing("songs", "source_url", "TEXT");
// Per-song player state (master volume, speed, loop, per-track mix), saved as
// one JSON blob so it's opaque to the DB layer and free to grow later. Keyed
// by the song, not the stems, so it survives Retry regenerating stem ids.
addColumnIfMissing("songs", "settings", "TEXT");

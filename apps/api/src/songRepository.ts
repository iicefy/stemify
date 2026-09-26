import { randomUUID } from "node:crypto";
import type { Song, SongStatus, Stem } from "@musicapp/shared";
import { db } from "./db.js";
import { notifySongsChanged } from "./events.js";

/**
 * Every query the app runs, in one place. Statements are prepared once at
 * load - better-sqlite3 statements are meant to be reused, and re-preparing
 * on every call re-parses the SQL each time.
 *
 * Every write that changes what the song list shows calls
 * notifySongsChanged(), so connected clients refresh - doing it here means no
 * caller can forget to.
 */

export interface SongRow {
  id: string;
  title: string;
  original_path: string;
  status: SongStatus;
  error_message: string | null;
  created_at: string;
  source_url: string | null;
  settings: string | null;
}

type SongSummaryRow = Pick<SongRow, "id" | "title" | "status" | "error_message" | "created_at">;

const statements = {
  insert: db.prepare(
    `INSERT INTO songs (id, title, original_path, status, created_at, source_url)
     VALUES (@id, @title, @originalPath, @status, @createdAt, @sourceUrl)`
  ),
  list: db.prepare("SELECT id, title, status, error_message, created_at FROM songs ORDER BY created_at DESC"),
  get: db.prepare("SELECT * FROM songs WHERE id = ?"),
  exists: db.prepare("SELECT 1 FROM songs WHERE id = ?"),
  remove: db.prepare("DELETE FROM songs WHERE id = ?"), // cascades to stems
  rename: db.prepare("UPDATE songs SET title = ? WHERE id = ?"),
  saveSettings: db.prepare("UPDATE songs SET settings = ? WHERE id = ?"),
  setStatus: db.prepare("UPDATE songs SET status = ?, error_message = NULL WHERE id = ?"),
  markFailed: db.prepare("UPDATE songs SET status = 'failed', error_message = ? WHERE id = ?"),
  markReady: db.prepare("UPDATE songs SET status = 'ready' WHERE id = ?"),
  markDownloaded: db.prepare("UPDATE songs SET title = ?, original_path = ?, status = 'processing' WHERE id = ?"),
  failInterrupted: db.prepare(
    "UPDATE songs SET status = 'failed', error_message = ? WHERE status IN ('processing', 'downloading')"
  ),
  listStems: db.prepare("SELECT id, name FROM stems WHERE song_id = ?"),
  insertStem: db.prepare("INSERT INTO stems (id, song_id, name, file_path) VALUES (?, ?, ?, ?)"),
  getStemPath: db.prepare("SELECT file_path FROM stems WHERE id = ? AND song_id = ?"),
};

export function toSongDto(row: SongSummaryRow): Song {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    errorMessage: row.error_message,
    createdAt: row.created_at,
  };
}

export function createSong(fields: {
  title: string;
  status: SongStatus;
  originalPath?: string;
  sourceUrl?: string;
}): Song {
  const song = { id: randomUUID(), createdAt: new Date().toISOString(), ...fields };
  statements.insert.run({ originalPath: "", sourceUrl: null, ...song });
  notifySongsChanged();
  return { id: song.id, title: song.title, status: song.status, errorMessage: null, createdAt: song.createdAt };
}

export function listSongs(): Song[] {
  return (statements.list.all() as SongSummaryRow[]).map(toSongDto);
}

export function getSong(id: string): SongRow | undefined {
  return statements.get.get(id) as SongRow | undefined;
}

/** False once a song has been deleted - background jobs check this before writing. */
export function songExists(id: string): boolean {
  return statements.exists.get(id) !== undefined;
}

export function deleteSong(id: string): void {
  statements.remove.run(id);
  notifySongsChanged();
}

/** Returns false if there's no such song. */
export function renameSong(id: string, title: string): boolean {
  const changed = statements.rename.run(title, id).changes > 0;
  if (changed) notifySongsChanged();
  return changed;
}

/** Returns false if there's no such song. */
export function saveSongSettings(id: string, settings: object): boolean {
  return statements.saveSettings.run(JSON.stringify(settings), id).changes > 0;
}

/** Malformed JSON (e.g. a hand-edited DB) reads as "no saved settings" rather than breaking the song. */
export function parseSongSettings(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Moves a song back into the pipeline, clearing any previous error. */
export function setSongStatus(id: string, status: SongStatus): void {
  statements.setStatus.run(status, id);
  notifySongsChanged();
}

export function markSongFailed(id: string, message: string): void {
  statements.markFailed.run(message, id);
  notifySongsChanged();
}

export function markSongDownloaded(id: string, title: string, filePath: string): void {
  statements.markDownloaded.run(title, filePath, id);
  notifySongsChanged();
}

const insertStemsAndMarkReady = db.transaction((songId: string, stems: { name: string; filePath: string }[]) => {
  for (const stem of stems) statements.insertStem.run(randomUUID(), songId, stem.name, stem.filePath);
  statements.markReady.run(songId);
});

/** Records the separated stems and marks the song ready, atomically. */
export function completeSeparation(songId: string, stems: { name: string; filePath: string }[]): void {
  insertStemsAndMarkReady(songId, stems);
  notifySongsChanged();
}

/**
 * Songs still mid-pipeline at startup belong to a run that was killed (app
 * quit, crash) - nothing is working on them any more, so flag them rather
 * than leaving them spinning forever.
 */
export function failInterruptedSongs(): void {
  statements.failInterrupted.run("Interrupted - the app was closed before this finished");
}

export function listStems(songId: string): Stem[] {
  return statements.listStems.all(songId) as Stem[];
}

export function getStemPath(songId: string, stemId: string): string | undefined {
  return (statements.getStemPath.get(stemId, songId) as { file_path: string } | undefined)?.file_path;
}

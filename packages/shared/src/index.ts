/**
 * The contract between the API and the web app: the JSON shapes the API sends
 * and accepts, plus the limits both sides enforce. Types only change here, so
 * the two can't quietly drift apart.
 */

export type SongStatus = "downloading" | "processing" | "ready" | "failed";

export interface Song {
  id: string;
  title: string;
  status: SongStatus;
  errorMessage: string | null;
  createdAt: string;
}

export interface Stem {
  id: string;
  name: string;
}

export interface LoopRegion {
  start: number; // seconds
  end: number; // seconds
}

export interface TrackMix {
  muted: boolean;
  solo: boolean;
  volume: number; // 0..1
}

/**
 * Everything about how you last set up a song's player, saved so it's back
 * the next time you open it. Keyed by stem *name* (not id): a retried song
 * gets new stem ids, but the names ("drums", "bass"...) stay the same.
 * The API stores it as an opaque blob; only the player interprets it.
 */
export interface SongSettings {
  masterVolume: number;
  playbackRate: number;
  loopEnabled: boolean;
  loopRegion: LoopRegion | null;
  tracks: Record<string, TrackMix>;
}

export interface SongDetail extends Song {
  stems: Stem[];
  settings: SongSettings | null;
}

/** Body of every non-2xx JSON response. */
export interface ApiError {
  error: string;
}

/** Audio file types that can be uploaded (lowercase, with the dot). */
export const AUDIO_EXTENSIONS = [".mp3", ".wav", ".flac", ".m4a", ".ogg"] as const;

export const MAX_TITLE_LENGTH = 200;

export function isAudioFileName(name: string): boolean {
  const lower = name.toLowerCase();
  return AUDIO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * Pushed over GET /api/songs/events (Server-Sent Events, one JSON object per
 * `data:` line) so the library updates the moment something changes.
 */
export type LibraryEvent =
  /** Songs were added, removed, renamed or changed status: refetch the list. */
  | { type: "changed" }
  /** How far a song's separation has got, 0..1. Sent for every song in progress when a client connects. */
  | { type: "progress"; songId: string; progress: number };

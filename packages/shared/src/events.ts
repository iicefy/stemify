/**
 * Pushed over GET /api/songs/events (Server-Sent Events, one JSON object per
 * `data:` line) so the library updates the moment something changes.
 */
export type LibraryEvent =
  /** Songs were added, removed, renamed or changed status: refetch the list. */
  | { type: "changed" }
  /** How far a song's separation has got, 0..1. Sent for every song in progress when a client connects. */
  | { type: "progress"; songId: string; progress: number };

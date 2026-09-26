import { EventEmitter } from "node:events";
import type { LibraryEvent } from "@musicapp/shared";

/**
 * Library change notifications, fanned out to every connected client over
 * Server-Sent Events (see GET /api/songs/events).
 */
const emitter = new EventEmitter();
emitter.setMaxListeners(0); // one listener per open window; no real limit

/** Latest separation progress per song, replayed to clients that connect mid-job. */
const progressBySong = new Map<string, number>();

let changePending = false;

/**
 * Something about the song list changed. Coalesced per tick: one request can
 * touch several rows, but clients only need one "refetch" nudge for it.
 */
export function notifySongsChanged(): void {
  if (changePending) return;
  changePending = true;
  setImmediate(() => {
    changePending = false;
    emitter.emit("event", { type: "changed" } satisfies LibraryEvent);
  });
}

export function reportProgress(songId: string, progress: number): void {
  progressBySong.set(songId, progress);
  emitter.emit("event", { type: "progress", songId, progress } satisfies LibraryEvent);
}

export function clearProgress(songId: string): void {
  progressBySong.delete(songId);
}

/** Progress events for every song still separating - what a new client needs to catch up. */
export function currentProgress(): LibraryEvent[] {
  return [...progressBySong].map(([songId, progress]) => ({ type: "progress", songId, progress }));
}

export function subscribe(listener: (event: LibraryEvent) => void): () => void {
  emitter.on("event", listener);
  return () => emitter.off("event", listener);
}

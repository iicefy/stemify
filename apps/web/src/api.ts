import type { ApiError, LibraryEvent, Song, SongDetail, SongSettings, Stem } from "@musicapp/shared";

export type { LibraryEvent, LoopRegion, Song, SongDetail, SongSettings, SongStatus, Stem, TrackMix } from "@musicapp/shared";

const BASE = "/api/songs";

/**
 * fetch() that throws on a non-2xx response, using the API's own
 * `{ error }` message when it sent one (falling back to `fallbackMessage`).
 */
async function request(path: string, fallbackMessage: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as Partial<ApiError> | null;
    throw new Error(body?.error ?? fallbackMessage);
  }
  return res;
}

const jsonBody = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export async function listSongs(): Promise<Song[]> {
  return (await request("", "Failed to load songs")).json();
}

export async function getSong(id: string): Promise<SongDetail> {
  const detail: SongDetail = await (await request(`/${id}`, "Failed to load song")).json();
  return { ...detail, stems: sortStems(detail.stems) };
}

// "other" is Demucs's catch-all bucket, so it reads better at the bottom of
// the track list than wherever separation happens to emit it - everything
// else keeps the order the API returns (a stable sort only moves "other").
export function sortStems(stems: Stem[]): Stem[] {
  return [...stems].sort((a, b) => Number(a.name === "other") - Number(b.name === "other"));
}

export async function uploadSong(file: File): Promise<Song> {
  const form = new FormData();
  form.append("file", file);
  return (await request("", "Upload failed", { method: "POST", body: form })).json();
}

export async function importYoutube(url: string): Promise<Song> {
  return (await request("/youtube", "Could not add that link", jsonBody("POST", { url }))).json();
}

export async function renameSong(id: string, title: string): Promise<void> {
  await request(`/${id}`, "Rename failed", jsonBody("PATCH", { title }));
}

export async function saveSongSettings(id: string, settings: SongSettings): Promise<void> {
  await request(`/${id}/settings`, "Could not save your settings for this song", jsonBody("PUT", settings));
}

export async function retrySong(id: string): Promise<void> {
  await request(`/${id}/retry`, "Retry failed", { method: "POST" });
}

export async function deleteSong(id: string): Promise<void> {
  await request(`/${id}`, "Delete failed", { method: "DELETE" });
}

export function stemUrl(songId: string, stemId: string): string {
  return `${BASE}/${songId}/stems/${stemId}`;
}

/**
 * Live library updates (Server-Sent Events). The browser reconnects by itself
 * if the connection drops. `onConnect` fires on every (re)connection: events
 * sent before it - while disconnected, or before the stream first opened -
 * are never delivered, so the caller should refetch then.
 * Returns an unsubscribe function.
 */
export function subscribeToLibrary(onEvent: (event: LibraryEvent) => void, onConnect: () => void): () => void {
  const source = new EventSource(`${BASE}/events`);
  source.onopen = onConnect;
  source.onmessage = (e: MessageEvent<string>) => {
    try {
      onEvent(JSON.parse(e.data) as LibraryEvent);
    } catch {
      // Ignore anything that isn't a LibraryEvent.
    }
  };
  return () => source.close();
}

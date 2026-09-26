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

/**
 * Everything about how you last set up a song's player, saved so it's back
 * the next time you open it. Keyed by stem *name* (not id): a retried song
 * gets new stem ids, but the names ("drums", "bass"...) stay the same.
 */
export interface SongSettings {
  masterVolume: number;
  playbackRate: number;
  loopEnabled: boolean;
  loopRegion: { start: number; end: number } | null;
  tracks: Record<string, { muted: boolean; solo: boolean; volume: number }>;
}

export interface SongDetail extends Song {
  stems: Stem[];
  settings: SongSettings | null;
}

const BASE = "/api/songs";

export async function listSongs(): Promise<Song[]> {
  const res = await fetch(BASE);
  if (!res.ok) throw new Error("Failed to load songs");
  return res.json();
}

export async function getSong(id: string): Promise<SongDetail> {
  const res = await fetch(`${BASE}/${id}`);
  if (!res.ok) throw new Error("Failed to load song");
  const detail: SongDetail = await res.json();
  return { ...detail, stems: sortStems(detail.stems) };
}

// "other" is Demucs's catch-all bucket, so it reads better at the bottom of
// the track list than wherever separation happens to emit it - everything
// else keeps the order the API returns (a stable sort only moves "other").
function sortStems(stems: Stem[]): Stem[] {
  return [...stems].sort((a, b) => Number(a.name === "other") - Number(b.name === "other"));
}

export async function uploadSong(file: File): Promise<Song> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(BASE, { method: "POST", body: form });
  if (!res.ok) throw new Error("Upload failed");
  return res.json();
}

export async function importYoutube(url: string): Promise<Song> {
  const res = await fetch(`${BASE}/youtube`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? "Could not add that link");
  }
  return res.json();
}

export async function renameSong(id: string, title: string): Promise<void> {
  const res = await fetch(`${BASE}/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? "Rename failed");
  }
}

export async function saveSongSettings(id: string, settings: SongSettings): Promise<void> {
  const res = await fetch(`${BASE}/${id}/settings`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
  if (!res.ok) throw new Error("Could not save your settings for this song");
}

export async function retrySong(id: string): Promise<void> {
  const res = await fetch(`${BASE}/${id}/retry`, { method: "POST" });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? "Retry failed");
  }
}

export async function deleteSong(id: string): Promise<void> {
  const res = await fetch(`${BASE}/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Delete failed");
}

export function stemUrl(songId: string, stemId: string): string {
  return `${BASE}/${songId}/stems/${stemId}`;
}

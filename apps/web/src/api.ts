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

export interface SongDetail extends Song {
  stems: Stem[];
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
  return res.json();
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

export type SongStatus = "processing" | "ready" | "failed";

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

export async function deleteSong(id: string): Promise<void> {
  const res = await fetch(`${BASE}/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("Delete failed");
}

export function stemUrl(songId: string, stemId: string): string {
  return `${BASE}/${songId}/stems/${stemId}`;
}

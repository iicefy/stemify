import type { Song, SongDetail, SongSettings, Stem } from "@musicapp/shared";
import { jsonBody, request, SONGS_BASE } from "./request";

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
  return `${SONGS_BASE}/${songId}/stems/${stemId}`;
}

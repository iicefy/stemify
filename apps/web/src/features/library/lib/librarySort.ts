import type { Song } from "../../../api";
import { readStored, writeStored } from "../../../lib/storage";

export type SortKey = "newest" | "oldest" | "az" | "za";

export const SORT_LABELS: Record<SortKey, string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  az: "Name A–Z",
  za: "Name Z–A",
};

export const SORT_KEYS = Object.keys(SORT_LABELS) as SortKey[];

const STORAGE_KEY = "stemify.librarySort";

export function loadSort(): SortKey {
  const saved = readStored(STORAGE_KEY);
  return saved && saved in SORT_LABELS ? (saved as SortKey) : "newest";
}

export function saveSort(sort: SortKey): void {
  writeStored(STORAGE_KEY, sort);
}

const byName = (a: Song, b: Song) => a.title.localeCompare(b.title, undefined, { sensitivity: "base", numeric: true });

/** Returns a new, sorted array; `songs` is left untouched. */
export function sortSongs(songs: Song[], sort: SortKey): Song[] {
  const sorted = [...songs];
  switch (sort) {
    case "newest":
      return sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    case "oldest":
      return sorted.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    case "az":
      return sorted.sort(byName);
    case "za":
      return sorted.sort((a, b) => byName(b, a));
  }
}

/** Case-insensitive title search, then sort. */
export function filterAndSortSongs(songs: Song[], query: string, sort: SortKey): Song[] {
  const needle = query.trim().toLowerCase();
  const matching = needle ? songs.filter((s) => s.title.toLowerCase().includes(needle)) : songs;
  return sortSongs(matching, sort);
}

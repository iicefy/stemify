import { describe, expect, it } from "vitest";
import type { Song } from "../../api";
import { filterAndSortSongs, sortSongs } from "./librarySort";

const song = (title: string, createdAt: string): Song => ({
  id: title,
  title,
  status: "ready",
  errorMessage: null,
  createdAt,
});

const songs = [
  song("track 10", "2026-01-02T00:00:00Z"),
  song("Track 2", "2026-01-03T00:00:00Z"),
  song("apple", "2026-01-01T00:00:00Z"),
];
const titles = (list: Song[]) => list.map((s) => s.title);

describe("sortSongs", () => {
  it("sorts by date", () => {
    expect(titles(sortSongs(songs, "newest"))).toEqual(["Track 2", "track 10", "apple"]);
    expect(titles(sortSongs(songs, "oldest"))).toEqual(["apple", "track 10", "Track 2"]);
  });

  it("sorts by name, case-insensitively and with numbers in order", () => {
    expect(titles(sortSongs(songs, "az"))).toEqual(["apple", "Track 2", "track 10"]);
    expect(titles(sortSongs(songs, "za"))).toEqual(["track 10", "Track 2", "apple"]);
  });
});

describe("filterAndSortSongs", () => {
  it("matches titles case-insensitively, ignoring surrounding spaces", () => {
    expect(titles(filterAndSortSongs(songs, "  TRACK ", "az"))).toEqual(["Track 2", "track 10"]);
  });

  it("returns everything for an empty query", () => {
    expect(filterAndSortSongs(songs, "   ", "newest")).toHaveLength(3);
  });
});

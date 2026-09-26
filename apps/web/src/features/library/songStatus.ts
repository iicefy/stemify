import type { Song, SongStatus } from "../../api";

export const STATUS_LABEL: Record<SongStatus, string> = {
  downloading: "Downloading…",
  processing: "Separating…",
  ready: "Ready",
  failed: "Failed",
};

/** Still being downloaded or separated - the library keeps polling while any song is. */
export const isBusy = (song: Song): boolean => song.status === "processing" || song.status === "downloading";

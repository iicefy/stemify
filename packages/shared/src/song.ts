import type { SongSettings } from "./settings.js";

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
  settings: SongSettings | null;
}

/** Body of every non-2xx JSON response. */
export interface ApiError {
  error: string;
}

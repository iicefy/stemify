import fs from "node:fs";
import path from "node:path";
import { STEMS_DIR } from "./paths.js";

/** Where a song's separated stems (and the worker's manifest.json) live. */
export function stemsDirFor(songId: string): string {
  return path.join(STEMS_DIR, songId);
}

/** Deletes a song's stems folder. Fire-and-forget: a leftover folder is harmless. */
export function removeStems(songId: string): void {
  fs.rm(stemsDirFor(songId), { recursive: true, force: true }, () => {});
}

/** Deletes a file if it exists. Fire-and-forget, like removeStems. */
export function removeFile(filePath: string): void {
  if (filePath) fs.rm(filePath, { force: true }, () => {});
}

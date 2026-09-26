import { useEffect, useRef } from "react";
import { saveSongSettings, type SongSettings, type Stem } from "../../../api";
import { toSongSettings, type PlayerSettings } from "../lib/songSettings";

// How long to wait after the last change before saving, so dragging a slider
// doesn't fire a request per pixel.
const SAVE_DEBOUNCE_MS = 500;

function save(songId: string, settings: SongSettings): void {
  void saveSongSettings(songId, settings).catch(() => {
    // Best-effort: losing one save just means the next change retries it,
    // and worst case this song reopens with its previous settings.
  });
}

/**
 * Saves the mix, speed and loop for a song a moment after they settle, and
 * immediately when leaving the song. `settings` is null until the player has
 * loaded; the first value after that is what was just restored, so it's
 * taken as the baseline rather than saved straight back.
 */
export function useSettingsAutosave(songId: string, stems: Stem[], settings: PlayerSettings | null): void {
  // What the server has (or is about to get) for this song, as JSON.
  const lastSaved = useRef<{ songId: string; json: string } | null>(null);
  const pending = useRef<{ timer: number; songId: string; settings: SongSettings } | null>(null);

  useEffect(() => {
    if (!settings) return;
    const snapshot = toSongSettings(settings, stems);
    const json = JSON.stringify(snapshot);

    if (lastSaved.current?.songId !== songId) {
      lastSaved.current = { songId, json };
      return;
    }
    if (lastSaved.current.json === json) return;
    lastSaved.current.json = json;

    if (pending.current) window.clearTimeout(pending.current.timer);
    const timer = window.setTimeout(() => {
      pending.current = null;
      save(songId, snapshot);
    }, SAVE_DEBOUNCE_MS);
    pending.current = { timer, songId, settings: snapshot };
  }, [songId, stems, settings]);

  // Leaving the song: save now rather than on a timer that would outlive it.
  useEffect(() => {
    return () => {
      const p = pending.current;
      if (!p) return;
      window.clearTimeout(p.timer);
      pending.current = null;
      save(p.songId, p.settings);
    };
  }, [songId]);
}

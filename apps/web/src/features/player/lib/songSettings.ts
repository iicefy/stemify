import type { LoopRegion, SongSettings, Stem, TrackMix } from "../../../api";
import { clamp, isFiniteNumber } from "../../../lib/math";
import { MASTER_VOLUME, PLAYBACK_RATE, TRACK_VOLUME } from "./limits";

/** The player state that's remembered per song. Tracks are keyed by stem id. */
export interface PlayerSettings {
  trackStates: Map<string, TrackMix>;
  masterVolume: number;
  playbackRate: number;
  loopRegion: LoopRegion | null;
  loopEnabled: boolean;
}

const DEFAULT_TRACK: TrackMix = { muted: false, solo: false, volume: 1 };

/**
 * Turns saved settings (untrusted: an older app version or a hand-edited DB
 * may have written them) into valid player state for these stems. Anything
 * missing or out of range falls back to the default.
 */
export function restoreSettings(saved: SongSettings | null, stems: Stem[], duration: number): PlayerSettings {
  const trackStates = new Map<string, TrackMix>();
  for (const stem of stems) {
    // By *name*: a retried song's stems get new ids but keep their names.
    const track = saved?.tracks?.[stem.name];
    trackStates.set(
      stem.id,
      track
        ? {
            muted: !!track.muted,
            solo: !!track.solo,
            volume: isFiniteNumber(track.volume) ? clamp(track.volume, TRACK_VOLUME.min, TRACK_VOLUME.max) : 1,
          }
        : { ...DEFAULT_TRACK }
    );
  }

  const region = saved?.loopRegion;
  const regionValid =
    !!region &&
    isFiniteNumber(region.start) &&
    isFiniteNumber(region.end) &&
    region.start >= 0 &&
    region.end > region.start &&
    region.end <= duration;

  return {
    trackStates,
    masterVolume: isFiniteNumber(saved?.masterVolume) ? clamp(saved.masterVolume, MASTER_VOLUME.min, MASTER_VOLUME.max) : 1,
    playbackRate: isFiniteNumber(saved?.playbackRate) ? clamp(saved.playbackRate, PLAYBACK_RATE.min, PLAYBACK_RATE.max) : 1,
    loopRegion: regionValid ? { start: region.start, end: region.end } : null,
    loopEnabled: regionValid && !!saved?.loopEnabled,
  };
}

/** The inverse of restoreSettings: what gets saved for this song. */
export function toSongSettings(state: PlayerSettings, stems: Stem[]): SongSettings {
  const tracks: SongSettings["tracks"] = {};
  for (const stem of stems) {
    const track = state.trackStates.get(stem.id);
    if (track) tracks[stem.name] = { muted: track.muted, solo: track.solo, volume: track.volume };
  }
  return {
    masterVolume: state.masterVolume,
    playbackRate: state.playbackRate,
    loopEnabled: state.loopEnabled,
    loopRegion: state.loopRegion,
    tracks,
  };
}

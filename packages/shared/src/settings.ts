export interface LoopRegion {
  start: number; // seconds
  end: number; // seconds
}

export interface TrackMix {
  muted: boolean;
  solo: boolean;
  volume: number; // 0..1
}

/**
 * Everything about how you last set up a song's player, saved so it's back
 * the next time you open it. Keyed by stem *name* (not id): a retried song
 * gets new stem ids, but the names ("drums", "bass"...) stay the same.
 * The API stores it as an opaque blob; only the player interprets it.
 */
export interface SongSettings {
  masterVolume: number;
  playbackRate: number;
  loopEnabled: boolean;
  loopRegion: LoopRegion | null;
  tracks: Record<string, TrackMix>;
}

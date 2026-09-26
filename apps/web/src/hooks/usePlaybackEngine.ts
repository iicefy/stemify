import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PlaybackEngine } from "../audio/PlaybackEngine";
import type { PeakPyramid } from "../audio/waveform";
import { saveSongSettings, stemUrl, type SongSettings, type Stem } from "../api";

// How long to wait after the last change before saving, so dragging a slider
// doesn't fire a request per pixel.
const SAVE_DEBOUNCE_MS = 500;

export interface TrackState {
  muted: boolean;
  solo: boolean;
  volume: number; // 0..1
}

export interface LoopRegion {
  start: number; // seconds
  end: number; // seconds
}

export type TimeListener = (time: number) => void;
export type SubscribeTime = (listener: TimeListener) => () => void;

const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export function usePlaybackEngine(songId: string, stems: Stem[], settings: SongSettings | null) {
  const engineRef = useRef<PlaybackEngine | null>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [peaksByStem, setPeaksByStem] = useState<Map<string, PeakPyramid>>(new Map());
  const [trackStates, setTrackStates] = useState<Map<string, TrackState>>(new Map());
  const [masterVolume, setMasterVolumeState] = useState(1);
  const [playbackRate, setPlaybackRateState] = useState(1);
  const [loopRegion, setLoopRegionState] = useState<LoopRegion | null>(null);
  const [loopEnabled, setLoopEnabled] = useState(false);

  const stemsKey = stems.map((s) => s.id).join(",");

  // Mirrors, read inside effects below without needing to be in their
  // dependency arrays: the load effect is keyed only on [songId, stemsKey]
  // (settingsRef/stemsRef), and the save-on-unmount effect reads the latest
  // values at the moment it actually fires rather than a stale closure from
  // whenever the effect last ran (the other *Ref mirrors).
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const stemsRef = useRef(stems);
  stemsRef.current = stems;
  const trackStatesRef = useRef(trackStates);
  trackStatesRef.current = trackStates;
  const masterVolumeRef = useRef(masterVolume);
  masterVolumeRef.current = masterVolume;
  const playbackRateRef = useRef(playbackRate);
  playbackRateRef.current = playbackRate;
  const loopRegionRef = useRef(loopRegion);
  loopRegionRef.current = loopRegion;
  const loopEnabledRef = useRef(loopEnabled);
  loopEnabledRef.current = loopEnabled;

  // The playhead position changes every animation frame, so it deliberately
  // lives outside React state: components that show it (playhead, time
  // readout) subscribe and update their own DOM directly, instead of the
  // whole player re-rendering ~60 times a second.
  const timeRef = useRef(0);
  const timeListeners = useRef(new Set<TimeListener>());
  const durationRef = useRef(0);
  durationRef.current = duration;

  const emitTime = useCallback((time: number) => {
    timeRef.current = time;
    for (const listener of timeListeners.current) listener(time);
  }, []);

  const subscribeTime = useCallback<SubscribeTime>((listener) => {
    timeListeners.current.add(listener);
    listener(timeRef.current);
    return () => {
      timeListeners.current.delete(listener);
    };
  }, []);

  const getCurrentTime = useCallback(() => timeRef.current, []);

  // Load stems into the audio engine whenever the song or its stem list
  // changes (stems arrive asynchronously after the initial song fetch, so
  // this can't just depend on songId - that would capture an empty list).
  useEffect(() => {
    if (stems.length === 0) return;

    let cancelled = false;
    const engine = new PlaybackEngine();
    engineRef.current = engine;
    // The audio thread reports the end itself, so this still works when the
    // tab is in the background and animation frames aren't running.
    engine.onEnded = () => {
      setIsPlaying(false);
      emitTime(durationRef.current);
    };
    setReady(false);
    setLoadError(null);
    setLoopRegionState(null);
    setLoopEnabled(false);
    emitTime(0);

    engine
      .loadStems(stems.map((s) => ({ id: s.id, url: stemUrl(songId, s.id) })))
      .then(({ peaks, duration }) => {
        if (cancelled) return;
        setPeaksByStem(peaks);

        // Restore what was saved for this song, if anything - keyed by stem
        // *name*, since a retried song's stem ids are freshly generated.
        const saved = settingsRef.current;
        const initialStates = new Map<string, TrackState>();
        for (const s of stems) {
          const track = saved?.tracks?.[s.name];
          initialStates.set(
            s.id,
            track
              ? { muted: !!track.muted, solo: !!track.solo, volume: clamp(isFiniteNumber(track.volume) ? track.volume : 1, 0, 1) }
              : { muted: false, solo: false, volume: 1 }
          );
        }
        setTrackStates(initialStates);
        setMasterVolumeState(isFiniteNumber(saved?.masterVolume) ? clamp(saved.masterVolume, 0, 1.5) : 1);
        setPlaybackRateState(isFiniteNumber(saved?.playbackRate) ? clamp(saved.playbackRate, 0.5, 1.5) : 1);

        const region = saved?.loopRegion;
        if (region && isFiniteNumber(region.start) && isFiniteNumber(region.end) && region.start >= 0 && region.end > region.start && region.end <= duration) {
          setLoopRegionState(region);
          setLoopEnabled(!!saved.loopEnabled);
        }

        setDuration(duration);
        // The state set above will settle just before `ready` flips true;
        // the save-on-change effect below would otherwise see that as a
        // "change" and immediately re-save what was just loaded.
        justLoadedRef.current = true;
        setReady(true);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err));
      });

    return () => {
      cancelled = true;
      engine.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songId, stemsKey]);

  // Recompute effective gain (mute/solo/volume) for every track whenever
  // any track's state changes.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    const anySoloed = [...trackStates.values()].some((t) => t.solo);
    for (const [id, state] of trackStates) {
      const effective = anySoloed ? (state.solo ? state.volume : 0) : state.muted ? 0 : state.volume;
      engine.setGain(id, effective);
    }
  }, [trackStates]);

  // Also reapplied whenever a new engine finishes loading (not just when
  // their own control moves), since a freshly loaded song sets these from
  // its saved settings.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !ready) return;
    engine.setMasterGain(masterVolume);
  }, [masterVolume, ready]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !ready) return;
    engine.setTempo(playbackRate);
  }, [playbackRate, ready]);

  // The engine wraps the loop inside the audio callback (sample-accurate,
  // no seek), so it just needs to be told the current region.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !ready) return;
    engine.setLoop(loopEnabled && loopRegion ? loopRegion : null);
  }, [loopEnabled, loopRegion, ready]);

  // Set right before setReady(true) in the load effect above, so the save
  // effect below can tell "just restored from settings" apart from "the user
  // changed something" - both look like a state change from here.
  const justLoadedRef = useRef(false);
  const saveTimeoutRef = useRef<number | undefined>(undefined);

  const snapshotSettings = useCallback((): SongSettings => {
    const tracks: SongSettings["tracks"] = {};
    for (const stem of stemsRef.current) {
      const state = trackStatesRef.current.get(stem.id);
      if (state) tracks[stem.name] = { muted: state.muted, solo: state.solo, volume: state.volume };
    }
    return {
      masterVolume: masterVolumeRef.current,
      playbackRate: playbackRateRef.current,
      loopEnabled: loopEnabledRef.current,
      loopRegion: loopRegionRef.current,
      tracks,
    };
  }, []);

  // Save the mix, speed and loop for this song a moment after they settle -
  // "moment after" so dragging a volume slider doesn't fire a request per
  // pixel; on the next real change the pending save is replaced, not stacked.
  useEffect(() => {
    if (!ready) return;
    if (justLoadedRef.current) {
      justLoadedRef.current = false;
      return;
    }
    window.clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = window.setTimeout(() => {
      saveTimeoutRef.current = undefined;
      void saveSongSettings(songId, snapshotSettings()).catch(() => {
        // Best-effort: losing one save just means the next change retries it,
        // and worst case this song reopens with its previous settings.
      });
    }, SAVE_DEBOUNCE_MS);
  }, [trackStates, masterVolume, playbackRate, loopRegion, loopEnabled, ready, songId, snapshotSettings]);

  // Save immediately when leaving this song, rather than leaving a pending
  // change to a plain timer (which - unlike this cleanup - would still fire
  // even after leaving, just later, since it isn't tied to the component).
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current === undefined) return;
      window.clearTimeout(saveTimeoutRef.current);
      void saveSongSettings(songId, snapshotSettings()).catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songId]);

  // Poll the audio clock once per frame while playing and push it to the
  // time subscribers (no React state involved).
  useEffect(() => {
    if (!isPlaying) return;
    let raf: number;
    const tick = () => {
      const engine = engineRef.current;
      if (engine) {
        const t = engine.getCurrentTime();
        if (t >= duration) {
          engine.pause();
          setIsPlaying(false);
          emitTime(duration);
          return;
        }
        emitTime(t);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, duration, emitTime]);

  const controls = useMemo(
    () => ({
      togglePlay: () => {
        const engine = engineRef.current;
        if (!engine) return;
        if (engine.isPlaying()) {
          engine.pause();
          setIsPlaying(false);
        } else {
          void engine.play();
          setIsPlaying(true);
        }
      },
      stop: () => {
        const engine = engineRef.current;
        if (!engine) return;
        engine.pause();
        engine.seek(0);
        setIsPlaying(false);
        emitTime(0);
      },
      seek: (time: number) => {
        const engine = engineRef.current;
        if (!engine) return;
        const clamped = Math.min(Math.max(0, time), durationRef.current);
        engine.seek(clamped);
        emitTime(clamped);
      },
      toggleMute: (stemId: string) => {
        setTrackStates((prev) => {
          const next = new Map(prev);
          const s = next.get(stemId);
          if (s) next.set(stemId, { ...s, muted: !s.muted });
          return next;
        });
      },
      toggleSolo: (stemId: string) => {
        setTrackStates((prev) => {
          const next = new Map(prev);
          const s = next.get(stemId);
          if (s) next.set(stemId, { ...s, solo: !s.solo });
          return next;
        });
      },
      setVolume: (stemId: string, volume: number) => {
        setTrackStates((prev) => {
          const next = new Map(prev);
          const s = next.get(stemId);
          if (s) next.set(stemId, { ...s, volume });
          return next;
        });
      },
      setMasterVolume: (volume: number) => setMasterVolumeState(volume),
      setPlaybackRate: (rate: number) => setPlaybackRateState(rate),
      setLoopRegion: (region: LoopRegion) => {
        setLoopRegionState(region);
        setLoopEnabled(true);
      },
      clearLoop: () => {
        setLoopRegionState(null);
        setLoopEnabled(false);
      },
      toggleLoopEnabled: () => {
        setLoopEnabled((prev) => !prev);
      },
    }),
    [emitTime]
  );

  return {
    ready,
    loadError,
    duration,
    subscribeTime,
    getCurrentTime,
    isPlaying,
    peaksByStem,
    trackStates,
    masterVolume,
    playbackRate,
    loopRegion,
    loopEnabled,
    ...controls,
  };
}

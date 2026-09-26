import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PlaybackEngine } from "../../../audio/PlaybackEngine";
import type { PeakPyramid } from "../../../audio/waveform";
import { stemUrl, type LoopRegion, type SongSettings, type Stem, type TrackMix } from "../../../api";
import { clamp } from "../../../lib/math";
import { restoreSettings, type PlayerSettings } from "../songSettings";
import { useSettingsAutosave } from "./useSettingsAutosave";

export type { LoopRegion } from "../../../api";
export type TrackState = TrackMix;
export type TimeListener = (time: number) => void;
export type SubscribeTime = (listener: TimeListener) => () => void;

/** mute/solo/volume -> the gain each track actually plays at. */
function effectiveGains(trackStates: Map<string, TrackMix>): Map<string, number> {
  const anySoloed = [...trackStates.values()].some((t) => t.solo);
  const gains = new Map<string, number>();
  for (const [id, t] of trackStates) {
    gains.set(id, anySoloed ? (t.solo ? t.volume : 0) : t.muted ? 0 : t.volume);
  }
  return gains;
}

/**
 * React-facing wrapper around PlaybackEngine for one song: loads its stems,
 * holds the mixer/transport state, restores the song's saved settings and
 * saves changes back.
 */
export function usePlaybackEngine(songId: string, stems: Stem[], settings: SongSettings | null) {
  const engineRef = useRef<PlaybackEngine | null>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [peaksByStem, setPeaksByStem] = useState<Map<string, PeakPyramid>>(new Map());
  const [trackStates, setTrackStates] = useState<Map<string, TrackMix>>(new Map());
  const [masterVolume, setMasterVolume] = useState(1);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [loopRegion, setLoopRegionState] = useState<LoopRegion | null>(null);
  const [loopEnabled, setLoopEnabled] = useState(false);

  const stemsKey = stems.map((s) => s.id).join(",");
  // Read by the load effect, which deliberately re-runs only when the song
  // or its stem list changes - not when these object identities do.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const stemsRef = useRef(stems);
  stemsRef.current = stems;

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
    const stems = stemsRef.current;
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
        const restored = restoreSettings(settingsRef.current, stems, duration);
        setPeaksByStem(peaks);
        setTrackStates(restored.trackStates);
        setMasterVolume(restored.masterVolume);
        setPlaybackRate(restored.playbackRate);
        setLoopRegionState(restored.loopRegion);
        setLoopEnabled(restored.loopEnabled);
        setDuration(duration);
        setReady(true);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err));
      });

    return () => {
      cancelled = true;
      engine.dispose();
    };
  }, [songId, stemsKey, emitTime]);

  // Push state into the engine. Each also re-applies when a freshly loaded
  // engine becomes ready, since loading restores them from saved settings.
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    for (const [id, gain] of effectiveGains(trackStates)) engine.setGain(id, gain);
  }, [trackStates]);

  useEffect(() => {
    if (ready) engineRef.current?.setMasterGain(masterVolume);
  }, [masterVolume, ready]);

  useEffect(() => {
    if (ready) engineRef.current?.setTempo(playbackRate);
  }, [playbackRate, ready]);

  // The engine wraps the loop inside the audio callback (sample-accurate,
  // no seek), so it just needs to be told the current region.
  useEffect(() => {
    if (ready) engineRef.current?.setLoop(loopEnabled && loopRegion ? loopRegion : null);
  }, [loopEnabled, loopRegion, ready]);

  const playerSettings = useMemo<PlayerSettings | null>(
    () => (ready ? { trackStates, masterVolume, playbackRate, loopRegion, loopEnabled } : null),
    [ready, trackStates, masterVolume, playbackRate, loopRegion, loopEnabled]
  );
  useSettingsAutosave(songId, stems, playerSettings);

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

  const controls = useMemo(() => {
    const updateTrack = (stemId: string, update: (track: TrackMix) => TrackMix) =>
      setTrackStates((prev) => {
        const track = prev.get(stemId);
        if (!track) return prev;
        return new Map(prev).set(stemId, update(track));
      });

    return {
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
        const clamped = clamp(time, 0, durationRef.current);
        engine.seek(clamped);
        emitTime(clamped);
      },
      toggleMute: (stemId: string) => updateTrack(stemId, (t) => ({ ...t, muted: !t.muted })),
      toggleSolo: (stemId: string) => updateTrack(stemId, (t) => ({ ...t, solo: !t.solo })),
      setVolume: (stemId: string, volume: number) => updateTrack(stemId, (t) => ({ ...t, volume })),
      setMasterVolume,
      setPlaybackRate,
      setLoopRegion: (region: LoopRegion) => {
        setLoopRegionState(region);
        setLoopEnabled(true);
      },
      clearLoop: () => {
        setLoopRegionState(null);
        setLoopEnabled(false);
      },
      toggleLoopEnabled: () => setLoopEnabled((prev) => !prev),
    };
  }, [emitTime]);

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

export type PlaybackEngineApi = ReturnType<typeof usePlaybackEngine>;

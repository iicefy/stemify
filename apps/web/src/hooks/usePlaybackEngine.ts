import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PlaybackEngine } from "../audio/PlaybackEngine";
import { computePeaks } from "../audio/waveform";
import { stemUrl, type Stem } from "../api";

const PEAK_BUCKETS = 1200;

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

const yieldToMain = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

export function usePlaybackEngine(songId: string, stems: Stem[]) {
  const engineRef = useRef<PlaybackEngine | null>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [peaksByStem, setPeaksByStem] = useState<Map<string, Float32Array>>(new Map());
  const [trackStates, setTrackStates] = useState<Map<string, TrackState>>(new Map());
  const [masterVolume, setMasterVolumeState] = useState(1);
  const [playbackRate, setPlaybackRateState] = useState(1);
  const [loopRegion, setLoopRegionState] = useState<LoopRegion | null>(null);
  const [loopEnabled, setLoopEnabled] = useState(false);

  const stemsKey = stems.map((s) => s.id).join(",");

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
    setReady(false);
    setLoadError(null);
    setLoopRegionState(null);
    setLoopEnabled(false);
    emitTime(0);

    engine
      .loadStems(stems.map((s) => ({ id: s.id, url: stemUrl(songId, s.id) })))
      .then(async ({ buffers, duration }) => {
        if (cancelled) return;

        // Each stem is millions of samples; yielding between them keeps the
        // page responsive instead of freezing for the whole batch.
        const peaks = new Map<string, Float32Array>();
        for (const [id, buffer] of buffers) {
          peaks.set(id, computePeaks(buffer, PEAK_BUCKETS));
          await yieldToMain();
          if (cancelled) return;
        }
        setPeaksByStem(peaks);

        const initialStates = new Map<string, TrackState>();
        for (const s of stems) initialStates.set(s.id, { muted: false, solo: false, volume: 1 });
        setTrackStates(initialStates);

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

  // Master volume and playback rate are global (persist across song
  // changes), so they're reapplied whenever a new engine finishes loading,
  // not just when their own control moves.
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

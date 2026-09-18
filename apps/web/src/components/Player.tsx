import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSong, type SongDetail } from "../api";
import { usePlaybackEngine } from "../hooks/usePlaybackEngine";
import { trackColor } from "../trackColors";
import { TrackLane } from "./TrackLane";
import { TimelineRuler } from "./TimelineRuler";
import { ZoomScrollbar } from "./ZoomScrollbar";
import { ZoomControl, ZOOM_LEVELS } from "./ZoomControl";
import { Transport } from "./Transport";
import { MasterVolume } from "./MasterVolume";
import { SpeedControl } from "./SpeedControl";
import { LoopToggle } from "./LoopToggle";
import { TimelineOverlay, type TimelineOverlayHandle } from "./TimelineOverlay";

// Trackpad two-finger-scroll pan feels frantic at a literal 1:1 pixel
// mapping - this tones it down to a more deliberate speed.
const PAN_SENSITIVITY = 0.12;

export function Player({ songId, onBack }: { songId: string; onBack: () => void }) {
  const [song, setSong] = useState<SongDetail | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const overlayRef = useRef<TimelineOverlayHandle>(null);
  const handleHover = useCallback((fraction: number | null) => overlayRef.current?.setHover(fraction), []);
  // zoomIndex and viewStart change together (changing zoom recomputes the
  // pan offset to keep the view centered), so they're one piece of state
  // updated functionally - two separate useState calls would let rapid
  // clicks (each reading a stale closure of the other) fall out of sync,
  // e.g. clicking "zoom in" three times fast only zooming in once.
  const [view, setView] = useState({ zoomIndex: 0, viewStart: 0 });
  const { zoomIndex, viewStart } = view;

  useEffect(() => {
    getSong(songId)
      .then(setSong)
      .catch((err) => setFetchError(err instanceof Error ? err.message : String(err)));
  }, [songId]);

  const stems = song?.stems ?? [];
  const engine = usePlaybackEngine(songId, stems);

  // Fresh zoom/pan for every song rather than carrying over from whatever
  // was open before.
  useEffect(() => {
    setView({ zoomIndex: 0, viewStart: 0 });
  }, [songId]);

  const zoom = ZOOM_LEVELS[zoomIndex];
  const viewDuration = engine.duration > 0 ? engine.duration / zoom : 0;

  // Mirrors of the latest duration/view into refs, so the wheel listener
  // below (attached once) can always read current values without needing
  // to be re-attached every time they change.
  const durationRef = useRef(engine.duration);
  durationRef.current = engine.duration;
  const viewRef = useRef(view);
  viewRef.current = view;

  // Step relative to whatever zoomIndex is *queued*, not the value from
  // the last completed render - each caller reports a direction rather
  // than computing a target index itself, so rapid repeated clicks/wheel
  // ticks (which React batches before this component re-renders) still
  // accumulate correctly instead of all reading the same stale zoomIndex.
  // anchorFraction (0..1, where in the *current* view to hold steady) lets
  // wheel-zoom zoom toward the cursor instead of always the view center.
  // useCallback with an empty dep array (stable identity forever) is safe
  // here because these only ever read the *current* duration/view via refs
  // and update via setView's functional form - never a closed-over state
  // value. A stable identity lets TrackLane/TimelineRuler/ZoomScrollbar be
  // React.memo'd, which otherwise wouldn't help: memo only skips a re-render
  // when every prop (including callbacks) is reference-equal, and a plain
  // function re-created on every render would defeat that on its own.
  const stepZoom = useCallback((delta: number, anchorFraction = 0.5) => {
    setView((prev) => {
      const duration = durationRef.current;
      const clampedIndex = Math.min(ZOOM_LEVELS.length - 1, Math.max(0, prev.zoomIndex + delta));
      const oldViewDuration = duration > 0 ? duration / ZOOM_LEVELS[prev.zoomIndex] : 0;
      const newViewDuration = duration > 0 ? duration / ZOOM_LEVELS[clampedIndex] : 0;
      const anchorTime = prev.viewStart + anchorFraction * oldViewDuration;
      const maxStart = Math.max(0, duration - newViewDuration);
      return {
        zoomIndex: clampedIndex,
        viewStart: Math.min(maxStart, Math.max(0, anchorTime - anchorFraction * newViewDuration)),
      };
    });
  }, []);

  const handlePan = useCallback((newViewStart: number) => {
    setView((prev) => {
      const currentViewDuration =
        durationRef.current > 0 ? durationRef.current / ZOOM_LEVELS[prev.zoomIndex] : 0;
      const maxStart = Math.max(0, durationRef.current - currentViewDuration);
      return { ...prev, viewStart: Math.min(maxStart, Math.max(0, newViewStart)) };
    });
  }, []);

  const panBy = useCallback((deltaTime: number) => {
    setView((prev) => {
      const duration = durationRef.current;
      const vd = duration > 0 ? duration / ZOOM_LEVELS[prev.zoomIndex] : 0;
      const maxStart = Math.max(0, duration - vd);
      return { ...prev, viewStart: Math.min(maxStart, Math.max(0, prev.viewStart + deltaTime)) };
    });
  }, []);

  // Trackpad support: browsers report a pinch gesture as a wheel event
  // with ctrlKey set (this is true even though no actual Ctrl key is
  // involved - it's just how pinch-to-zoom arrives in the DOM), and a
  // horizontal two-finger swipe as a wheel event with a dominant deltaX.
  // Native wheel listeners are needed (not React's onWheel) because
  // preventDefault must actually stop the browser's own page-zoom/scroll,
  // which requires an explicitly non-passive listener.
  const dawMainRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = dawMainRef.current;
    if (!el) return;

    // Trackpads fire wheel events far faster than the screen refreshes;
    // accumulate them and apply once per frame so a gesture costs one
    // render + one waveform redraw per frame instead of one per event.
    let pendingZoom = 0;
    let pendingPan = 0;
    let anchorFraction = 0.5;
    let frame = 0;

    function flush() {
      frame = 0;
      if (pendingZoom !== 0) stepZoom(pendingZoom, anchorFraction);
      if (pendingPan !== 0) panBy(pendingPan);
      pendingZoom = 0;
      pendingPan = 0;
    }

    function handleWheel(e: WheelEvent) {
      const rulerRect = el!.querySelector(".ruler-track")?.getBoundingClientRect();

      if (e.ctrlKey) {
        e.preventDefault();
        anchorFraction = rulerRect
          ? Math.min(1, Math.max(0, (e.clientX - rulerRect.left) / rulerRect.width))
          : 0.5;
        pendingZoom += e.deltaY < 0 ? 1 : -1;
      } else if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && e.deltaX !== 0) {
        e.preventDefault();
        const width = rulerRect?.width || 1;
        const duration = durationRef.current;
        const currentViewDuration = duration > 0 ? duration / ZOOM_LEVELS[viewRef.current.zoomIndex] : 0;
        const pxPerSecond = width / (currentViewDuration || 1);
        // A raw 1:1 mapping panned across the entire visible window in
        // just a couple centimeters of trackpad travel - this scales it
        // down to something more controllable.
        pendingPan += (e.deltaX / pxPerSecond) * PAN_SENSITIVITY;
      } else {
        return;
      }
      if (!frame) frame = requestAnimationFrame(flush);
    }

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", handleWheel);
      if (frame) cancelAnimationFrame(frame);
    };
    // `.daw-main` only exists once engine.ready flips true (it's behind a
    // conditional render), so this must re-run then - an empty dep array
    // would attach to a still-null ref forever, since this effect's first
    // run happens before that element exists.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine.ready]);

  // Keep the playhead in view while zoomed in and playing - jump the
  // window forward (with a little lead-in room) as soon as it would
  // otherwise run off the right edge, rather than leaving the user
  // watching a playhead disappear off-screen.
  // Only while actually playing - otherwise this fights the user whenever
  // they zoom or pan to look at a section away from the playhead. Runs off
  // the time subscription (no re-render per frame); it only touches React
  // state on the rare frame the playhead actually leaves the window.
  const { subscribeTime, isPlaying } = engine;
  useEffect(() => {
    if (!isPlaying || zoom === 1 || engine.duration <= 0) return;
    const viewEnd = viewStart + viewDuration;
    const maxStart = Math.max(0, engine.duration - viewDuration);
    return subscribeTime((time) => {
      if (time < viewStart || time > viewEnd) {
        const lead = viewDuration * 0.1;
        setView((prev) => ({ ...prev, viewStart: Math.min(maxStart, Math.max(0, time - lead)) }));
      }
    });
  }, [isPlaying, zoom, viewDuration, viewStart, engine.duration, subscribeTime]);

  // The shortcut handler is attached once and reads the latest engine/stems
  // through refs, instead of being torn down and re-attached on every render.
  const engineRef = useRef(engine);
  engineRef.current = engine;
  const stemsRef = useRef(stems);
  stemsRef.current = stems;

  useEffect(() => {
    function isTypingTarget(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false;
      // Range sliders are <input> too - deliberately excluded along with
      // real text fields, since Left/Right/etc. already have a native
      // meaning on a focused slider that a global shortcut would collide
      // with.
      return (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      );
    }

    function onKeyDown(e: KeyboardEvent) {
      const engine = engineRef.current;
      // Checking the focused element (not e.target === document.body, the
      // previous check) so shortcuts keep working after clicking any
      // button - a button keeps focus after being clicked, which isn't
      // "typing" and shouldn't disable the rest of the shortcuts.
      if (isTypingTarget(document.activeElement)) return;

      if (e.code === "Space") {
        e.preventDefault();
        engine.togglePlay();
        return;
      }

      if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        engine.stop();
        return;
      }

      // Restart: jump back to 0 and keep going, unlike Stop (0 and pause)
      // - useful for immediately replaying a section you just heard.
      if (e.key === "r" || e.key === "R") {
        e.preventDefault();
        engine.seek(0);
        if (!engine.isPlaying) engine.togglePlay();
        return;
      }

      if (e.key === "l" || e.key === "L") {
        e.preventDefault();
        engine.toggleLoopEnabled();
        return;
      }

      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        const step = e.shiftKey ? 15 : 5;
        const delta = e.key === "ArrowLeft" ? -step : step;
        engine.seek(Math.min(engine.duration, Math.max(0, engine.getCurrentTime() + delta)));
        return;
      }

      if (e.key === "ArrowUp" || e.key === "+" || e.key === "=") {
        e.preventDefault();
        stepZoom(1);
        return;
      }

      if (e.key === "ArrowDown" || e.key === "-" || e.key === "_") {
        e.preventDefault();
        stepZoom(-1);
        return;
      }

      // Digit keys select a track by its row position (top to bottom);
      // checking e.code rather than e.key since Shift changes what
      // character a digit key produces (Shift+1 is "!" on a US layout),
      // but its *code* stays "Digit1" either way.
      const digitMatch = /^Digit([1-9])$/.exec(e.code);
      if (digitMatch) {
        const stem = stemsRef.current[Number(digitMatch[1]) - 1];
        if (stem) {
          e.preventDefault();
          if (e.shiftKey) engine.toggleSolo(stem.id);
          else engine.toggleMute(stem.id);
        }
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [stepZoom]);

  const anySoloed = useMemo(
    () => [...engine.trackStates.values()].some((t) => t.solo),
    [engine.trackStates]
  );
  const zoomIn = useCallback(() => stepZoom(1), [stepZoom]);
  const zoomOut = useCallback(() => stepZoom(-1), [stepZoom]);

  return (
    <div className="daw-fullscreen">
      <div className="daw-topbar">
        <div className="daw-topbar-zone daw-topbar-left">
          <button className="daw-back" onClick={onBack}>
            &larr; Library
          </button>
          <h2 className="daw-song-title">{song?.title ?? ""}</h2>
        </div>

        <div className="daw-topbar-zone daw-topbar-center">
          <Transport
            isPlaying={engine.isPlaying}
            duration={engine.duration}
            subscribeTime={engine.subscribeTime}
            onTogglePlay={engine.togglePlay}
            onStop={engine.stop}
          />
        </div>

        <div className="daw-topbar-zone daw-topbar-right">
          <SpeedControl rate={engine.playbackRate} onChange={engine.setPlaybackRate} />
          <ZoomControl
            zoomIndex={zoomIndex}
            onZoomIn={zoomIn}
            onZoomOut={zoomOut}
          />
          <LoopToggle
            enabled={engine.loopEnabled}
            hasRegion={!!engine.loopRegion}
            onToggle={engine.toggleLoopEnabled}
          />
          <span className="topbar-divider" />
          <MasterVolume volume={engine.masterVolume} onChange={engine.setMasterVolume} />
        </div>
      </div>

      {fetchError && <p className="error daw-message">{fetchError}</p>}
      {engine.loadError && <p className="error daw-message">{engine.loadError}</p>}
      {!fetchError && !song && <p className="daw-message">Loading…</p>}
      {song && !engine.ready && !engine.loadError && <p className="daw-message">Loading stems…</p>}

      {engine.ready && (
        <div className="daw-grid">
          <div className="daw-main" ref={dawMainRef}>
            <TimelineRuler
              viewStart={viewStart}
              viewDuration={viewDuration}
              loopRegion={engine.loopRegion}
              onSetLoopRegion={engine.setLoopRegion}
              onClearLoop={engine.clearLoop}
              onSeek={engine.seek}
            />

            <ZoomScrollbar
              duration={engine.duration}
              viewStart={viewStart}
              viewDuration={viewDuration}
              onPan={handlePan}
            />

            <div className="daw-tracks">
              {stems.map((stem, i) => {
                const state = engine.trackStates.get(stem.id);
                if (!state) return null;
                return (
                  <TrackLane
                    key={stem.id}
                    id={stem.id}
                    name={stem.name}
                    color={trackColor(stem.name)}
                    peaks={engine.peaksByStem.get(stem.id)}
                    duration={engine.duration}
                    viewStart={viewStart}
                    viewDuration={viewDuration}
                    striped={i % 2 === 1}
                    muted={state.muted}
                    solo={state.solo}
                    volume={state.volume}
                    dimmed={anySoloed && !state.solo}
                    onToggleMute={engine.toggleMute}
                    onToggleSolo={engine.toggleSolo}
                    onVolumeChange={engine.setVolume}
                    onSeek={engine.seek}
                    onHoverMove={handleHover}
                    onSetLoopRegion={engine.setLoopRegion}
                  />
                );
              })}
            </div>

            <TimelineOverlay
              ref={overlayRef}
              viewStart={viewStart}
              viewDuration={viewDuration}
              loopRegion={engine.loopRegion}
              loopEnabled={engine.loopEnabled}
              subscribeTime={engine.subscribeTime}
            />
          </div>
        </div>
      )}
    </div>
  );
}

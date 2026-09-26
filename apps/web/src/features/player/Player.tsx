import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSong, type SongDetail } from "../../api";
import { errorText } from "../../lib/errors";
import { usePlaybackEngine } from "./hooks/usePlaybackEngine";
import { usePlayerShortcuts } from "./hooks/usePlayerShortcuts";
import { useTimelineGestures } from "./hooks/useTimelineGestures";
import { useFollowPlayhead, useTimelineView } from "./hooks/useTimelineView";
import { LoopToggle } from "./LoopToggle";
import { MasterVolume } from "./MasterVolume";
import { TimelineSkeleton, TitleSkeleton, ToolbarSkeleton, TransportSkeleton } from "./PlayerSkeleton";
import { SpeedControl } from "./SpeedControl";
import { TimelineOverlay, type TimelineOverlayHandle } from "./TimelineOverlay";
import { TimelineRuler } from "./TimelineRuler";
import { trackColor } from "./trackColors";
import { TrackLane } from "./TrackLane";
import { Transport } from "./Transport";
import { ZoomControl } from "./ZoomControl";
import { ZoomScrollbar } from "./ZoomScrollbar";

const NO_STEMS: SongDetail["stems"] = [];

export function Player({ songId, onBack }: { songId: string; onBack: () => void }) {
  const [song, setSong] = useState<SongDetail | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    getSong(songId)
      .then(setSong)
      .catch((err) => setFetchError(errorText(err)));
  }, [songId]);

  const stems = song?.stems ?? NO_STEMS;
  const engine = usePlaybackEngine(songId, stems, song?.settings ?? null);
  const view = useTimelineView(songId, engine.duration);
  const { viewStart, viewDuration } = view;

  const timelineRef = useRef<HTMLDivElement>(null);
  useTimelineGestures({
    containerRef: timelineRef,
    enabled: engine.ready,
    duration: engine.duration,
    zoomIndex: view.zoomIndex,
    stepZoom: view.stepZoom,
    panBy: view.panBy,
  });
  useFollowPlayhead({
    isPlaying: engine.isPlaying,
    subscribeTime: engine.subscribeTime,
    zoom: view.zoom,
    viewStart,
    viewDuration,
    panTo: view.panTo,
  });
  usePlayerShortcuts(engine, stems, view.stepZoom);

  const overlayRef = useRef<TimelineOverlayHandle>(null);
  const handleHover = useCallback((fraction: number | null) => overlayRef.current?.setHover(fraction), []);
  const anySoloed = useMemo(() => [...engine.trackStates.values()].some((t) => t.solo), [engine.trackStates]);
  const error = fetchError ?? engine.loadError;

  return (
    <div className="daw-fullscreen">
      <div className="daw-topbar">
        <div className="daw-topbar-zone daw-topbar-left">
          <button className="daw-back" onClick={onBack}>
            &larr; Library
          </button>
          {song ? <h2 className="daw-song-title">{song.title}</h2> : <TitleSkeleton />}
        </div>

        <div className="daw-topbar-zone daw-topbar-center">
          {engine.ready ? (
            <Transport
              isPlaying={engine.isPlaying}
              duration={engine.duration}
              subscribeTime={engine.subscribeTime}
              onTogglePlay={engine.togglePlay}
              onStop={engine.stop}
            />
          ) : (
            <TransportSkeleton />
          )}
        </div>

        <div className="daw-topbar-zone daw-topbar-right">
          {engine.ready ? (
            <>
              <SpeedControl rate={engine.playbackRate} onChange={engine.setPlaybackRate} />
              <ZoomControl zoomIndex={view.zoomIndex} onZoomIn={view.zoomIn} onZoomOut={view.zoomOut} />
              <LoopToggle enabled={engine.loopEnabled} hasRegion={!!engine.loopRegion} onToggle={engine.toggleLoopEnabled} />
              <span className="topbar-divider" />
              <MasterVolume volume={engine.masterVolume} onChange={engine.setMasterVolume} />
            </>
          ) : (
            <ToolbarSkeleton />
          )}
        </div>
      </div>

      {error && <p className="error daw-message">{error}</p>}

      {!error && (
        <div className="daw-grid">
          {!engine.ready ? (
            <TimelineSkeleton stems={song ? stems : null} />
          ) : (
            <div className="daw-main" ref={timelineRef}>
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
                onPan={view.panTo}
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
          )}
        </div>
      )}
    </div>
  );
}

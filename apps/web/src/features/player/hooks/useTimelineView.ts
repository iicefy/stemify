import { useCallback, useEffect, useRef, useState } from "react";
import { clampViewStart, viewDurationAt, zoomView, ZOOM_LEVELS, type TimelineView } from "../zoom";
import type { SubscribeTime } from "./usePlaybackEngine";

const INITIAL_VIEW: TimelineView = { zoomIndex: 0, viewStart: 0 };

/**
 * Zoom level and scroll position of the timeline for one song.
 *
 * zoomIndex and viewStart change together (zooming recomputes the pan offset
 * to hold a point steady), so they're one piece of state updated
 * functionally: rapid zoom clicks or wheel ticks, batched before the next
 * render, each build on the queued state instead of a stale one.
 * The callbacks read the duration through a ref, so they keep a stable
 * identity forever - which lets the memoized lanes skip re-rendering.
 */
export function useTimelineView(songId: string, duration: number) {
  const [view, setView] = useState(INITIAL_VIEW);
  const durationRef = useRef(duration);
  durationRef.current = duration;

  // Fresh zoom/pan for every song rather than carrying over the last one.
  useEffect(() => setView(INITIAL_VIEW), [songId]);

  /** `anchorFraction` (0..1 across the window) stays put - e.g. the cursor for wheel zoom. */
  const stepZoom = useCallback((delta: number, anchorFraction = 0.5) => {
    setView((prev) => zoomView(prev, delta, anchorFraction, durationRef.current));
  }, []);

  const panTo = useCallback((viewStart: number) => {
    setView((prev) => ({ ...prev, viewStart: clampViewStart(viewStart, durationRef.current, prev.zoomIndex) }));
  }, []);

  const panBy = useCallback((deltaSeconds: number) => {
    setView((prev) => ({
      ...prev,
      viewStart: clampViewStart(prev.viewStart + deltaSeconds, durationRef.current, prev.zoomIndex),
    }));
  }, []);

  const zoomIn = useCallback(() => stepZoom(1), [stepZoom]);
  const zoomOut = useCallback(() => stepZoom(-1), [stepZoom]);

  return {
    zoomIndex: view.zoomIndex,
    zoom: ZOOM_LEVELS[view.zoomIndex],
    viewStart: view.viewStart,
    viewDuration: viewDurationAt(duration, view.zoomIndex),
    stepZoom,
    zoomIn,
    zoomOut,
    panTo,
    panBy,
  };
}

/**
 * Keeps the playhead in view while zoomed in and playing: once it would run
 * off the right edge, the window jumps forward (with a little lead-in room).
 * Only while playing - otherwise this would fight the user whenever they pan
 * away to look at another section. Runs off the time subscription, so it
 * only touches React state on the rare frame the playhead leaves the window.
 */
export function useFollowPlayhead({
  isPlaying,
  subscribeTime,
  zoom,
  viewStart,
  viewDuration,
  panTo,
}: {
  isPlaying: boolean;
  subscribeTime: SubscribeTime;
  zoom: number;
  viewStart: number;
  viewDuration: number;
  panTo: (viewStart: number) => void;
}): void {
  useEffect(() => {
    if (!isPlaying || zoom === 1 || viewDuration <= 0) return;
    const viewEnd = viewStart + viewDuration;
    return subscribeTime((time) => {
      if (time < viewStart || time > viewEnd) panTo(time - viewDuration * 0.1);
    });
  }, [isPlaying, subscribeTime, zoom, viewStart, viewDuration, panTo]);
}

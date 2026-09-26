import { clamp } from "../../../lib/math";

export const ZOOM_LEVELS = [1, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 32];

/** What part of the song the timeline shows. */
export interface TimelineView {
  zoomIndex: number;
  /** Seconds at the left edge. */
  viewStart: number;
}

/** Seconds visible at once at this zoom (0 until the duration is known). */
export function viewDurationAt(duration: number, zoomIndex: number): number {
  return duration > 0 ? duration / ZOOM_LEVELS[zoomIndex] : 0;
}

/** Keeps the window inside the song: never before 0, never past the end. */
export function clampViewStart(viewStart: number, duration: number, zoomIndex: number): number {
  return clamp(viewStart, 0, Math.max(0, duration - viewDurationAt(duration, zoomIndex)));
}

/**
 * Zooms `delta` levels, holding the point at `anchorFraction` (0..1 across
 * the current window) steady - the cursor for wheel zoom, the center otherwise.
 */
export function zoomView(view: TimelineView, delta: number, anchorFraction: number, duration: number): TimelineView {
  const zoomIndex = clamp(view.zoomIndex + delta, 0, ZOOM_LEVELS.length - 1);
  const anchorTime = view.viewStart + anchorFraction * viewDurationAt(duration, view.zoomIndex);
  const viewStart = anchorTime - anchorFraction * viewDurationAt(duration, zoomIndex);
  return { zoomIndex, viewStart: clampViewStart(viewStart, duration, zoomIndex) };
}

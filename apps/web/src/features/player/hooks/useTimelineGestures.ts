import { useEffect, useRef, type RefObject } from "react";
import { clamp } from "../../../lib/math";
import { viewDurationAt, ZOOM_LEVELS } from "../lib/zoom";

// Trackpad two-finger-scroll pan feels frantic at a literal 1:1 pixel
// mapping - this tones it down to a more deliberate speed.
const PAN_SENSITIVITY = 0.12;

// Wheel/pinch movement needed for one zoom step. Trackpad pinches emit dozens
// of tiny events per gesture; without a threshold every event jumped a whole
// level.
const ZOOM_WHEEL_STEP = 50;
// Leftover (sub-step) movement is forgotten after this long without input, so
// a stray nudge doesn't count toward the next gesture.
const ZOOM_ACCUM_RESET_MS = 250;

/**
 * Trackpad/wheel zoom and pan on the timeline. Browsers report a pinch as a
 * wheel event with ctrlKey set (no actual Ctrl key involved), and a
 * horizontal two-finger swipe as a wheel event with a dominant deltaX.
 *
 * A native listener is needed (not React's onWheel) because preventDefault
 * must really stop the browser's own page zoom/scroll, which requires a
 * non-passive listener. `enabled` re-attaches it once the element exists.
 */
export function useTimelineGestures({
  containerRef,
  enabled,
  duration,
  zoomIndex,
  stepZoom,
  panBy,
}: {
  containerRef: RefObject<HTMLElement>;
  enabled: boolean;
  duration: number;
  zoomIndex: number;
  stepZoom: (delta: number, anchorFraction: number) => void;
  panBy: (deltaSeconds: number) => void;
}): void {
  // Attached once per element; reads the latest values through this ref.
  const latest = useRef({ duration, zoomIndex, stepZoom, panBy });
  latest.current = { duration, zoomIndex, stepZoom, panBy };

  useEffect(() => {
    const el = containerRef.current;
    if (!enabled || !el) return;

    // Trackpads fire wheel events far faster than the screen refreshes;
    // accumulate them and apply once per frame so a gesture costs one
    // render + one waveform redraw per frame instead of one per event.
    let pendingZoom = 0;
    let zoomAccum = 0;
    let zoomAccumTimer = 0;
    let pendingPan = 0;
    let anchorFraction = 0.5;
    let frame = 0;

    function flush() {
      frame = 0;
      if (pendingZoom !== 0) latest.current.stepZoom(pendingZoom, anchorFraction);
      if (pendingPan !== 0) latest.current.panBy(pendingPan);
      pendingZoom = 0;
      pendingPan = 0;
    }

    function handleWheel(e: WheelEvent) {
      const rulerRect = el!.querySelector(".ruler-track")?.getBoundingClientRect();

      if (e.ctrlKey) {
        e.preventDefault();
        anchorFraction = rulerRect ? clamp((e.clientX - rulerRect.left) / rulerRect.width, 0, 1) : 0.5;
        // Accumulate scroll distance and convert to whole steps (pinch out /
        // scroll up zooms in).
        zoomAccum += -e.deltaY;
        const steps = Math.trunc(zoomAccum / ZOOM_WHEEL_STEP);
        zoomAccum -= steps * ZOOM_WHEEL_STEP;
        pendingZoom += steps;
        window.clearTimeout(zoomAccumTimer);
        zoomAccumTimer = window.setTimeout(() => (zoomAccum = 0), ZOOM_ACCUM_RESET_MS);
        if (steps === 0) return;
      } else if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && e.deltaX !== 0) {
        e.preventDefault();
        const { duration, zoomIndex } = latest.current;
        const width = rulerRect?.width || 1;
        const pxPerSecond = width / (viewDurationAt(duration, zoomIndex) || 1);
        // Screen-space speed would otherwise be the same at every zoom, which
        // crawls once zoomed in, so it speeds up with zoom (sqrt keeps low
        // zoom levels about the same).
        const zoomBoost = Math.sqrt(ZOOM_LEVELS[zoomIndex]);
        pendingPan += (e.deltaX / pxPerSecond) * PAN_SENSITIVITY * zoomBoost;
      } else {
        return;
      }
      if (!frame) frame = requestAnimationFrame(flush);
    }

    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", handleWheel);
      if (frame) cancelAnimationFrame(frame);
      window.clearTimeout(zoomAccumTimer);
    };
  }, [containerRef, enabled]);
}

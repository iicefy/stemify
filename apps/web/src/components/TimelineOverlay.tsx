import { forwardRef, memo, useImperativeHandle, useLayoutEffect, useRef } from "react";
import { formatTime } from "../formatTime";
import type { LoopRegion, SubscribeTime } from "../hooks/usePlaybackEngine";

export interface TimelineOverlayHandle {
  /** Fraction (0..1) of the visible window under the cursor, or null to hide. */
  setHover: (fraction: number | null) => void;
}

interface Props {
  viewStart: number;
  viewDuration: number;
  loopRegion: LoopRegion | null;
  loopEnabled: boolean;
  subscribeTime: SubscribeTime;
}

/**
 * Playhead, hover cursor and loop band drawn over the waveform area.
 *
 * The playhead and hover line move on every animation frame / mouse move, so
 * they're positioned imperatively with `transform` (compositor-only, no
 * layout, no React render) rather than through state. Each moving layer is
 * as wide as the overlay, so `translateX(N%)` maps a 0..1 fraction of the
 * visible window straight to pixels without measuring anything.
 */
export const TimelineOverlay = memo(
  forwardRef<TimelineOverlayHandle, Props>(function TimelineOverlay(
    { viewStart, viewDuration, loopRegion, loopEnabled, subscribeTime },
    ref
  ) {
    const playheadRef = useRef<HTMLDivElement>(null);
    const hoverRef = useRef<HTMLDivElement>(null);
    const tooltipRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef({ viewStart, viewDuration });
    viewRef.current = { viewStart, viewDuration };

    useImperativeHandle(ref, () => ({
      setHover(fraction) {
        const layer = hoverRef.current;
        const tooltip = tooltipRef.current;
        if (!layer || !tooltip) return;
        const { viewStart: start, viewDuration: span } = viewRef.current;
        if (fraction === null || span <= 0) {
          layer.style.visibility = "hidden";
          return;
        }
        layer.style.visibility = "visible";
        layer.style.transform = `translateX(${fraction * 100}%)`;
        const label = formatTime(start + fraction * span);
        if (tooltip.textContent !== label) tooltip.textContent = label;
      },
    }));

    // Re-subscribing when the view changes repositions the playhead
    // immediately (subscribe replays the current time), so pan/zoom needs no
    // extra handling.
    useLayoutEffect(() => {
      const el = playheadRef.current;
      if (!el) return;
      return subscribeTime((time) => {
        const fraction = viewDuration > 0 ? (time - viewStart) / viewDuration : -1;
        if (fraction < 0 || fraction > 1) {
          el.style.visibility = "hidden";
          return;
        }
        el.style.visibility = "visible";
        el.style.transform = `translateX(${fraction * 100}%)`;
      });
    }, [subscribeTime, viewStart, viewDuration]);

    return (
      <div className="daw-overlay">
        {loopRegion && viewDuration > 0 && (
          <div
            className={`loop-overlay ${loopEnabled ? "" : "loop-overlay-disabled"}`}
            style={{
              left: `${((loopRegion.start - viewStart) / viewDuration) * 100}%`,
              width: `${((loopRegion.end - loopRegion.start) / viewDuration) * 100}%`,
            }}
          />
        )}
        <div className="overlay-layer" ref={hoverRef} style={{ visibility: "hidden" }}>
          <div className="hover-line" />
          <div className="hover-tooltip" ref={tooltipRef} />
        </div>
        <div className="overlay-layer" ref={playheadRef} style={{ visibility: "hidden" }}>
          <div className="playhead" />
        </div>
      </div>
    );
  })
);

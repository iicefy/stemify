import { memo } from "react";
import { tickTimesInRange } from "./timelineTicks";
import { formatTime } from "../../lib/formatTime";
import { useLoopDrag } from "./hooks/useLoopDrag";
import type { LoopRegion } from "./hooks/usePlaybackEngine";

export const TimelineRuler = memo(function TimelineRuler({
  viewStart,
  viewDuration,
  loopRegion,
  onSetLoopRegion,
  onClearLoop,
  onSeek,
}: {
  viewStart: number;
  viewDuration: number;
  loopRegion: LoopRegion | null;
  onSetLoopRegion: (region: LoopRegion) => void;
  onClearLoop: () => void;
  onSeek: (time: number) => void;
}) {
  const ticks = tickTimesInRange(viewStart, viewDuration);
  const toTime = (fraction: number) => viewStart + fraction * viewDuration;
  const { containerRef, handleMouseDown, dragging, dragLeft, dragWidth } = useLoopDrag({
    onSelectRange: (a, b) => onSetLoopRegion({ start: toTime(a), end: toTime(b) }),
    onSeek: (fraction) => onSeek(toTime(fraction)),
  });

  return (
    <div className="track-row timeline-ruler">
      <div className="track-header" />
      <div className="track-waveform ruler-track" ref={containerRef} onMouseDown={handleMouseDown}>
        {ticks.map((t) => (
          <div
            key={t}
            className="ruler-tick"
            style={{ left: `${((t - viewStart) / viewDuration) * 100}%` }}
          >
            <span>{formatTime(t)}</span>
          </div>
        ))}

        {dragging && (
          <div
            className="loop-drag-preview"
            style={{ left: `${dragLeft * 100}%`, width: `${dragWidth * 100}%` }}
          />
        )}

        {!dragging && loopRegion && viewDuration > 0 && (
          <div
            className="ruler-loop-band"
            style={{
              left: `${((loopRegion.start - viewStart) / viewDuration) * 100}%`,
              width: `${((loopRegion.end - loopRegion.start) / viewDuration) * 100}%`,
            }}
          >
            <button
              className="ruler-loop-clear"
              onMouseDown={(e) => {
                // Without this, the mousedown bubbles up to the ruler's own
                // drag-to-create handler, which re-renders and swaps this
                // button out for the drag-preview overlay before the click
                // can land on it - so the button never actually fires.
                e.stopPropagation();
              }}
              onClick={(e) => {
                e.stopPropagation();
                onClearLoop();
              }}
              title="Clear loop"
            >
              &times;
            </button>
          </div>
        )}
      </div>
    </div>
  );
});

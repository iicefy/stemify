import { useRef } from "react";

/**
 * A thin "you are here" bar under the ruler, shown only while zoomed in:
 * the whole bar represents the full track, and the highlighted thumb is
 * the currently visible window - drag it to pan.
 */
export function ZoomScrollbar({
  duration,
  viewStart,
  viewDuration,
  onPan,
}: {
  duration: number;
  viewStart: number;
  viewDuration: number;
  onPan: (viewStart: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);

  function handleThumbMouseDown(e: React.MouseEvent) {
    const startClientX = e.clientX;
    const startViewStart = viewStart;
    const maxStart = Math.max(0, duration - viewDuration);

    function onMove(ev: MouseEvent) {
      const trackWidth = trackRef.current?.clientWidth || 1;
      const deltaTime = ((ev.clientX - startClientX) / trackWidth) * duration;
      onPan(Math.min(maxStart, Math.max(0, startViewStart + deltaTime)));
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  const left = duration > 0 ? (viewStart / duration) * 100 : 0;
  const width = duration > 0 ? (viewDuration / duration) * 100 : 100;

  return (
    <div className="track-row zoom-scrollbar-row">
      <div className="track-header" />
      <div className="track-waveform zoom-scrollbar-track" ref={trackRef}>
        <div
          className="zoom-scrollbar-thumb"
          style={{ left: `${left}%`, width: `${width}%` }}
          onMouseDown={handleThumbMouseDown}
        />
      </div>
    </div>
  );
}

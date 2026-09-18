import { memo, useEffect, useRef } from "react";
import { tickTimesInRange } from "../timelineTicks";
import { hexToRgba } from "../hexColor";
import { TrackIcon } from "./TrackIcon";
import { useLoopDrag } from "../hooks/useLoopDrag";
import type { LoopRegion } from "../hooks/usePlaybackEngine";

export const TrackLane = memo(function TrackLane({
  id,
  name,
  color,
  peaks,
  duration,
  viewStart,
  viewDuration,
  muted,
  solo,
  volume,
  dimmed,
  striped,
  onToggleMute,
  onToggleSolo,
  onVolumeChange,
  onSeek,
  onHoverMove,
  onSetLoopRegion,
}: {
  id: string;
  name: string;
  color: string;
  peaks: Float32Array | undefined;
  duration: number;
  viewStart: number;
  viewDuration: number;
  muted: boolean;
  solo: boolean;
  volume: number;
  dimmed: boolean;
  striped: boolean;
  onToggleMute: (id: string) => void;
  onToggleSolo: (id: string) => void;
  onVolumeChange: (id: string, v: number) => void;
  onSeek: (time: number) => void;
  onHoverMove: (fraction: number | null) => void;
  onSetLoopRegion: (region: LoopRegion) => void;
}) {
  const toTime = (fraction: number) => viewStart + fraction * viewDuration;
  const { containerRef, handleMouseDown, dragging, dragLeft, dragWidth } = useLoopDrag({
    onSelectRange: (a, b) => onSetLoopRegion({ start: toTime(a), end: toTime(b) }),
    onSeek: (fraction) => onSeek(toTime(fraction)),
  });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef<() => void>(() => {});

  // Re-created whenever what's drawn changes; the ResizeObserver below
  // always calls the latest one.
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!canvas || !container || !peaks || duration <= 0 || viewDuration <= 0) {
      drawRef.current = () => {};
      return;
    }

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = container.clientWidth;
      const height = container.clientHeight;
      const pixelWidth = Math.round(width * dpr);
      const pixelHeight = Math.round(height * dpr);
      // Assigning canvas.width/height reallocates the backing store and
      // clears it, so only touch them when the size really changed.
      if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
      if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      // Faint time gridlines matching the ruler ticks, so an empty or
      // near-silent lane still reads as an intentional canvas. One path,
      // one stroke.
      ctx.strokeStyle = "rgba(255, 255, 255, 0.04)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (const t of tickTimesInRange(viewStart, viewDuration)) {
        const x = Math.round(((t - viewStart) / viewDuration) * width) + 0.5;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      }
      ctx.stroke();

      const mid = height / 2;
      ctx.fillStyle = hexToRgba(color, dimmed ? 0.35 : 0.8);

      // Peaks span the whole track (0..duration); only draw the buckets
      // that fall within the current zoom/pan window, stretched to fill
      // the canvas. Batched into a single path / fill.
      const buckets = peaks.length / 2;
      const bucketDuration = duration / buckets;
      const pxPerSecond = width / viewDuration;
      const bucketWidthPx = Math.max(1, bucketDuration * pxPerSecond);
      const startIdx = Math.max(0, Math.floor(viewStart / bucketDuration));
      const endIdx = Math.min(buckets, Math.ceil((viewStart + viewDuration) / bucketDuration));

      ctx.beginPath();
      for (let i = startIdx; i < endIdx; i++) {
        const x = (i * bucketDuration - viewStart) * pxPerSecond;
        const y1 = mid - peaks[i * 2 + 1] * mid;
        const y2 = mid - peaks[i * 2] * mid;
        ctx.rect(x, y1, bucketWidthPx, Math.max(1.5, y2 - y1));
      }
      ctx.fill();
    };

    drawRef.current = draw;
    draw();
  }, [peaks, color, dimmed, duration, viewStart, viewDuration, containerRef]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() => drawRef.current());
    observer.observe(container);
    return () => observer.disconnect();
  }, [containerRef]);

  function fractionAt(clientX: number): number {
    const container = containerRef.current;
    if (!container) return 0;
    const rect = container.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  }

  return (
    <div className={`track-row ${dimmed ? "track-row-dimmed" : ""} ${striped ? "track-row-alt" : ""}`}>
      <div className="track-header">
        <div className="track-name-row">
          <span className="track-icon" style={{ color }}>
            <TrackIcon name={name} />
          </span>
          <span className="track-name">{name}</span>
        </div>
        <div className="track-controls-row">
          <div className="track-buttons">
            <button
              className={`track-btn track-btn-mute ${muted ? "active" : ""} ${
                dimmed && !muted ? "auto-muted" : ""
              }`}
              onClick={() => onToggleMute(id)}
              title={dimmed && !muted ? "Muted (another track is soloed)" : "Mute"}
            >
              M
            </button>
            <button
              className={`track-btn track-btn-solo ${solo ? "active" : ""}`}
              onClick={() => onToggleSolo(id)}
              title="Solo"
            >
              S
            </button>
          </div>
          <input
            className="track-volume"
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={volume}
            onChange={(e) => onVolumeChange(id, Number(e.target.value))}
            title="Volume"
          />
          <span className="track-volume-value">{Math.round(volume * 100)}</span>
        </div>
      </div>
      <div
        className="track-waveform"
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={(e) => onHoverMove(fractionAt(e.clientX))}
        onMouseLeave={() => onHoverMove(null)}
      >
        <canvas ref={canvasRef} />
        {dragging && (
          <div
            className="loop-drag-preview"
            style={{ left: `${dragLeft * 100}%`, width: `${dragWidth * 100}%` }}
          />
        )}
      </div>
    </div>
  );
});

import { useEffect, useRef } from "react";
import { tickTimesInRange } from "../timelineTicks";
import { hexToRgba } from "../hexColor";
import { TrackIcon } from "./TrackIcon";
import { useLoopDrag } from "../hooks/useLoopDrag";
import type { LoopRegion } from "../hooks/usePlaybackEngine";

export function TrackLane({
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
  onToggleMute: () => void;
  onToggleSolo: () => void;
  onVolumeChange: (v: number) => void;
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

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!canvas || !container || !peaks || duration <= 0 || viewDuration <= 0) return;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const width = container.clientWidth;
      const height = container.clientHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      // Faint time gridlines matching the ruler ticks, so an empty or
      // near-silent lane still reads as an intentional canvas.
      ctx.strokeStyle = "rgba(255, 255, 255, 0.04)";
      ctx.lineWidth = 1;
      for (const t of tickTimesInRange(viewStart, viewDuration)) {
        const x = Math.round(((t - viewStart) / viewDuration) * width) + 0.5;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }

      const mid = height / 2;
      ctx.fillStyle = hexToRgba(color, dimmed ? 0.35 : 0.8);

      // Peaks span the whole track (0..duration); only draw the buckets
      // that fall within the current zoom/pan window, stretched to fill
      // the canvas.
      const buckets = peaks.length / 2;
      const bucketDuration = duration / buckets;
      const pxPerSecond = width / viewDuration;
      const bucketWidthPx = Math.max(1, bucketDuration * pxPerSecond);
      const startIdx = Math.max(0, Math.floor(viewStart / bucketDuration));
      const endIdx = Math.min(buckets, Math.ceil((viewStart + viewDuration) / bucketDuration));

      for (let i = startIdx; i < endIdx; i++) {
        const tStart = i * bucketDuration;
        const x = (tStart - viewStart) * pxPerSecond;
        const min = peaks[i * 2];
        const max = peaks[i * 2 + 1];
        const y1 = mid - max * mid;
        const y2 = mid - min * mid;
        ctx.fillRect(x, y1, bucketWidthPx, Math.max(1.5, y2 - y1));
      }
    };

    draw();
    const observer = new ResizeObserver(draw);
    observer.observe(container);
    return () => observer.disconnect();
  }, [peaks, color, dimmed, duration, viewStart, viewDuration, containerRef]);

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
              onClick={onToggleMute}
              title={dimmed && !muted ? "Muted (another track is soloed)" : "Mute"}
            >
              M
            </button>
            <button
              className={`track-btn track-btn-solo ${solo ? "active" : ""}`}
              onClick={onToggleSolo}
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
            onChange={(e) => onVolumeChange(Number(e.target.value))}
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
}

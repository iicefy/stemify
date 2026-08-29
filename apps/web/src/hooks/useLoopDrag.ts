import { useRef, useState } from "react";

const DRAG_THRESHOLD = 0.005; // fraction of the visible width - below this, treat as a click not a drag

/**
 * Shared drag-to-select gesture, usable on any horizontal timeline surface
 * (the ruler, or a track's own waveform). A short mousedown+mouseup with
 * barely any movement is treated as a plain click (falls through to
 * onSeek); dragging past the threshold reports a [start, end] fraction of
 * *whatever's currently visible* - callers map that through the current
 * zoom/pan window to get absolute time, so this hook doesn't need to know
 * about zoom at all.
 */
export function useLoopDrag({
  onSelectRange,
  onSeek,
}: {
  onSelectRange: (startFraction: number, endFraction: number) => void;
  onSeek?: (fraction: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragStartFraction, setDragStartFraction] = useState<number | null>(null);
  const [dragEndFraction, setDragEndFraction] = useState<number | null>(null);

  function fractionAt(clientX: number): number {
    const el = containerRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  }

  function handleMouseDown(e: React.MouseEvent) {
    const startFraction = fractionAt(e.clientX);
    setDragStartFraction(startFraction);
    setDragEndFraction(startFraction);

    function onMove(ev: MouseEvent) {
      setDragEndFraction(fractionAt(ev.clientX));
    }
    function onUp(ev: MouseEvent) {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);

      const endFraction = fractionAt(ev.clientX);
      const a = Math.min(startFraction, endFraction);
      const b = Math.max(startFraction, endFraction);

      if (b - a > DRAG_THRESHOLD) {
        onSelectRange(a, b);
      } else {
        onSeek?.(startFraction);
      }

      setDragStartFraction(null);
      setDragEndFraction(null);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  const dragging = dragStartFraction !== null && dragEndFraction !== null;
  const dragLeft = dragging ? Math.min(dragStartFraction!, dragEndFraction!) : 0;
  const dragWidth = dragging ? Math.abs(dragEndFraction! - dragStartFraction!) : 0;

  return { containerRef, handleMouseDown, dragging, dragLeft, dragWidth };
}

import { ZOOM_LEVELS } from "../../lib/zoom";

export function ZoomControl({
  zoomIndex,
  onZoomIn,
  onZoomOut,
}: {
  zoomIndex: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
}) {
  const zoom = ZOOM_LEVELS[zoomIndex];

  return (
    <div className="zoom-control">
      <button className="zoom-btn" disabled={zoomIndex === 0} onClick={onZoomOut} title="Zoom out">
        &minus;
      </button>
      <span className="zoom-label">{zoom}x</span>
      <button
        className="zoom-btn"
        disabled={zoomIndex === ZOOM_LEVELS.length - 1}
        onClick={onZoomIn}
        title="Zoom in"
      >
        +
      </button>
    </div>
  );
}

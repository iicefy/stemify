import { PLAYBACK_RATE } from "./limits";

export function SpeedControl({
  rate,
  onChange,
}: {
  rate: number;
  onChange: (rate: number) => void;
}) {
  return (
    <div className="speed-control" title="Playback speed (pitch stays the same)">
      <input
        className="speed-slider"
        type="range"
        min={PLAYBACK_RATE.min}
        max={PLAYBACK_RATE.max}
        step={PLAYBACK_RATE.step}
        value={rate}
        onChange={(e) => onChange(Number(e.target.value))}
        onDoubleClick={() => onChange(1)}
        title="Double-click to reset to 1x"
      />
      <span className="speed-value">{rate.toFixed(2)}x</span>
    </div>
  );
}

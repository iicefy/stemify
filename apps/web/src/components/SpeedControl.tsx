const MIN_RATE = 0.5;
const MAX_RATE = 1.5;
const STEP = 0.05;

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
        min={MIN_RATE}
        max={MAX_RATE}
        step={STEP}
        value={rate}
        onChange={(e) => onChange(Number(e.target.value))}
        onDoubleClick={() => onChange(1)}
        title="Double-click to reset to 1x"
      />
      <span className="speed-value">{rate.toFixed(2)}x</span>
    </div>
  );
}

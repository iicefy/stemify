const PRESETS = [0.5, 0.75, 1, 1.25, 1.5];

export function SpeedControl({
  rate,
  onChange,
}: {
  rate: number;
  onChange: (rate: number) => void;
}) {
  return (
    <div className="speed-control" title="Playback speed (pitch stays the same)">
      {PRESETS.map((p) => (
        <button
          key={p}
          className={`speed-preset ${Math.abs(rate - p) < 0.001 ? "active" : ""}`}
          onClick={() => onChange(p)}
        >
          {p}x
        </button>
      ))}
    </div>
  );
}

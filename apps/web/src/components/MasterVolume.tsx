function SpeakerIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
      <path d="M2 6v4h2.5L8 12.5v-9L4.5 6H2z" />
      <path
        d="M10.5 5.5a3 3 0 0 1 0 5"
        stroke="currentColor"
        strokeWidth="1.3"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function MasterVolume({
  volume,
  onChange,
}: {
  volume: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="master-volume">
      <SpeakerIcon />
      <input
        className="master-volume-slider"
        type="range"
        min={0}
        max={1.5}
        step={0.01}
        value={volume}
        onChange={(e) => onChange(Number(e.target.value))}
        title="Master volume"
      />
      <span className="master-volume-value">{Math.round(volume * 100)}</span>
    </div>
  );
}

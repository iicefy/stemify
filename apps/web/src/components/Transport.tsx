import { formatTime } from "../formatTime";

function PlayIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
      <path d="M3 1.5v13l11-6.5-11-6.5z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
      <rect x="3" y="2" width="4" height="12" rx="0.5" />
      <rect x="9" y="2" width="4" height="12" rx="0.5" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
      <rect x="2" y="2" width="12" height="12" rx="1" />
    </svg>
  );
}

export function Transport({
  isPlaying,
  currentTime,
  duration,
  onTogglePlay,
  onStop,
}: {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  onTogglePlay: () => void;
  onStop: () => void;
}) {
  return (
    <div className="transport">
      <button className="transport-btn transport-stop" onClick={onStop} title="Stop">
        <StopIcon />
      </button>
      <button className="transport-btn transport-play" onClick={onTogglePlay} title="Play/Pause">
        {isPlaying ? <PauseIcon /> : <PlayIcon />}
      </button>
      <span className="transport-time">
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>
    </div>
  );
}

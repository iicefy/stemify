import { memo, useLayoutEffect, useRef } from "react";
import { formatTime } from "../formatTime";
import type { SubscribeTime } from "../hooks/usePlaybackEngine";

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

// Owns its own text node (React renders no children) so the per-frame clock
// updates are plain DOM writes, and only when the visible text changes.
function TimeReadout({ duration, subscribeTime }: { duration: number; subscribeTime: SubscribeTime }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const total = formatTime(duration);
    let last = "";
    return subscribeTime((time) => {
      const text = `${formatTime(time)} / ${total}`;
      if (text !== last) {
        last = text;
        el.textContent = text;
      }
    });
  }, [duration, subscribeTime]);
  return <span className="transport-time" ref={ref} />;
}

export const Transport = memo(function Transport({
  isPlaying,
  duration,
  subscribeTime,
  onTogglePlay,
  onStop,
}: {
  isPlaying: boolean;
  duration: number;
  subscribeTime: SubscribeTime;
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
      <TimeReadout duration={duration} subscribeTime={subscribeTime} />
    </div>
  );
});

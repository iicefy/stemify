import { memo, useLayoutEffect, useRef } from "react";
import { PauseIcon, PlayIcon, StopIcon } from "../../components/icons";
import { formatTime } from "../../lib/formatTime";
import type { SubscribeTime } from "./hooks/usePlaybackEngine";

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

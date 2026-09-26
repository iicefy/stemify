import { SpeakerIcon } from "../../components/icons";
import { MASTER_VOLUME } from "./limits";

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
        min={MASTER_VOLUME.min}
        max={MASTER_VOLUME.max}
        step={MASTER_VOLUME.step}
        value={volume}
        onChange={(e) => onChange(Number(e.target.value))}
        title="Master volume"
      />
      <span className="master-volume-value">{Math.round(volume * 100)}</span>
    </div>
  );
}

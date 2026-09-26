import { LoopIcon } from "../../components/icons";

export function LoopToggle({
  enabled,
  hasRegion,
  onToggle,
}: {
  enabled: boolean;
  hasRegion: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      className={`loop-toggle ${enabled ? "active" : ""}`}
      onClick={onToggle}
      disabled={!hasRegion}
      title={hasRegion ? "Toggle loop" : "Drag on the ruler to set a loop region"}
    >
      <LoopIcon />
      Loop
    </button>
  );
}

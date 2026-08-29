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
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
        <path d="M11 2l2.5 2.5L11 7" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M2.5 8V6a2 2 0 0 1 2-2h9" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5 14l-2.5-2.5L5 9" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M13.5 8v2a2 2 0 0 1-2 2h-9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Loop
    </button>
  );
}

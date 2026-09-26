// Small inline SVG icons. They inherit `color` (currentColor), so styling
// happens in CSS, not here.

export function NoteIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M6 11.5a2 2 0 1 1-1-1.73V3.2a.5.5 0 0 1 .4-.49l6-1.2a.5.5 0 0 1 .6.49V9.5a2 2 0 1 1-1-1.73V4.13l-5 1V11.5z" />
    </svg>
  );
}

export function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M11 2.5l2.5 2.5L5.5 13H3v-2.5L11 2.5z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path
        d="M3 4.5h10M6.5 4.5V3a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1.5M4.5 4.5v9a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1v-9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function UploadIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M12 16V4M12 4l-4 4M12 4l4 4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function PlayIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
      <path d="M3 1.5v13l11-6.5-11-6.5z" />
    </svg>
  );
}

export function PauseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
      <rect x="3" y="2" width="4" height="12" rx="0.5" />
      <rect x="9" y="2" width="4" height="12" rx="0.5" />
    </svg>
  );
}

export function StopIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
      <rect x="2" y="2" width="12" height="12" rx="1" />
    </svg>
  );
}

export function SpeakerIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
      <path d="M2 6v4h2.5L8 12.5v-9L4.5 6H2z" />
      <path d="M10.5 5.5a3 3 0 0 1 0 5" stroke="currentColor" strokeWidth="1.3" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function LoopIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M11 2l2.5 2.5L11 7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.5 8V6a2 2 0 0 1 2-2h9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 14l-2.5-2.5L5 9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.5 8v2a2 2 0 0 1-2 2h-9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

import type { ReactNode } from "react";

const ICONS: Record<string, ReactNode> = {
  drums: (
    <>
      <ellipse cx="8" cy="5" rx="6" ry="2.5" />
      <path d="M2 5v5c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V5" />
      <path d="M4.5 3 2.5 1M11.5 3l2-2" strokeLinecap="round" />
    </>
  ),
  bass: (
    <>
      <circle cx="4.2" cy="11.8" r="2.2" />
      <path d="M5.8 10.2 12 4M10.5 1.5l2 2M12.5 2 14 3.5" strokeLinecap="round" />
      <path d="M6.7 8.3 8.3 9.9" strokeLinecap="round" />
    </>
  ),
  guitar: (
    <>
      <circle cx="4.5" cy="11.5" r="3" />
      <path d="M6.6 9.4 13 3M11 1l2 2M12.5 1.5 14 3" strokeLinecap="round" />
      <path d="M3.2 10.2h2.6M3.2 11.5h2.6M3.2 12.8h2.6" strokeLinecap="round" opacity="0.6" />
    </>
  ),
  vocals: (
    <>
      <rect x="6" y="1.5" width="4" height="7" rx="2" />
      <path d="M3.5 7.5a4.5 4.5 0 0 0 9 0" strokeLinecap="round" />
      <path d="M8 12v2.5M5.5 14.5h5" strokeLinecap="round" />
    </>
  ),
  piano: (
    <>
      <rect x="1.5" y="3" width="13" height="10" rx="1" />
      <path d="M4.5 3v6M7.5 3v6M10.5 3v6" />
      <rect x="3" y="3" width="1.6" height="4" fill="currentColor" stroke="none" />
      <rect x="6" y="3" width="1.6" height="4" fill="currentColor" stroke="none" />
      <rect x="9" y="3" width="1.6" height="4" fill="currentColor" stroke="none" />
      <rect x="11.8" y="3" width="1.6" height="4" fill="currentColor" stroke="none" />
    </>
  ),
  other: (
    <>
      <circle cx="4.5" cy="12.5" r="2.2" />
      <path d="M6.6 12.5V2.5l6-1.2v9.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="10.6" cy="10.5" r="2.2" />
    </>
  ),
};

export function TrackIcon({ name }: { name: string }) {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinejoin="round"
    >
      {ICONS[name] ?? ICONS.other}
    </svg>
  );
}

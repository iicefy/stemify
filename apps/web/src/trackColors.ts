// Vivid, distinct hues so tracks are easy to tell apart at a glance while
// muting/soloing - guitar stays the warmest/brightest since it's the
// instrument this app is built around. Blue is deliberately excluded so
// no track color is confusable with the UI's own primary-blue accent
// (used for play/active/selected state).
const COLORS: Record<string, string> = {
  guitar: "#f5a623",
  drums: "#ef4444",
  bass: "#22b8a8",
  vocals: "#34d399",
  piano: "#a855f7",
  other: "#9ca3af",
};

export function trackColor(stemName: string): string {
  return COLORS[stemName] ?? "#9aa0a6";
}

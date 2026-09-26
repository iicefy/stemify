// Deterministic per-song accent color, derived from the song id, so each
// row gets a distinct identity at a glance (like auto-generated playlist
// covers) without needing real artwork.
const HUES = [4, 24, 45, 96, 158, 190, 217, 262, 291, 330];

export function songHue(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return HUES[hash % HUES.length];
}

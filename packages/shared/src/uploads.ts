/** Audio file types that can be uploaded (lowercase, with the dot). */
export const AUDIO_EXTENSIONS = [".mp3", ".wav", ".flac", ".m4a", ".ogg"] as const;

export const MAX_TITLE_LENGTH = 200;

export function isAudioFileName(name: string): boolean {
  const lower = name.toLowerCase();
  return AUDIO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

const ALLOWED_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"]);

/** Returns a clean https YouTube URL, or null. Anything else is rejected outright. */
export function parseYoutubeUrl(input: unknown): URL | null {
  if (typeof input !== "string") return null;
  try {
    const url = new URL(input.trim());
    return url.protocol === "https:" && ALLOWED_HOSTS.has(url.hostname) ? url : null;
  } catch {
    return null;
  }
}

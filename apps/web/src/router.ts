import { useSyncExternalStore } from "react";

/**
 * Hash-based routing: `#/` is the library, `#/song/<id>` a song's player.
 * The hash (not the path) so it works the same served by the API, by Vite,
 * or loaded in the desktop app - and needs no server-side routes. Reloading
 * keeps you on the same song, and the back button works.
 */
export type Route = { page: "library" } | { page: "song"; songId: string };

export function parseRoute(hash: string): Route {
  const match = /^#\/song\/([^/?#]+)\/?$/.exec(hash);
  if (match) {
    try {
      return { page: "song", songId: decodeURIComponent(match[1]) };
    } catch {
      // Malformed escape: fall through to the library.
    }
  }
  return { page: "library" };
}

export function routeToHash(route: Route): string {
  return route.page === "song" ? `#/song/${encodeURIComponent(route.songId)}` : "#/";
}

/** Adds a history entry, like following a link. */
export function navigate(route: Route): void {
  window.location.hash = routeToHash(route);
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

const getHash = () => window.location.hash;

export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, getHash);
  return parseRoute(hash);
}

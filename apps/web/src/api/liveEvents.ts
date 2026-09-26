import type { LibraryEvent } from "@musicapp/shared";
import { SONGS_BASE } from "./request";

/**
 * Live library updates (Server-Sent Events). The browser reconnects by itself
 * if the connection drops. `onConnect` fires on every (re)connection: events
 * sent before it - while disconnected, or before the stream first opened -
 * are never delivered, so the caller should refetch then.
 * Returns an unsubscribe function.
 */
export function subscribeToLibrary(onEvent: (event: LibraryEvent) => void, onConnect: () => void): () => void {
  const source = new EventSource(`${SONGS_BASE}/events`);
  source.onopen = onConnect;
  source.onmessage = (e: MessageEvent<string>) => {
    try {
      onEvent(JSON.parse(e.data) as LibraryEvent);
    } catch {
      // Ignore anything that isn't a LibraryEvent.
    }
  };
  return () => source.close();
}

import { useCallback, useEffect, useState } from "react";
import { listSongs, subscribeToLibrary, type Song } from "../../../api";
import { useToast } from "../../../components/ToastProvider";
import { errorText } from "../../../lib/errors";

/**
 * The song list, kept current by the API's live events (no polling), plus
 * each in-progress song's separation progress (0..1) by song id.
 */
export function useSongs() {
  const toast = useToast();
  const [songs, setSongs] = useState<Song[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [progress, setProgress] = useState<ReadonlyMap<string, number>>(new Map());

  /** `quiet` skips the error toast, for background refreshes. */
  const refresh = useCallback(
    async (quiet = false) => {
      try {
        const list = await listSongs();
        setSongs(list);
        setLoaded(true);
        // Forget progress for songs that are no longer separating.
        setProgress((prev) => {
          const processing = new Set(list.filter((s) => s.status === "processing").map((s) => s.id));
          const next = new Map([...prev].filter(([id]) => processing.has(id)));
          return next.size === prev.size ? prev : next;
        });
      } catch (err) {
        if (!quiet) toast.show(errorText(err), { kind: "error" });
      }
    },
    [toast]
  );

  useEffect(() => {
    void refresh();
    return subscribeToLibrary(
      (event) => {
        if (event.type === "changed") void refresh(true);
        else setProgress((prev) => new Map(prev).set(event.songId, event.progress));
      },
      () => void refresh(true)
    );
  }, [refresh]);

  return { songs, setSongs, loaded, refresh, progress };
}

import { useCallback, useEffect, useState } from "react";
import { listSongs, type Song } from "../../api";
import { useToast } from "../../components/ToastProvider";
import { errorText } from "../../lib/errors";
import { isBusy } from "./songStatus";

const POLL_INTERVAL_MS = 3000;

/** The song list: loaded on mount, then re-polled while anything is still in progress. */
export function useSongs() {
  const toast = useToast();
  const [songs, setSongs] = useState<Song[]>([]);
  const [loaded, setLoaded] = useState(false);

  /** `quiet` skips the error toast - a failing poll would otherwise pop one every few seconds. */
  const refresh = useCallback(
    async (quiet = false) => {
      try {
        setSongs(await listSongs());
        setLoaded(true);
      } catch (err) {
        if (!quiet) toast.show(errorText(err), { kind: "error" });
      }
    },
    [toast]
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const anyBusy = songs.some(isBusy);
  useEffect(() => {
    if (!anyBusy) return;
    const interval = window.setInterval(() => void refresh(true), POLL_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [anyBusy, refresh]);

  return { songs, setSongs, loaded, refresh };
}

import { useCallback, useMemo, useRef, useState } from "react";
import { deleteSong, renameSong, retrySong, type Song } from "../../api";
import { ConfirmDialog } from "../../components/ConfirmDialog";
import { UploadIcon } from "../../components/icons";
import { useToast } from "../../components/ToastProvider";
import { errorText } from "../../lib/errors";
import { Dropzone } from "./Dropzone";
import { EmptyState } from "./EmptyState";
import { LibrarySkeleton } from "./LibrarySkeleton";
import { filterAndSortSongs, loadSort, saveSort, SORT_KEYS, SORT_LABELS, type SortKey } from "./librarySort";
import { SongRow } from "./SongRow";
import { isBusy } from "./songStatus";
import { useSongs } from "./useSongs";
import { useUploads } from "./useUploads";
import { useWindowFileDrop } from "./useWindowFileDrop";
import { YoutubeForm } from "./YoutubeForm";

function deleteMessage(song: Song): string {
  if (isBusy(song)) {
    const doing = song.status === "downloading" ? "downloaded" : "separated";
    return `“${song.title}” is still being ${doing}. Deleting it stops that and removes it from your library.`;
  }
  return `This removes “${song.title}” and its separated tracks from your library. This can’t be undone.`;
}

export function Library({ onSelectSong }: { onSelectSong: (id: string) => void }) {
  const toast = useToast();
  const { songs, setSongs, loaded, refresh } = useSongs();
  const quietRefresh = useCallback(() => refresh(true), [refresh]);
  const { uploading, upload } = useUploads(quietRefresh);
  const dragActive = useWindowFileDrop(upload);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>(loadSort);
  const [pendingDelete, setPendingDelete] = useState<Song | null>(null);

  const visibleSongs = useMemo(() => filterAndSortSongs(songs, query, sort), [songs, query, sort]);
  const isSearching = query.trim().length > 0;

  function changeSort(next: SortKey) {
    setSort(next);
    saveSort(next);
  }

  const openSong = useCallback((song: Song) => onSelectSong(song.id), [onSelectSong]);

  const handleRename = useCallback(
    async (song: Song, title: string) => {
      // Optimistic: show the new name now, re-sync from the server if it fails.
      setSongs((prev) => prev.map((s) => (s.id === song.id ? { ...s, title } : s)));
      try {
        await renameSong(song.id, title);
      } catch (err) {
        toast.show(errorText(err), { kind: "error" });
        await refresh(true);
      }
    },
    [setSongs, refresh, toast]
  );

  const handleRetry = useCallback(
    async (song: Song) => {
      try {
        await retrySong(song.id);
        toast.show(`Retrying “${song.title}”…`, { kind: "info" });
      } catch (err) {
        toast.show(errorText(err), { kind: "error" });
      }
      await refresh(true);
    },
    [refresh, toast]
  );

  async function confirmDelete() {
    const song = pendingDelete;
    setPendingDelete(null);
    if (!song) return;
    try {
      await deleteSong(song.id);
      setSongs((prev) => prev.filter((s) => s.id !== song.id));
      toast.show(`Deleted “${song.title}”.`, { kind: "success" });
    } catch (err) {
      toast.show(errorText(err), { kind: "error" });
    } finally {
      void refresh(true);
    }
  }

  return (
    <div className="library">
      {dragActive && (
        <div className="drop-overlay" aria-hidden="true">
          <div className="drop-overlay-card">
            <UploadIcon size={36} />
            <p>Drop to add to your library</p>
          </div>
        </div>
      )}

      <Dropzone inputRef={fileInputRef} uploading={uploading} onFiles={upload} />
      <YoutubeForm onAdded={quietRefresh} />

      {!loaded && <LibrarySkeleton />}

      {loaded && songs.length === 0 && <EmptyState onChooseFile={() => fileInputRef.current?.click()} />}

      {loaded && songs.length > 0 && (
        <>
          <div className="library-toolbar">
            <p className="library-count">
              {isSearching
                ? `${visibleSongs.length} of ${songs.length} songs`
                : `${songs.length} song${songs.length === 1 ? "" : "s"}`}
            </p>
            <div className="library-controls">
              <input
                className="library-search"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && setQuery("")}
                placeholder="Search songs"
                spellCheck={false}
                aria-label="Search songs"
              />
              <select
                className="library-sort"
                value={sort}
                onChange={(e) => changeSort(e.target.value as SortKey)}
                aria-label="Sort songs"
              >
                {SORT_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {SORT_LABELS[key]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <ul className="song-list">
            {visibleSongs.map((song) => (
              <SongRow
                key={song.id}
                song={song}
                onOpen={openSong}
                onRename={handleRename}
                onRetry={handleRetry}
                onDelete={setPendingDelete}
              />
            ))}
            {visibleSongs.length === 0 && <li className="empty">No songs match “{query.trim()}”.</li>}
          </ul>
        </>
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Delete this song?"
          message={deleteMessage(pendingDelete)}
          confirmLabel="Delete"
          danger
          onConfirm={() => void confirmDelete()}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}

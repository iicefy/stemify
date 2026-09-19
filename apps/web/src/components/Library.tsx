import { useEffect, useMemo, useRef, useState } from "react";
import { deleteSong, importYoutube, listSongs, renameSong, retrySong, uploadSong, type Song } from "../api";
import { songHue } from "../songAvatar";
import { relativeTime } from "../relativeTime";
import { ConfirmDialog } from "./ConfirmDialog";
import { useToast } from "./ToastProvider";

const POLL_INTERVAL_MS = 3000;
const ACCEPTED_EXTENSIONS = [".mp3", ".wav", ".flac", ".m4a", ".ogg"];

const STATUS_LABEL: Record<Song["status"], string> = {
  downloading: "Downloading…",
  processing: "Separating…",
  ready: "Ready",
  failed: "Failed",
};

type SortKey = "newest" | "oldest" | "az" | "za";
const SORT_LABELS: Record<SortKey, string> = {
  newest: "Newest first",
  oldest: "Oldest first",
  az: "Name A–Z",
  za: "Name Z–A",
};
const SORT_STORAGE_KEY = "stemify.librarySort";

function loadSort(): SortKey {
  try {
    const saved = localStorage.getItem(SORT_STORAGE_KEY);
    if (saved && saved in SORT_LABELS) return saved as SortKey;
  } catch {
    // Storage can be unavailable; the default is fine.
  }
  return "newest";
}

function sortSongs(songs: Song[], sort: SortKey): Song[] {
  const byName = (a: Song, b: Song) => a.title.localeCompare(b.title, undefined, { sensitivity: "base", numeric: true });
  const sorted = [...songs];
  switch (sort) {
    case "newest":
      return sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    case "oldest":
      return sorted.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    case "az":
      return sorted.sort(byName);
    case "za":
      return sorted.sort((a, b) => byName(b, a));
  }
}

const isBusy = (song: Song) => song.status === "processing" || song.status === "downloading";
const firstLine = (text: string) => text.split(/\r?\n/)[0];
const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));

function NoteIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M6 11.5a2 2 0 1 1-1-1.73V3.2a.5.5 0 0 1 .4-.49l6-1.2a.5.5 0 0 1 .6.49V9.5a2 2 0 1 1-1-1.73V4.13l-5 1V11.5z" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M11 2.5l2.5 2.5L5.5 13H3v-2.5L11 2.5z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4">
      <path d="M3 4.5h10M6.5 4.5V3a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1.5M4.5 4.5v9a1 1 0 0 0 1 1h5a1 1 0 0 0 1-1v-9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function UploadIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
      <path d="M12 16V4M12 4l-4 4M12 4l4 4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function EmptyState({ onChooseFile }: { onChooseFile: () => void }) {
  return (
    <div className="empty-state">
      <h2 className="empty-title">Add your first song</h2>
      <p className="empty-lead">Split any song into instruments, then practice along with just the parts you want.</p>
      <ol className="empty-steps">
        <li>
          <span className="empty-step-number">1</span>
          <span>Drop an audio file anywhere in this window, or paste a YouTube link.</span>
        </li>
        <li>
          <span className="empty-step-number">2</span>
          <span>Stemify separates it into drums, bass, vocals, guitar, piano and other. It takes a minute or two.</span>
        </li>
        <li>
          <span className="empty-step-number">3</span>
          <span>Open it to mute or solo tracks, loop a section, and slow it down without changing the pitch.</span>
        </li>
      </ol>
      <button className="btn btn-primary" onClick={onChooseFile}>
        Choose a file
      </button>
    </div>
  );
}

function SkeletonRows() {
  return (
    <ul className="song-list" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <li key={i} className="song-row song-row-skeleton">
          <span className="song-avatar skeleton" />
          <div className="song-info">
            <span className="skeleton skeleton-line" style={{ width: `${70 - i * 12}%` }} />
            <span className="skeleton skeleton-line skeleton-line-short" />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function Library({ onSelectSong }: { onSelectSong: (id: string) => void }) {
  const toast = useToast();
  const [songs, setSongs] = useState<Song[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [addingYoutube, setAddingYoutube] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>(loadSort);
  const [pendingDelete, setPendingDelete] = useState<Song | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  // Escape and Enter both end a rename by blurring the input; this tells the
  // blur handler whether to save or discard.
  const cancelEdit = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function refresh(quiet = false) {
    try {
      setSongs(await listSongs());
      setLoaded(true);
    } catch (err) {
      // Polling failures would otherwise pop a toast every few seconds.
      if (!quiet) toast.show(errorText(err), { kind: "error" });
    }
  }

  useEffect(() => {
    void refresh();
    const interval = setInterval(() => {
      if (songs.some(isBusy)) void refresh(true);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songs.map((s) => s.status).join(",")]);

  async function handleFiles(files: File[]) {
    const supported = files.filter((f) => ACCEPTED_EXTENSIONS.some((ext) => f.name.toLowerCase().endsWith(ext)));
    for (const file of files) {
      if (!supported.includes(file)) {
        toast.show(`“${file.name}” isn’t a supported audio file (MP3, WAV, FLAC, M4A or OGG).`, { kind: "error" });
      }
    }
    if (supported.length === 0) return;

    setUploading(true);
    try {
      for (const file of supported) {
        try {
          const song = await uploadSong(file);
          toast.show(`Added “${song.title}”. Separating it now.`, { kind: "success" });
          await refresh(true);
        } catch (err) {
          toast.show(`Couldn’t upload “${file.name}”: ${errorText(err)}`, { kind: "error" });
        }
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // Dropping a file anywhere on the page works, not only on the drop box.
  // Kept in a ref so the window listeners (attached once) always call the
  // latest version.
  const handleFilesRef = useRef(handleFiles);
  handleFilesRef.current = handleFiles;
  useEffect(() => {
    let depth = 0; // dragenter/dragleave also fire for every child element
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types?.includes("Files") ?? false;
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth++;
      setDragActive(true);
    };
    const onOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDragActive(false);
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setDragActive(false);
      const files = Array.from(e.dataTransfer?.files ?? []);
      if (files.length > 0) void handleFilesRef.current(files);
    };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, []);

  async function handleYoutube(e: React.FormEvent) {
    e.preventDefault();
    const url = youtubeUrl.trim();
    if (!url) return;
    setAddingYoutube(true);
    try {
      await importYoutube(url);
      setYoutubeUrl("");
      toast.show("Link added. Downloading it now.", { kind: "success" });
      await refresh(true);
    } catch (err) {
      toast.show(errorText(err), { kind: "error" });
    } finally {
      setAddingYoutube(false);
    }
  }

  function changeSort(next: SortKey) {
    setSort(next);
    try {
      localStorage.setItem(SORT_STORAGE_KEY, next);
    } catch {
      // Not critical.
    }
  }

  function startRename(song: Song, e: React.MouseEvent) {
    e.stopPropagation();
    cancelEdit.current = false;
    setEditValue(song.title);
    setEditingId(song.id);
  }

  async function commitRename(song: Song) {
    const title = editValue.trim();
    const discard = cancelEdit.current;
    cancelEdit.current = false;
    setEditingId(null);
    if (discard || title.length === 0 || title === song.title) return;

    setSongs((prev) => prev.map((s) => (s.id === song.id ? { ...s, title } : s)));
    try {
      await renameSong(song.id, title);
    } catch (err) {
      toast.show(errorText(err), { kind: "error" });
      await refresh(true);
    }
  }

  async function handleRetry(song: Song, e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await retrySong(song.id);
      toast.show(`Retrying “${song.title}”…`, { kind: "info" });
    } catch (err) {
      toast.show(errorText(err), { kind: "error" });
    }
    await refresh(true);
  }

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

  const needle = query.trim().toLowerCase();
  const isSearching = needle.length > 0;
  const visibleSongs = useMemo(() => {
    const matching = isSearching ? songs.filter((s) => s.title.toLowerCase().includes(needle)) : songs;
    return sortSongs(matching, sort);
  }, [songs, needle, isSearching, sort]);

  const deleteMessage = pendingDelete
    ? isBusy(pendingDelete)
      ? `“${pendingDelete.title}” is still being ${pendingDelete.status === "downloading" ? "downloaded" : "separated"}. Deleting it stops that and removes it from your library.`
      : `This removes “${pendingDelete.title}” and its separated tracks from your library. This can’t be undone.`
    : "";

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

      <div
        className="dropzone"
        role="button"
        tabIndex={0}
        aria-label="Add songs: drop audio files or press Enter to browse"
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPTED_EXTENSIONS.join(",")}
          className="dropzone-input"
          tabIndex={-1}
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length > 0) void handleFiles(files);
          }}
        />
        <UploadIcon size={28} />
        <p className="dropzone-title">{uploading ? "Uploading…" : "Drop songs here, or click to browse"}</p>
        <p className="dropzone-sub">MP3, WAV, FLAC, M4A, OGG</p>
      </div>

      <form className="youtube-form" onSubmit={handleYoutube}>
        <input
          className="youtube-input"
          type="url"
          value={youtubeUrl}
          onChange={(e) => setYoutubeUrl(e.target.value)}
          placeholder="…or paste a YouTube link"
          spellCheck={false}
          aria-label="YouTube link"
        />
        <button className="btn btn-primary" type="submit" disabled={addingYoutube || !youtubeUrl.trim()}>
          {addingYoutube ? "Adding…" : "Add"}
        </button>
      </form>

      {!loaded && <SkeletonRows />}

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
                {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                  <option key={key} value={key}>
                    {SORT_LABELS[key]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <ul className="song-list">
            {visibleSongs.map((song) => (
              <li
                key={song.id}
                className={`song-row ${song.status === "ready" ? "song-row-clickable" : ""}`}
                onClick={() => song.status === "ready" && onSelectSong(song.id)}
              >
                <span className="song-avatar" style={{ background: `hsl(${songHue(song.id)} 32% 28%)` }}>
                  <NoteIcon />
                </span>

                <div className="song-info">
                  {editingId === song.id ? (
                    <input
                      className="song-title-input"
                      value={editValue}
                      autoFocus
                      maxLength={200}
                      aria-label="Song name"
                      onFocus={(e) => e.currentTarget.select()}
                      onChange={(e) => setEditValue(e.target.value)}
                      onClick={(e) => e.stopPropagation()}
                      onBlur={() => void commitRename(song)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.currentTarget.blur();
                        if (e.key === "Escape") {
                          cancelEdit.current = true;
                          e.currentTarget.blur();
                        }
                      }}
                    />
                  ) : (
                    <span className="song-title">{song.title}</span>
                  )}
                  <span className="song-meta">
                    {relativeTime(song.createdAt)}
                    {song.status === "failed" && song.errorMessage && (
                      <>
                        {" · "}
                        <span className="song-error" title={song.errorMessage}>
                          {firstLine(song.errorMessage)}
                        </span>
                      </>
                    )}
                  </span>
                </div>

                <span className={`status-badge status-${song.status}`}>
                  <span className={isBusy(song) ? "status-spinner" : "status-dot"} />
                  {STATUS_LABEL[song.status]}
                </span>

                {song.status === "failed" && (
                  <button className="btn btn-small" onClick={(e) => handleRetry(song, e)}>
                    Retry
                  </button>
                )}

                <button className="icon-btn" onClick={(e) => startRename(song, e)} title="Rename" aria-label={`Rename ${song.title}`}>
                  <PencilIcon />
                </button>

                <button
                  className="icon-btn icon-btn-danger"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPendingDelete(song);
                  }}
                  title="Delete"
                  aria-label={`Delete ${song.title}`}
                >
                  <TrashIcon />
                </button>
              </li>
            ))}
            {visibleSongs.length === 0 && <li className="empty">No songs match “{query.trim()}”.</li>}
          </ul>
        </>
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="Delete this song?"
          message={deleteMessage}
          confirmLabel="Delete"
          danger
          onConfirm={() => void confirmDelete()}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}

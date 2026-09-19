import { useEffect, useRef, useState } from "react";
import { deleteSong, importYoutube, listSongs, renameSong, uploadSong, type Song } from "../api";
import { songHue } from "../songAvatar";
import { relativeTime } from "../relativeTime";

const POLL_INTERVAL_MS = 3000;
const ACCEPTED_EXTENSIONS = [".mp3", ".wav", ".flac", ".m4a", ".ogg"];

const STATUS_LABEL: Record<Song["status"], string> = {
  downloading: "Downloading…",
  processing: "Separating…",
  ready: "Ready",
  failed: "Failed",
};

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

export function Library({
  onSelectSong,
}: {
  onSelectSong: (id: string) => void;
}) {
  const [songs, setSongs] = useState<Song[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [addingYoutube, setAddingYoutube] = useState(false);
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  // Escape and Enter both end an edit by blurring the input; this tells the
  // blur handler whether to save or throw the edit away.
  const cancelEdit = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    try {
      setSongs(await listSongs());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  useEffect(() => {
    refresh();
    const hasProcessing = () => songs.some((s) => s.status === "processing" || s.status === "downloading");
    const interval = setInterval(() => {
      if (hasProcessing()) refresh();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songs.map((s) => s.status).join(",")]);

  async function handleFile(file: File) {
    setError(null);
    setUploading(true);
    try {
      await uploadSong(file);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleYoutube(e: React.FormEvent) {
    e.preventDefault();
    const url = youtubeUrl.trim();
    if (!url) return;
    setError(null);
    setAddingYoutube(true);
    try {
      await importYoutube(url);
      setYoutubeUrl("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAddingYoutube(false);
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
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

    // Show the new name immediately; the server call follows.
    setSongs((prev) => prev.map((s) => (s.id === song.id ? { ...s, title } : s)));
    try {
      await renameSong(song.id, title);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      await refresh();
    }
  }

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    await deleteSong(id);
    await refresh();
  }

  const needle = query.trim().toLowerCase();
  const isSearching = needle.length > 0;
  const visibleSongs = isSearching ? songs.filter((s) => s.title.toLowerCase().includes(needle)) : songs;

  return (
    <div className="library">
      <div
        className={`dropzone ${dragActive ? "dropzone-active" : ""}`}
        onClick={() => fileInputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_EXTENSIONS.join(",")}
          className="dropzone-input"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M12 16V4M12 4l-4 4M12 4l4 4" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <p className="dropzone-title">{uploading ? "Uploading…" : "Drop a song here, or click to browse"}</p>
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
        <button className="youtube-add" type="submit" disabled={addingYoutube || !youtubeUrl.trim()}>
          {addingYoutube ? "Adding…" : "Add"}
        </button>
      </form>

      {error && <p className="error">{error}</p>}

      {songs.length > 0 && (
        <div className="library-toolbar">
          <p className="library-count">
            {isSearching
              ? `${visibleSongs.length} of ${songs.length} songs`
              : `${songs.length} song${songs.length === 1 ? "" : "s"}`}
          </p>
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
        </div>
      )}

      <ul className="song-list">
        {visibleSongs.map((song) => {
          const hue = songHue(song.id);
          return (
            <li
              key={song.id}
              className={`song-row ${song.status === "ready" ? "song-row-clickable" : ""}`}
              onClick={() => song.status === "ready" && onSelectSong(song.id)}
            >
              <span
                className="song-avatar"
                style={{ background: `hsl(${hue} 32% 28%)` }}
              >
                <NoteIcon />
              </span>

              <div className="song-info">
                {editingId === song.id ? (
                  <input
                    className="song-title-input"
                    value={editValue}
                    autoFocus
                    maxLength={200}
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
                <span className="song-meta">{relativeTime(song.createdAt)}</span>
              </div>

              <span className={`status-badge status-${song.status}`}>
                <span
                  className={song.status === "processing" || song.status === "downloading" ? "status-spinner" : "status-dot"}
                />
                {STATUS_LABEL[song.status]}
              </span>

              <button className="song-rename" onClick={(e) => startRename(song, e)} title="Rename">
                <PencilIcon />
              </button>

              <button className="song-delete" onClick={(e) => handleDelete(song.id, e)} title="Delete">
                <TrashIcon />
              </button>
            </li>
          );
        })}
        {songs.length === 0 && <li className="empty">No songs yet — drop one above to get started.</li>}
        {songs.length > 0 && visibleSongs.length === 0 && (
          <li className="empty">No songs match “{query.trim()}”.</li>
        )}
      </ul>
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { deleteSong, importYoutube, listSongs, uploadSong, type Song } from "../api";
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

  async function handleDelete(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    await deleteSong(id);
    await refresh();
  }

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

      {songs.length > 0 && <p className="library-count">{songs.length} song{songs.length === 1 ? "" : "s"}</p>}

      <ul className="song-list">
        {songs.map((song) => {
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
                <span className="song-title">{song.title}</span>
                <span className="song-meta">{relativeTime(song.createdAt)}</span>
              </div>

              <span className={`status-badge status-${song.status}`}>
                <span
                  className={song.status === "processing" || song.status === "downloading" ? "status-spinner" : "status-dot"}
                />
                {STATUS_LABEL[song.status]}
              </span>

              <button className="song-delete" onClick={(e) => handleDelete(song.id, e)} title="Delete">
                <TrashIcon />
              </button>
            </li>
          );
        })}
        {songs.length === 0 && <li className="empty">No songs yet — drop one above to get started.</li>}
      </ul>
    </div>
  );
}

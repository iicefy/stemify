import { memo, useRef, useState, type MouseEvent } from "react";
import { MAX_TITLE_LENGTH } from "@musicapp/shared";
import type { Song } from "../../api";
import { NoteIcon, PencilIcon, TrashIcon } from "../../components/icons";
import { relativeTime } from "../../lib/relativeTime";
import { songHue } from "./songAvatar";
import { isBusy, STATUS_LABEL } from "./songStatus";

const firstLine = (text: string) => text.split(/\r?\n/)[0];

// The row itself opens the song, so its buttons must not also trigger that.
const stop = (handler: () => void) => (e: MouseEvent) => {
  e.stopPropagation();
  handler();
};

export const SongRow = memo(function SongRow({
  song,
  progress,
  onOpen,
  onRename,
  onRetry,
  onDelete,
}: {
  song: Song;
  /** 0..1 while separating, once the worker has reported any. */
  progress: number | undefined;
  onOpen: (song: Song) => void;
  onRename: (song: Song, title: string) => void;
  onRetry: (song: Song) => void;
  onDelete: (song: Song) => void;
}) {
  const [editValue, setEditValue] = useState<string | null>(null);
  // Escape and Enter both end a rename by blurring the input; this tells the
  // blur handler whether to save or discard.
  const cancelEdit = useRef(false);
  const ready = song.status === "ready";

  function startRename() {
    cancelEdit.current = false;
    setEditValue(song.title);
  }

  function finishRename() {
    const title = (editValue ?? "").trim();
    const discard = cancelEdit.current;
    cancelEdit.current = false;
    setEditValue(null);
    if (!discard && title.length > 0 && title !== song.title) onRename(song, title);
  }

  return (
    <li className={`song-row ${ready ? "song-row-clickable" : ""}`} onClick={() => ready && onOpen(song)}>
      <span className="song-avatar" style={{ background: `hsl(${songHue(song.id)} 32% 28%)` }}>
        <NoteIcon />
      </span>

      <div className="song-info">
        {editValue !== null ? (
          <input
            className="song-title-input"
            value={editValue}
            autoFocus
            maxLength={MAX_TITLE_LENGTH}
            aria-label="Song name"
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => setEditValue(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onBlur={finishRename}
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
        {song.status === "processing" && progress !== undefined && ` ${Math.round(progress * 100)}%`}
      </span>

      {song.status === "failed" && (
        <button className="btn btn-small" onClick={stop(() => onRetry(song))}>
          Retry
        </button>
      )}

      <button className="icon-btn" onClick={stop(startRename)} title="Rename" aria-label={`Rename ${song.title}`}>
        <PencilIcon />
      </button>

      <button
        className="icon-btn icon-btn-danger"
        onClick={stop(() => onDelete(song))}
        title="Delete"
        aria-label={`Delete ${song.title}`}
      >
        <TrashIcon />
      </button>
    </li>
  );
});

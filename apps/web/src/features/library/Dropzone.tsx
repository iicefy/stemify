import type { RefObject } from "react";
import { AUDIO_EXTENSIONS } from "@musicapp/shared";
import { UploadIcon } from "../../components/icons";

/**
 * Click (or Enter/Space) to browse for files. Dropping works anywhere in the
 * window (see useWindowFileDrop), so this box only needs to handle browsing.
 * `inputRef` is the hidden file input, so other buttons can open it too.
 */
export function Dropzone({
  inputRef,
  uploading,
  onFiles,
}: {
  inputRef: RefObject<HTMLInputElement>;
  uploading: boolean;
  onFiles: (files: File[]) => void;
}) {
  const browse = () => inputRef.current?.click();

  return (
    <div
      className="dropzone"
      role="button"
      tabIndex={0}
      aria-label="Add songs: drop audio files or press Enter to browse"
      onClick={browse}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          browse();
        }
      }}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={AUDIO_EXTENSIONS.join(",")}
        className="dropzone-input"
        tabIndex={-1}
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          // Reset so choosing the same file again still fires onChange.
          e.target.value = "";
          if (files.length > 0) onFiles(files);
        }}
      />
      <UploadIcon size={28} />
      <p className="dropzone-title">{uploading ? "Uploading…" : "Drop songs here, or click to browse"}</p>
      <p className="dropzone-sub">MP3, WAV, FLAC, M4A, OGG</p>
    </div>
  );
}

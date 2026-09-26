import { useCallback, useState } from "react";
import { isAudioFileName } from "@musicapp/shared";
import { uploadSong } from "../../api";
import { useToast } from "../../components/ToastProvider";
import { errorText } from "../../lib/errors";

/** Uploads audio files one at a time, reporting each result as a toast. */
export function useUploads(onUploaded: () => Promise<void>) {
  const toast = useToast();
  const [uploading, setUploading] = useState(false);

  const upload = useCallback(
    async (files: File[]) => {
      const supported = files.filter((f) => isAudioFileName(f.name));
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
            await onUploaded();
          } catch (err) {
            toast.show(`Couldn’t upload “${file.name}”: ${errorText(err)}`, { kind: "error" });
          }
        }
      } finally {
        setUploading(false);
      }
    },
    [toast, onUploaded]
  );

  return { uploading, upload };
}

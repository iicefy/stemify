import { useState, type FormEvent } from "react";
import { importYoutube } from "../../../api";
import { useToast } from "../../../components/ToastProvider";
import { errorText } from "../../../lib/errors";

export function YoutubeForm({ onAdded }: { onAdded: () => Promise<void> }) {
  const toast = useToast();
  const [url, setUrl] = useState("");
  const [adding, setAdding] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;
    setAdding(true);
    try {
      await importYoutube(trimmed);
      setUrl("");
      toast.show("Link added. Downloading it now.", { kind: "success" });
      await onAdded();
    } catch (err) {
      toast.show(errorText(err), { kind: "error" });
    } finally {
      setAdding(false);
    }
  }

  return (
    <form className="youtube-form" onSubmit={handleSubmit}>
      <input
        className="youtube-input"
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="…or paste a YouTube link"
        spellCheck={false}
        aria-label="YouTube link"
      />
      <button className="btn btn-primary" type="submit" disabled={adding || !url.trim()}>
        {adding ? "Adding…" : "Add"}
      </button>
    </form>
  );
}

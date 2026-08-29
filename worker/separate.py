"""
Separates an input audio file into instrument stems using Demucs
(htdemucs_6s: drums, bass, vocals, guitar, piano, other) and writes the
result to <stems_dir>/<song_id>/, plus a manifest.json the API reads to
find out what got produced.

Usage: separate.py <input_path> <song_id> <stems_dir>
"""

import json
import sys
from pathlib import Path


def pick_device() -> str:
    import torch

    if torch.cuda.is_available():
        return "cuda"
    if torch.backends.mps.is_available():
        return "mps"
    return "cpu"


def main() -> None:
    if len(sys.argv) != 4:
        print("Usage: separate.py <input_path> <song_id> <stems_dir>", file=sys.stderr)
        sys.exit(1)

    input_path, song_id, stems_dir = sys.argv[1], sys.argv[2], sys.argv[3]
    out_dir = Path(stems_dir) / song_id
    out_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = out_dir / "manifest.json"

    try:
        from demucs.api import Separator, save_audio

        device = pick_device()
        print(f"[separate] device={device} input={input_path}", file=sys.stderr)

        separator = Separator(model="htdemucs_6s", device=device, progress=True)
        _original, stems = separator.separate_audio_file(Path(input_path))

        manifest = {"status": "done", "stems": {}}
        for name, wav in stems.items():
            stem_path = out_dir / f"{name}.wav"
            save_audio(wav, stem_path, samplerate=separator.samplerate)
            manifest["stems"][name] = stem_path.name

        manifest_path.write_text(json.dumps(manifest))
        print(f"[separate] done: {list(manifest['stems'])}", file=sys.stderr)

    except Exception as exc:
        # Worker boundary: whatever goes wrong, the API needs a manifest to
        # read back rather than just a nonzero exit code, so it can show the
        # real error instead of a generic "failed" status.
        manifest_path.write_text(json.dumps({"status": "failed", "error": str(exc)}))
        print(f"[separate] failed: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()

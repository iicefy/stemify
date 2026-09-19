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


def decode_to_wav(input_path: str, wav_path: Path) -> None:
    """Fallback decoder for containers the fast reader can't handle (e.g. the
    fragmented m4a YouTube serves). PyAV bundles its own FFmpeg, so this works
    with nothing installed on the machine."""
    import wave

    import av

    resampler = av.AudioResampler(format="s16", layout="stereo", rate=44100)
    written = 0
    with av.open(input_path) as container, wave.open(str(wav_path), "wb") as out:
        out.setnchannels(2)
        out.setsampwidth(2)
        out.setframerate(44100)
        stream = container.streams.audio[0]

        def write(frame) -> None:
            nonlocal written
            # A frame's raw plane buffer is padded for alignment; writing it
            # as-is inserts garbage every frame (constant crackling and a
            # longer file). to_ndarray() holds only the real samples.
            samples = frame.to_ndarray().astype("<i2", copy=False).reshape(-1)[: frame.samples * 2]
            out.writeframes(samples.tobytes())
            written += frame.samples

        for frame in container.decode(stream):
            for resampled in resampler.resample(frame):
                write(resampled)
        for resampled in resampler.resample(None):
            write(resampled)

        expected = (container.duration or 0) / 1_000_000 * 44100
        if expected and abs(written - expected) > 44100:
            raise RuntimeError(f"Decoded {written / 44100:.1f}s but the file is {expected / 44100:.1f}s long")


def separate_with_fallback(separator, input_path: str, out_dir: Path):
    try:
        return separator.separate_audio_file(Path(input_path))
    except Exception as first_error:
        print(f"[separate] direct decode failed ({first_error}); retrying via PyAV", file=sys.stderr)
        wav_path = out_dir / "decoded.wav"
        try:
            decode_to_wav(input_path, wav_path)
            return separator.separate_audio_file(wav_path)
        finally:
            wav_path.unlink(missing_ok=True)


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
        _original, stems = separate_with_fallback(separator, input_path, out_dir)

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

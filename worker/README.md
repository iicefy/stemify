# Separation worker

Python service (invoked as a subprocess per job by the API — not a
long-running server) that runs Demucs (`htdemucs_6s`) to split an audio
file into drums/bass/vocals/guitar/piano/other.

## Setup (macOS / Apple Silicon)

```bash
cd worker
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

`requirements.txt` was frozen on an Apple Silicon Mac, so it pins the
macOS/MPS build of `torch`. If you ever run this on Linux with an NVIDIA
GPU or on CPU-only hardware, reinstall `torch` per the [official
instructions](https://pytorch.org/get-started/locally/) for that
platform after `pip install -r requirements.txt` — the pinned version
number is fine, but the wheel variant differs per platform.

Demucs downloads the `htdemucs_6s` model weights (~a few hundred MB)
from Hugging Face on first use and caches them locally.

## Usage

Called by the API, not run manually in normal operation:

```bash
.venv/bin/python separate.py <input_audio_path> <song_id> <stems_dir>
```

Writes `<stems_dir>/<song_id>/{drums,bass,vocals,guitar,piano,other}.wav`
and a `manifest.json` in the same folder describing the result.

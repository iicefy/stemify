# Stemify

See [REQUIREMENTS.md](REQUIREMENTS.md) and [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)
for what this is and how it's built.

## Status

**All 5 phases done**: upload -> Demucs (`htdemucs_6s`) separates into
drums/bass/vocals/guitar/piano/other -> a DAW-style player (Web Audio
API + soundtouchjs, sample-accurate-enough sync across all 6 stems,
per-track mute/solo/volume, waveform lanes, click-to-seek, transport
bar, master volume, drag-to-loop a section, and pitch-preserving
playback speed 0.5x-1.5x).

## Local dev

```bash
make install   # npm install + set up the Python separation worker (.venv)
make run       # start the API and web app together
```

This starts the API on `http://localhost:3001` and the web app (Vite) on
`http://localhost:5173`, proxying `/api` to the API.

`make install` sets up the separation worker's Python virtualenv
automatically; see [worker/README.md](worker/README.md) for details
(e.g. reinstalling `torch` for non-Apple-Silicon hardware).

Without `make`, the equivalent is `npm install` at the root plus the
worker venv steps in [worker/README.md](worker/README.md), then `npm run dev`.

Uploaded files and generated stems are stored in `data/` (gitignored).

## Mac app

Stemify also ships as a self-contained macOS app (Apple Silicon): Electron
plus the API, the web UI, its own Python with PyTorch and Demucs, and the
`htdemucs_6s` model. Open it and it works - nothing else to install, no
network needed, and separation runs on the Apple GPU.

```bash
make app        # run the desktop app from the repo (dev; uses worker/.venv and ./data)
make app-pack   # build apps/desktop/release/mac-arm64/Stemify.app  (~1 GB)
make app-dmg    # build the installable apps/desktop/release/Stemify-<version>-arm64.dmg
make app-import # copy this repo's ./data library into the installed app
```

The first `app-pack`/`app-dmg` downloads Python and PyTorch (a few minutes);
after that they take seconds to a minute. The installed app keeps its library
in `~/Library/Application Support/Stemify/`.

The build is not signed with an Apple Developer ID. It runs fine on the Mac
that built it; on another Mac, right-click the app and choose **Open** the
first time (or sign and notarize it with a paid developer account).


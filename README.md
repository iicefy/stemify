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

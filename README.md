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
npm install
npm run dev
```

This starts the API on `http://localhost:3001` and the web app (Vite) on
`http://localhost:5173`, proxying `/api` to the API.

The separation worker needs its own Python environment set up once —
see [worker/README.md](worker/README.md).

Uploaded files and generated stems are stored in `data/` (gitignored).

# Stemify — Requirements Document

## 1. Overview

A personal web application for practicing guitar along with songs. The user
uploads an audio file; the app separates it into individual instrument
stems (e.g. drums, bass, vocals, guitar, other) using a self-hosted AI
source-separation model. The user can then play back the song with
per-stem control — muting the guitar track to play along, looping a
section, or slowing down playback — to make practicing easier.

This is a single-user tool. No accounts, multi-tenancy, or public access
are required for v1.

## 2. Goals

- Upload a song file (MP3/WAV/etc.) from the browser.
- Automatically separate it into instrument stems using an AI model.
- Play back the song with per-stem mute/solo and volume control.
- Loop a selected section of the track.
- Slow down or speed up playback without changing pitch, so difficult
  passages can be practiced at a comfortable tempo.
- Keep a personal library of previously uploaded/processed songs so
  separation doesn't need to be re-run every time.

## 3. Non-Goals (v1)

- Multi-user accounts, authentication, or sharing between users.
- Mobile app (this is a webapp; may be used from a mobile browser but is
  not optimized for it in v1).
- Automatic chord/tab detection or display.
- Practice session tracking, streaks, or progress analytics.
- Monetization, billing, or usage quotas.
- Real-time/live audio input (this app works on uploaded files only).

These may be revisited later but are explicitly out of scope for the
first version.

## 4. User

Single persona: the app owner, practicing guitar by playing along to
existing recordings. Runs the app on their own machine or a personal
server they control.

## 5. Functional Requirements

### 5.1 Upload
- User can upload an audio file via drag-and-drop or file picker.
- Supported input formats: at minimum MP3 and WAV. (Confirm additional
  formats like FLAC/M4A during implementation based on what the chosen
  separation model accepts.)
- Show upload progress and basic validation (file type, reasonable size
  limit to avoid accidental huge uploads).

### 5.2 Instrument Separation
- On upload, the file is sent to a self-hosted AI separation model
  running as a local backend service (see §7 for model choice).
- Output: every stem the model can produce — six with the chosen model:
  **drums, bass, vocals, guitar, piano, other**. "Other" is a catch-all
  for any instrument that doesn't have its own dedicated stem (e.g.
  strings, brass, synths) — this is a limitation of current
  open-source separation models, not a design choice. No open/local
  model today can split out an arbitrary number of individual
  instruments; six stems is the practical ceiling (see §7). If a
  future model supports finer separation, the app should treat the
  stem list as dynamic rather than hardcoding six.
- Separation runs asynchronously (it can take from seconds to a few
  minutes depending on hardware); the UI shows processing status and
  notifies when stems are ready.
- Processed stems are stored so the same song never needs to be
  re-separated.

### 5.3 Library
- A simple list/grid of previously uploaded songs with their processing
  status (processing / ready / failed).
- Selecting a song opens the player.
- Ability to delete a song (and its stored stems) from the library.

### 5.4 Playback & Practice Controls
- Multi-track player that plays all stems in sync.
- Per-stem controls, available for **every stem the model produced**
  (not just guitar/vocals — including "other"), driven dynamically by
  whatever stems came back for that song rather than a fixed list:
  - Mute / unmute
  - Solo (soloing one stem auto-mutes the rest; multiple stems can be
    soloed together, e.g. guitar + drums, to build a custom backing
    track)
  - Volume
- Transport controls: play, pause, seek.
- **Loop**: user can select a start/end point on the timeline (e.g. by
  dragging on a waveform or entering timestamps) and loop that section
  indefinitely.
- **Tempo control**: play back at reduced or increased speed
  (e.g. 50%–150%) without altering pitch (time-stretching).
- Waveform or basic timeline visualization to make seeking/looping
  practical.

## 6. Non-Functional Requirements

- **Scale**: single user, low concurrent load. Design should be simple,
  not built for horizontal scaling.
- **Deployment**: local-only. The entire app (frontend, backend,
  separation worker) runs on the user's own machine — no cloud hosting,
  no external network dependency once set up. `docker compose up` (or
  equivalent) should be enough to start everything.
- **Processing hardware**: separation is compute-intensive; running on
  CPU works but is slow (a few minutes per song is acceptable). If the
  local machine has a GPU (NVIDIA/CUDA, or Apple Silicon via MPS), the
  worker should use it automatically; otherwise it falls back to CPU.
- **Storage**: original uploads and generated stems are stored on the
  local filesystem. No specific retention policy required initially —
  user manages their own library and can delete songs to free space.
- **Latency**: playback and loop/tempo controls should be responsive
  (no audible lag) once stems are loaded in the browser.
- **Reliability**: failed separations should surface a clear error
  rather than hanging silently; user can retry.
- **Portability**: since this runs on the user's own infrastructure, it
  should be easy to run locally (e.g. via Docker) as well as deploy to
  a personal server.

## 7. Architecture & Tech Stack Decisions

- **Separation model**: [Demucs](https://github.com/facebookresearch/demucs)
  (`htdemucs_6s`, the 6-source model: drums, bass, vocals, guitar,
  piano, other). It's the current best open-source source-separation
  model and is the only mainstream option that isolates guitar as its
  own stem, which is the whole point of this app. Demucs is
  Python/PyTorch-based — there is no viable Go or JS/TS
  implementation, so the separation worker will run as a small local
  Python process/service regardless of the main app's stack.
- **Frontend + Backend**: TypeScript, single codebase where practical
  (e.g. Next.js, or a Node/Express API + a Vite/React frontend).
  Rationale: this is primarily a web-audio-heavy app (waveform
  rendering, multi-track playback, time-stretching via the Web Audio
  API), where the JS/TS ecosystem has the most mature tooling
  (wavesurfer.js, Tone.js, etc.). Go would work fine as a backend but
  adds nothing over Node here and would still need to shell out to the
  same Python worker for separation.
- **Backend responsibilities**: handle uploads, store song
  metadata/processing status, enqueue separation jobs, serve stem
  files to the frontend.
- **Separation worker**: a local Python service (invoked via a simple
  job queue or even a direct subprocess call, given single-user scale)
  running Demucs. Detects and uses GPU (CUDA or Apple MPS) if
  available, else falls back to CPU.
- **Storage**: local filesystem for original uploads and generated
  stems; SQLite for song metadata and processing status (no need for a
  full DB server at this scale).
- **Packaging**: Docker Compose bundling the Node app and the Python
  worker, so the whole thing starts locally with one command. (GPU
  passthrough in Docker adds complexity — running the Python worker
  natively on the host instead of in Docker is a reasonable
  alternative if GPU access becomes finicky.)

## 8. Open Questions

- None blocking for v1 — the above are reasonable defaults. If Demucs'
  guitar separation quality turns out to be unsatisfying in practice,
  swapping the model is an isolated change (worker only) and won't
  affect the rest of the architecture.

## 9. Future Ideas (not v1)

- Guitar-specific enhancements: pitch detection, chord recognition,
  auto-generated tab overlay synced to playback.
- Practice session tracking (time spent, sections practiced).
- Multi-user support if sharing with other musicians becomes useful.
- Export separated stems as downloadable files.

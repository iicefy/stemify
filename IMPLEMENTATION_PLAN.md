# Guitar Practice App — Technical Implementation Plan

Companion to [REQUIREMENTS.md](REQUIREMENTS.md). This defines the concrete
architecture, data model, API surface, and build phases.

## 1. Project Structure

Monorepo, three parts:

```
musicapp/
  apps/
    web/          # React + Vite frontend
    api/          # Node/Express backend (TypeScript)
  worker/         # Python — Demucs separation worker
  data/           # local storage: uploads/, stems/, db.sqlite (gitignored)
  docker-compose.yml
```

Single repo keeps it simple for a personal project; `apps/web` and
`apps/api` share TS types via a small `packages/shared` folder if needed
later (not required for v1).

## 2. Backend (`apps/api`)

- **Framework**: Express (Fastify is fine too — Express is more
  boring/predictable, which is preferable here).
- **DB**: SQLite via `better-sqlite3` (synchronous, no server process,
  matches single-user local scale). ORM not necessary — raw SQL with a
  thin query layer is enough for this schema size.
- **File handling**: `multer` for upload, streaming writes to
  `data/uploads/`.

### 2.1 Data Model

```sql
CREATE TABLE songs (
  id            TEXT PRIMARY KEY,   -- uuid
  title         TEXT NOT NULL,      -- derived from filename, editable later
  original_path TEXT NOT NULL,
  status        TEXT NOT NULL,      -- 'processing' | 'ready' | 'failed'
  error_message TEXT,
  created_at    TEXT NOT NULL
);

CREATE TABLE stems (
  id       TEXT PRIMARY KEY,
  song_id  TEXT NOT NULL REFERENCES songs(id) ON DELETE CASCADE,
  name     TEXT NOT NULL,           -- 'drums' | 'bass' | 'vocals' | 'guitar' | 'piano' | 'other'
  file_path TEXT NOT NULL
);
```

Stems are rows, not fixed columns — keeps the frontend stem list
dynamic per §5.2 of the requirements doc, and doesn't hardcode six.

### 2.2 API Endpoints

| Method | Path                          | Purpose                                      |
|--------|-------------------------------|-----------------------------------------------|
| POST   | `/api/songs`                  | Upload a file, create song row (status=processing), enqueue separation |
| GET    | `/api/songs`                  | List songs with status                        |
| GET    | `/api/songs/:id`               | Song detail + its stems (once ready)          |
| DELETE | `/api/songs/:id`               | Delete song, stems, and files on disk         |
| GET    | `/api/songs/:id/stems/:stemId` | Stream a stem's audio file (range-request support for seeking) |

No auth — local-only, single user, per requirements §6.

### 2.3 Separation Job Handling

No need for Redis/BullMQ at this scale. Simplest thing that works:

1. On upload, API writes the file, inserts a `songs` row
   (`status='processing'`), and spawns the worker as a child process:
   `python worker/separate.py <input_path> <song_id> <output_dir>`.
2. API does **not** block the HTTP response on this — it returns
   immediately with the song id so the frontend can poll/show status.
3. A simple in-process queue (array + "process one at a time") avoids
   running multiple heavy Demucs jobs concurrently and starving the
   machine — important since this all runs on one local box, possibly
   without a GPU.
4. On worker completion, API updates `songs.status` and inserts `stems`
   rows (worker writes a small JSON manifest on success that the API
   reads, or the worker calls back to a local API endpoint — either
   works; direct manifest read is simpler and has no networking to get
   wrong).
5. Frontend polls `GET /api/songs/:id` every few seconds while
   status is `processing`.

This is intentionally simple. A real job queue can be introduced later
if multi-job concurrency ever matters — it won't at single-user scale.

## 3. Separation Worker (`worker/`)

- **Language**: Python (required — Demucs is PyTorch-based).
- **Model**: `htdemucs_6s` via the `demucs` package
  (`python -m demucs -n htdemucs_6s --out <dir> <input>`), invoked
  either via the CLI directly (simplest) or via Demucs' Python API for
  more control over device selection.
- **Device selection**: detect CUDA (`torch.cuda.is_available()`) or
  Apple MPS (`torch.backends.mps.is_available()`), else CPU. Demucs
  supports `-d` / `--device` to force this explicitly.
- **Output**: Demucs writes one WAV file per stem into a per-song
  folder. Worker writes a `manifest.json` listing stem name → file path
  once all files are confirmed written, as the "done" signal.
- **Dependencies**: `demucs`, `torch` (CPU or GPU build depending on
  host), pinned in `worker/requirements.txt`. Note in the README that
  the correct `torch` build (CUDA vs CPU vs MPS) depends on the host
  machine and may need manual install outside of `requirements.txt`.

## 4. Frontend (`apps/web`)

- **Framework**: React + Vite (fast local dev, no need for Next.js's
  SSR/routing features on a local single-user app).
- **Routing**: two views — Library and Player — `react-router` is
  enough, or even simple state-based view switching given the small
  surface area.

### 4.1 Library View
- Upload button/dropzone → `POST /api/songs`.
- List of songs with status badge (processing/ready/failed), poll
  in-flight ones.
- Click a ready song → Player view. Delete button per song.

### 4.2 Player View — the core technical challenge

Playing 6 audio files in **sample-accurate sync**, with per-stem
mute/solo/volume, section looping, and pitch-preserving tempo change,
rules out plain `<audio>` elements (they drift out of sync with each
other and don't support quality time-stretching). Approach:

- **Web Audio API**, one shared `AudioContext`.
- On load, `fetch` + `decodeAudioData` all stem files in parallel into
  `AudioBuffer`s.
- Each stem gets a small chain: `AudioBufferSourceNode → GainNode
  (volume/mute) → destination`. Solo is implemented by computing
  effective gain per stem (muted unless soloed, when any stem is
  soloed) rather than a separate audio-graph concept.
- All `AudioBufferSourceNode`s are `start()`-ed with the **same
  scheduled `AudioContext` time**, so playback stays sample-accurate
  across stems (this is the standard Web Audio pattern for multi-track
  sync — restart all nodes together on every seek/loop/tempo change,
  since source nodes can't be paused/resumed, only stopped/recreated).
- **Tempo (pitch-preserving time-stretch)**: `AudioBufferSourceNode`'s
  `playbackRate` changes pitch too, so it's not sufficient alone. Use
  a proper time-stretch library — [`soundtouchjs`](https://github.com/cutterbl/SoundTouchJS)
  (a WebAudio/AudioWorklet port of the SoundTouch algorithm) is the
  established open-source option for this in-browser. All 6 stems
  need the same tempo applied in lockstep.
- **Loop**: on reaching the loop end time (tracked via
  `AudioContext.currentTime` against scheduled start), stop and
  restart all 6 source nodes at the loop start point, staying in sync.
- **Waveform display**: render from the original (pre-separation)
  upload for the timeline/scrubber, using `wavesurfer.js` — cheaper
  than rendering 6 separate waveforms, and the timeline position is
  shared across all stems anyway.

This is the highest-risk, most novel part of the build (sync + tempo
across 6 simultaneous tracks). Recommend prototyping this in isolation
first (Phase 3 below) before investing in library/UI polish.

## 5. Local Deployment

Host confirmed as **Apple Silicon Mac**. Apple's GPU (MPS) is not
accessible from inside Docker on macOS, so containerizing the worker
would force CPU-only separation and lose the whole point of having a
GPU available. Decision: **no Docker for now** — run everything
natively on the host.

- `worker/`: Python venv, `torch` installed with MPS support (standard
  `pip install torch` on macOS includes MPS), `demucs` on top. Worker
  detects MPS via `torch.backends.mps.is_available()` and uses it
  automatically, falling back to CPU only if unavailable.
- `apps/api`: run directly with Node (`npm run dev` / `node dist/...`).
- `apps/web`: Vite dev server locally; for "production-ish" local use,
  build static assets and let the API serve them from one process/port.
- A single `npm run dev` (or a small shell script) at the repo root can
  start API + frontend together; the worker is invoked by the API as a
  subprocess per job, not run as a standalone long-lived service.
- `data/` is just a local folder on disk — no volumes/containers to
  configure.
- Docker Compose can be revisited later only if this ever needs to run
  on a different (non-Mac, non-GPU-local) machine — not needed for v1.

## 6. Build Phases

1. **Skeleton**: repo scaffold, SQLite schema, upload endpoint storing
   files with `status='processing'` but no real separation yet (stub:
   just copy the original file as a single fake "stem" to unblock
   frontend work). Library view + upload UI.
2. **Real separation**: wire up the Python worker with Demucs,
   job spawning/polling, manifest handling, stems table population.
   Validate output quality and processing time on the actual host
   machine/hardware.
3. **Sync playback prototype**: minimal UI, just prove 6-stem
   sample-accurate playback + mute/solo works reliably. This is the
   riskiest technical piece — do it before building out full player UI.
4. **Loop + waveform**: add section looping and `wavesurfer.js`
   timeline/scrubber on top of the working player.
5. **Tempo (time-stretch)**: integrate `soundtouchjs` across all
   stems in sync. Likely the fiddliest phase — budget extra time.
6. **Polish**: delete/error states, better upload validation, styling.

## 7. Decision Points

All resolved:
- Host: Apple Silicon Mac → native (non-Docker) setup, MPS-accelerated
  Demucs (§5).
- Everything else in this plan is a default best-practice choice and
  doesn't need sign-off unless you want to change it.

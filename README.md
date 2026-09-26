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

Before committing, run `make check` (typecheck every workspace, ESLint, and the
Vitest unit tests). `make release` runs it too and stops if anything fails.

## Project layout

```
packages/shared/src/        API <-> web contract (one file per topic)
  song.ts settings.ts events.ts uploads.ts

apps/api/src/
  index.ts                  public entry - the desktop app imports @musicapp/api
  main.ts                   run standalone (npm run dev:api)
  server.ts                 Express app assembly
  http/                     songsRouter.ts (endpoints only, no SQL), errors.ts
  db/                       database.ts (schema), songRepository.ts (every query)
  separation/               queue.ts (Demucs jobs), workerProtocol.ts (the worker contract)
  youtube/                  importer.ts, url.ts, ytdlp.ts
  infra/                    paths.ts, storage.ts (files), events.ts (live updates)

apps/web/src/
  main.tsx App.tsx router.ts
  api/                      the only code that talks to the server
  audio/                    playback engine; worklet/ runs on the audio thread
  features/
    library/                Library.tsx + components/ hooks/ lib/
    player/                 Player.tsx + components/{toolbar,timeline}/ hooks/ lib/
  components/               shared UI (dialog, toasts, icons)
  lib/                      shared pure helpers
  styles/                   one file per area; index.css sets the cascade order
  types/                    declarations for untyped packages

apps/desktop/src/
  main.ts                   app lifecycle only
  app/                      environment, backend, main window, menu
  updater/                  in-app updates (mac.ts, windows.ts, apply-update.sh)

worker/separate.py          Demucs separation, run by the API as a subprocess
```

Where things go:

- A feature's entry component (`Library.tsx`, `Player.tsx`) sits at the top
  of its folder. Inside it, `components/` holds React components, `hooks/`
  React hooks, and `lib/` pure TypeScript with no React or DOM, each with a
  `*.test.ts` next to it.
- Code used by more than one feature moves up to `src/components` or `src/lib`.
- In the API, only `db/` runs SQL and only `http/` knows about requests.

The library updates live: the API pushes Server-Sent Events whenever a song
is added, changes status or is removed, plus separation progress, which the
worker reports as `PROGRESS <0..1>` lines.

Pure logic lives in plain `.ts` modules next to the code that uses it, with a
`*.test.ts` beside it; components and hooks stay thin wrappers around it.

## Adding songs from YouTube

Paste a YouTube link into the box under the upload area and press **Add**. The
app downloads the audio (up to 60 minutes) with `yt-dlp`, then separates it
like any uploaded file. Status shows *Downloading…* then *Separating…*.

- `yt-dlp` is fetched on first use into the data folder (`data/bin`) and
  updates itself when it is a few days old or a download fails - YouTube
  changes often enough that a frozen copy would break. First use needs internet.
- Only single videos are taken (a playlist link adds its first video).
- Formats the fast decoder can't read (like YouTube's m4a) are decoded through
  PyAV, which ships its own FFmpeg - nothing else to install.
- Downloading may go against YouTube's terms and the music is usually
  copyrighted; use it only for personal practice with music you're entitled to.

## Mac app

Stemify also ships as a self-contained macOS app (Apple Silicon): Electron
plus the API, the web UI, its own Python with PyTorch and Demucs, and the
`htdemucs_6s` model. Open it and it works - nothing else to install, no
network needed, and separation runs on the Apple GPU.

```bash
make app        # run the desktop app from the repo (dev; uses worker/.venv and ./data)
make app-pack   # build apps/desktop/release/mac-arm64/Stemify.app  (~1 GB)
make app-dmg    # build the installable apps/desktop/release/Stemify-<version>-arm64.dmg
make app-win    # build the Windows x64 installer apps/desktop/release/Stemify-Setup-<version>-x64.exe
make app-import # copy this repo's ./data library into the installed app
```

The first `app-pack`/`app-dmg` downloads Python and PyTorch (a few minutes);
after that they take seconds to a minute. The installed app keeps its library
in `~/Library/Application Support/Stemify/`.

The build is not signed with an Apple Developer ID. It runs fine on the Mac
that built it; on another Mac, right-click the app and choose **Open** the
first time (or sign and notarize it with a paid developer account).



### Updates

Installed apps update themselves, like Discord. On launch the app checks the
latest GitHub release; if there is a newer version it shows a short "Updating…"
screen, installs it, and reopens on the new version. A quiet check also runs a
minute after launch and every few hours, and asks "Restart now / Later" (never
while a song is being separated). **Stemify > Check for Updates…** checks on
demand. Your songs live outside the app and are never touched. If the check or
download fails, or you're offline, the app just opens normally.

- **Windows** uses `electron-updater` (downloads only the changed blocks).
- **Mac** builds aren't signed, so the standard updater can't be used. Instead
  the app downloads a small "code only" package (about 1 MB: the app code, web
  build and worker script), verifies its SHA-512, and swaps it into the app
  bundle when it quits, keeping a backup and restoring it if anything fails.
  The bundled Python, PyTorch and model stay as they are.
- If a release changes something the small package can't (Electron, Python or
  its packages), Mac apps are asked to download the new installer instead.

To publish a version (bumps it, builds Mac + Windows, uploads everything the
updaters need, and creates the GitHub release):

```bash
make release VERSION=0.5.0 NOTES=notes.md   # NOTES is optional
```

Update files uploaded with each release: `update.json` + `*-mac-arm64-update.zip`
(Mac) and `latest.yml` + the `.exe` + its `.blockmap` (Windows). Test against a
local folder with `STEMIFY_UPDATE_URL=http://127.0.0.1:8765 Stemify` (and
`update.log` in the app's data folder records what happened).

### Windows

`make app-win` cross-builds a Windows x64 installer from the Mac: it fetches a
Windows Python and installs the Windows wheels. Differences from the Mac app:

- **CPU only.** The bundled PyTorch is the CPU build, so separating a song is
  much slower than on Apple Silicon (several minutes per song). NVIDIA GPU
  support would mean swapping in the CUDA build of PyTorch (about 2.5 GB more).
- **Unsigned.** Windows SmartScreen will warn ("Windows protected your PC");
  choose *More info* > *Run anyway*.
- The .exe keeps Electron's icon when built from a Mac (setting it needs
  Windows or Wine); building on Windows gives the full icon.
- It was built but **not run on a real Windows machine** yet.

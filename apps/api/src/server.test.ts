/**
 * HTTP-level tests: the real server, routes and database, in a throwaway data
 * folder. Separation runs a fake worker (Node, not Demucs) that follows the
 * same contract as worker/separate.py - see workerProtocol.ts.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { LibraryEvent, Song, SongDetail } from "@musicapp/shared";

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "stemify-api-test-"));
const fakeWorker = path.join(dataDir, "fake-worker.mjs");
fs.writeFileSync(
  fakeWorker,
  `
import fs from "node:fs";
import path from "node:path";
const [input, songId, stemsDir] = process.argv.slice(2);
const out = path.join(stemsDir, songId);
fs.mkdirSync(out, { recursive: true });
const manifest = (m) => fs.writeFileSync(path.join(out, "manifest.json"), JSON.stringify(m));
if (fs.readFileSync(input, "utf8").includes("FAIL")) {
  manifest({ status: "failed", error: "Fake worker failure" });
  process.exit(1);
}
console.log("a log line");
console.log("PROGRESS 0.5");
await new Promise((r) => setTimeout(r, 50));
for (const name of ["drums", "other"]) fs.writeFileSync(path.join(out, name + ".wav"), "RIFF" + name);
manifest({ status: "done", stems: { drums: "drums.wav", other: "other.wav" } });
console.log("PROGRESS 1");
`
);

// Must be set before the API loads: paths.ts reads them at import time.
process.env.STEMIFY_DATA_DIR = dataDir;
process.env.STEMIFY_WEB_DIST = path.join(dataDir, "no-web-build");
process.env.STEMIFY_PYTHON = process.execPath;
process.env.STEMIFY_WORKER_SCRIPT = fakeWorker;
const { startServer, stopSeparation } = await import("./index.js");

let server: Server;
let base: string;

beforeAll(async () => {
  const started = await startServer({ port: 0, host: "127.0.0.1" });
  server = started.server;
  base = `http://127.0.0.1:${started.port}/api/songs`;
});

afterAll(() => {
  stopSeparation();
  server.closeAllConnections();
  server.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

/** The fake worker fails any upload whose content contains "FAIL". */
async function upload(fileName: string, content = "not really audio"): Promise<Response> {
  const form = new FormData();
  form.append("file", new Blob([content]), fileName);
  return fetch(base, { method: "POST", body: form });
}

async function getSong(id: string): Promise<SongDetail> {
  return (await fetch(`${base}/${id}`)).json();
}

async function waitFor<T>(check: () => Promise<T | undefined>, timeoutMs = 5000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const result = await check();
    if (result !== undefined) return result;
    if (Date.now() > deadline) throw new Error("timed out waiting");
    await new Promise((r) => setTimeout(r, 25));
  }
}

/** Collects LibraryEvents from the SSE stream until stopped. */
function listenToEvents() {
  const events: LibraryEvent[] = [];
  const controller = new AbortController();
  const done = fetch(`${base}/events`, { signal: controller.signal })
    .then(async (res) => {
      const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return;
        buffer += value;
        const messages = buffer.split("\n\n");
        buffer = messages.pop()!;
        for (const message of messages) {
          const data = message.split("\n").find((l) => l.startsWith("data: "));
          if (data) events.push(JSON.parse(data.slice(6)));
        }
      }
    })
    .catch(() => {}); // aborted
  return {
    events,
    stop: async () => {
      controller.abort();
      await done;
    },
  };
}

describe("songs API", () => {
  it("starts with an empty library", async () => {
    const res = await fetch(base);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("uploads, separates, and pushes live events along the way", async () => {
    const listener = listenToEvents();
    await new Promise((r) => setTimeout(r, 100)); // let the stream connect

    const res = await upload("My Song.mp3");
    expect(res.status).toBe(201);
    const song: Song = await res.json();
    expect(song).toMatchObject({ title: "My Song", status: "processing", errorMessage: null });

    const ready = await waitFor(async () => {
      const detail = await getSong(song.id);
      return detail.status === "ready" ? detail : undefined;
    });
    expect(ready.stems.map((s) => s.name).sort()).toEqual(["drums", "other"]);
    expect(ready.settings).toBeNull();

    const stem = await fetch(`${base}/${song.id}/stems/${ready.stems.find((s) => s.name === "drums")!.id}`);
    expect(stem.status).toBe(200);
    expect(await stem.text()).toBe("RIFFdrums");

    await waitFor(async () => (listener.events.some((e) => e.type === "changed") ? true : undefined));
    await listener.stop();
    expect(listener.events).toContainEqual({ type: "progress", songId: song.id, progress: 0.5 });
    expect(listener.events).toContainEqual({ type: "changed" });
  });

  it("rejects unsupported files with a JSON error", async () => {
    const res = await upload("notes.txt");
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Unsupported file type/);
  });

  it("records the worker's own error message, and retries failed songs", async () => {
    const song: Song = await (await upload("broken.wav", "FAIL")).json();
    const failed = await waitFor(async () => {
      const detail = await getSong(song.id);
      return detail.status === "failed" ? detail : undefined;
    });
    expect(failed.errorMessage).toBe("Fake worker failure");

    const retry = await fetch(`${base}/${song.id}/retry`, { method: "POST" });
    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual({ id: song.id, status: "processing" });
    await waitFor(async () => ((await getSong(song.id)).status === "failed" ? true : undefined));

    const notFailed = (await (await fetch(base)).json()).find((s: Song) => s.status === "ready");
    expect((await fetch(`${base}/${notFailed.id}/retry`, { method: "POST" })).status).toBe(400);
  });

  it("renames, validating the title", async () => {
    const [song]: Song[] = await (await fetch(base)).json();
    const res = await fetch(`${base}/${song.id}`, json("PATCH", { title: "  Renamed  " }));
    expect(await res.json()).toEqual({ id: song.id, title: "Renamed" });
    expect((await getSong(song.id)).title).toBe("Renamed");

    expect((await fetch(`${base}/${song.id}`, json("PATCH", { title: "   " }))).status).toBe(400);
    expect((await fetch(`${base}/${song.id}`, json("PATCH", { title: "x".repeat(201) }))).status).toBe(400);
    expect((await fetch(`${base}/missing`, json("PATCH", { title: "ok" }))).status).toBe(404);
  });

  it("stores per-song settings as given", async () => {
    const [song]: Song[] = await (await fetch(base)).json();
    const settings = { masterVolume: 0.5, playbackRate: 1, loopEnabled: false, loopRegion: null, tracks: {} };
    expect((await fetch(`${base}/${song.id}/settings`, json("PUT", settings))).status).toBe(204);
    expect((await getSong(song.id)).settings).toEqual(settings);

    expect((await fetch(`${base}/${song.id}/settings`, json("PUT", [1, 2]))).status).toBe(400);
    expect((await fetch(`${base}/missing/settings`, json("PUT", settings))).status).toBe(404);
  });

  it("deletes a song and its files", async () => {
    const songs: Song[] = await (await fetch(base)).json();
    const song = songs.find((s) => s.status === "ready")!;
    expect((await fetch(`${base}/${song.id}`, { method: "DELETE" })).status).toBe(204);
    expect((await fetch(`${base}/${song.id}`)).status).toBe(404);
    await waitFor(async () => (fs.existsSync(path.join(dataDir, "stems", song.id)) ? undefined : true));
    expect((await fetch(`${base}/${song.id}`, { method: "DELETE" })).status).toBe(404);
  });

  it("answers unknown API routes and malformed JSON with JSON errors", async () => {
    const unknown = await fetch(base.replace("/songs", "/nope"));
    expect(unknown.status).toBe(404);
    expect(await unknown.json()).toEqual({ error: "Not found" });

    const [song]: Song[] = await (await fetch(base)).json();
    const bad = await fetch(`${base}/${song.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: "{oops" });
    expect(bad.status).toBe(400);
    expect(typeof (await bad.json()).error).toBe("string");
  });
});

import { describe, expect, it } from "vitest";
import type { SongSettings } from "../../../api";
import { restoreSettings, toSongSettings } from "./songSettings";

const stems = [
  { id: "a1", name: "drums" },
  { id: "b1", name: "bass" },
];

const saved: SongSettings = {
  masterVolume: 0.8,
  playbackRate: 0.75,
  loopEnabled: true,
  loopRegion: { start: 10, end: 20 },
  tracks: { drums: { muted: true, solo: false, volume: 0.5 } },
};

describe("restoreSettings", () => {
  it("defaults everything when nothing was saved", () => {
    const state = restoreSettings(null, stems, 100);
    expect(state.masterVolume).toBe(1);
    expect(state.playbackRate).toBe(1);
    expect(state.loopRegion).toBeNull();
    expect(state.loopEnabled).toBe(false);
    expect(state.trackStates.get("a1")).toEqual({ muted: false, solo: false, volume: 1 });
  });

  it("restores tracks by stem name, so new stem ids (after Retry) still match", () => {
    const state = restoreSettings(saved, [{ id: "new-id", name: "drums" }], 100);
    expect(state.trackStates.get("new-id")).toEqual({ muted: true, solo: false, volume: 0.5 });
  });

  it("clamps out-of-range values and ignores junk", () => {
    const junk = {
      masterVolume: 9,
      playbackRate: "fast",
      tracks: { drums: { muted: 1, solo: 0, volume: -3 } },
    } as unknown as SongSettings;
    const state = restoreSettings(junk, stems, 100);
    expect(state.masterVolume).toBe(1.5);
    expect(state.playbackRate).toBe(1);
    expect(state.trackStates.get("a1")).toEqual({ muted: true, solo: false, volume: 0 });
  });

  it("drops a loop that doesn't fit the song", () => {
    const state = restoreSettings({ ...saved, loopRegion: { start: 10, end: 500 } }, stems, 100);
    expect(state.loopRegion).toBeNull();
    expect(state.loopEnabled).toBe(false);
  });

  it("round-trips through toSongSettings", () => {
    const state = restoreSettings(saved, stems, 100);
    expect(toSongSettings(state, stems)).toEqual({
      ...saved,
      tracks: { ...saved.tracks, bass: { muted: false, solo: false, volume: 1 } },
    });
  });
});

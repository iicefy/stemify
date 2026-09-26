import { describe, expect, it } from "vitest";
import { isAudioFileName } from "./index";

describe("isAudioFileName", () => {
  it("accepts supported extensions in any case", () => {
    expect(isAudioFileName("song.mp3")).toBe(true);
    expect(isAudioFileName("Song.FLAC")).toBe(true);
    expect(isAudioFileName("เพลง.m4a")).toBe(true);
  });

  it("rejects everything else", () => {
    expect(isAudioFileName("video.mp4")).toBe(false);
    expect(isAudioFileName("notes.txt")).toBe(false);
    expect(isAudioFileName("mp3")).toBe(false);
  });
});

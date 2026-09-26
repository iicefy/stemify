import { describe, expect, it } from "vitest";
import { parseManifest, parseProgressLine } from "./workerProtocol.js";

describe("parseProgressLine", () => {
  it("reads progress lines", () => {
    expect(parseProgressLine("PROGRESS 0.42")).toBe(0.42);
    expect(parseProgressLine("PROGRESS 1\r")).toBe(1);
    expect(parseProgressLine("PROGRESS .5")).toBe(0.5);
  });

  it("clamps to 0..1", () => {
    expect(parseProgressLine("PROGRESS 7")).toBe(1);
  });

  it("ignores everything else", () => {
    for (const line of ["", "[separate] device=mps", "PROGRESS", "PROGRESS abc", "progress 0.5", "PROGRESS -1"]) {
      expect(parseProgressLine(line)).toBeNull();
    }
  });
});

describe("parseManifest", () => {
  it("accepts a successful manifest", () => {
    const stems = { drums: "drums.wav", other: "other.wav" };
    expect(parseManifest({ status: "done", stems })).toEqual({ status: "done", stems });
  });

  it("accepts a failure, with a fallback message", () => {
    expect(parseManifest({ status: "failed", error: "Out of memory" })).toEqual({ status: "failed", error: "Out of memory" });
    expect(parseManifest({ status: "failed" })).toEqual({ status: "failed", error: "Separation failed" });
  });

  it("rejects stem files that escape the song's folder", () => {
    for (const file of ["../db.sqlite", "/etc/passwd", "sub/drums.wav", "..", ".hidden", ""]) {
      expect(parseManifest({ status: "done", stems: { drums: file } })).toBeNull();
    }
  });

  it("rejects malformed manifests", () => {
    for (const raw of [null, "done", [], {}, { status: "done" }, { status: "done", stems: {} }, { status: "weird" }]) {
      expect(parseManifest(raw)).toBeNull();
    }
  });
});

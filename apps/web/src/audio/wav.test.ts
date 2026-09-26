import { describe, expect, it } from "vitest";
import { parseWav16 } from "./wav";

function wav({ channels, bits = 16, format = 1, samples }: { channels: number; bits?: number; format?: number; samples: number[] }) {
  const dataBytes = samples.length * 2;
  const view = new DataView(new ArrayBuffer(44 + dataBytes));
  const tag = (offset: number, s: string) => [...s].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  tag(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  tag(8, "WAVE");
  tag(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, 44100, true);
  view.setUint32(28, 44100 * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, bits, true);
  tag(36, "data");
  view.setUint32(40, dataBytes, true);
  samples.forEach((s, i) => view.setInt16(44 + i * 2, s, true));
  return view.buffer;
}

describe("parseWav16", () => {
  it("reads stereo 16-bit PCM as-is", () => {
    const pcm = parseWav16(wav({ channels: 2, samples: [1, -1, 2, -2] }));
    expect(pcm?.sampleRate).toBe(44100);
    expect(pcm?.frames).toBe(2);
    expect([...(pcm?.samples ?? [])]).toEqual([1, -1, 2, -2]);
  });

  it("duplicates mono into both channels", () => {
    const pcm = parseWav16(wav({ channels: 1, samples: [5, 7] }));
    expect([...(pcm?.samples ?? [])]).toEqual([5, 5, 7, 7]);
  });

  it("returns null for anything that isn't 16-bit PCM", () => {
    expect(parseWav16(wav({ channels: 2, bits: 24, samples: [0, 0] }))).toBeNull();
    expect(parseWav16(wav({ channels: 2, format: 3, samples: [0, 0] }))).toBeNull();
    expect(parseWav16(new ArrayBuffer(10))).toBeNull();
  });
});

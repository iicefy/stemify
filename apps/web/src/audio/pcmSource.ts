import type { LoopFrames } from "./mixerProtocol";

// ~3ms at 44.1k: long enough to kill the click at the loop join, too short to hear.
const FADE_FRAMES = 128;
// Silence after the last real sample so SoundTouch's internal window can flush the tail.
const TAIL_PAD_FRAMES = 16384;
const INT16_SCALE = 1 / 32768;

/**
 * Interleaved stereo 16-bit PCM that hands SoundTouch float frames on demand.
 * Loops wrap here, in the source: positions passed to `extract` are "virtual"
 * (they keep counting past the loop end) and are mapped back into the loop,
 * so the wrap is sample-accurate and never needs a seek/flush.
 */
export class PcmSource {
  loop: LoopFrames | null = null;
  readonly frames: number;

  constructor(private readonly samples: Int16Array) {
    this.frames = samples.length >> 1;
  }

  mapPosition(virtual: number): number {
    const loop = this.loop;
    if (!loop || virtual < loop.end) return virtual;
    return loop.start + ((virtual - loop.start) % (loop.end - loop.start));
  }

  extract(target: Float32Array, numFrames: number, position: number): number {
    const s = this.samples;
    const frames = this.frames;
    const loop = this.loop;

    if (!loop) {
      if (position >= frames + TAIL_PAD_FRAMES) return 0;
      const real = Math.max(0, Math.min(numFrames, frames - position));
      let src = position * 2;
      for (let i = 0; i < real * 2; i++) target[i] = s[src++] * INT16_SCALE;
      target.fill(0, real * 2, numFrames * 2);
      return Math.min(numFrames, frames + TAIL_PAD_FRAMES - position);
    }

    const fade = Math.min(FADE_FRAMES, Math.floor((loop.end - loop.start) / 2));
    for (let i = 0; i < numFrames; i++) {
      const m = this.mapPosition(position + i);
      let l = 0;
      let r = 0;
      if (m < frames) {
        l = s[m * 2] * INT16_SCALE;
        r = s[m * 2 + 1] * INT16_SCALE;
        let g = 1;
        if (m >= loop.end - fade && m < loop.end) g = (loop.end - m) / fade;
        else if (m >= loop.start && m < loop.start + fade) g = (m - loop.start) / fade;
        l *= g;
        r *= g;
      }
      target[i * 2] = l;
      target[i * 2 + 1] = r;
    }
    return numFrames;
  }
}

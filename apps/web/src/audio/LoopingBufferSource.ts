export interface LoopFrames {
  start: number;
  end: number;
}

// ~3ms at 44.1k: long enough to kill the click at the wrap point, too short to hear.
const FADE_FRAMES = 128;

/**
 * Drop-in replacement for soundtouchjs's WebAudioBufferSource that wraps
 * loop playback inside the audio callback. Positions handed to `extract`
 * are "virtual" (they keep counting past the loop end); they're mapped back
 * into the loop here, so the wrap is sample-accurate and never needs a
 * seek (which would flush SoundTouch's buffers and glitch every stem).
 */
export class LoopingBufferSource {
  loop: LoopFrames | null = null;
  private position_ = 0;

  constructor(private buffer: AudioBuffer) {}

  get dualChannel() {
    return this.buffer.numberOfChannels > 1;
  }

  get position() {
    return this.position_;
  }

  set position(value: number) {
    this.position_ = value;
  }

  mapPosition(virtual: number): number {
    const loop = this.loop;
    if (!loop || virtual < loop.end) return virtual;
    return loop.start + ((virtual - loop.start) % (loop.end - loop.start));
  }

  extract(target: Float32Array, numFrames = 0, position = 0): number {
    this.position_ = position;
    const left = this.buffer.getChannelData(0);
    const right = this.dualChannel ? this.buffer.getChannelData(1) : left;
    const length = left.length;
    const loop = this.loop;
    const fade = loop ? Math.min(FADE_FRAMES, Math.floor((loop.end - loop.start) / 2)) : 0;

    if (!loop) {
      for (let i = 0; i < numFrames; i++) {
        target[i * 2] = left[i + position];
        target[i * 2 + 1] = right[i + position];
      }
      return Math.min(numFrames, length - position);
    }

    for (let i = 0; i < numFrames; i++) {
      const m = this.mapPosition(position + i);
      let l = m < length ? left[m] : 0;
      let r = m < length ? right[m] : 0;
      if (fade > 0) {
        if (m >= loop.end - fade && m < loop.end) {
          const g = (loop.end - m) / fade;
          l *= g;
          r *= g;
        } else if (m >= loop.start && m < loop.start + fade) {
          const g = (m - loop.start) / fade;
          l *= g;
          r *= g;
        }
      }
      target[i * 2] = l;
      target[i * 2 + 1] = r;
    }
    return numFrames;
  }
}

import { SoundTouch } from "soundtouchjs";
import { PcmSource } from "./pcmSource";
import type { LoopFrames, MixerCommand, MixerEvent } from "../mixerProtocol";

// AudioWorkletGlobalScope isn't in TypeScript's DOM lib.
declare const currentTime: number;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}
declare function registerProcessor(name: string, ctor: new () => AudioWorkletProcessor): void;

/** Input frames fed to SoundTouch per step. */
const CHUNK_FRAMES = 1024;
/** A voice is topped up in the background once its ready output drops below this. */
const LOW_WATER_FRAMES = 2048;
/** Position updates go out every N render quanta (128 frames each). */
const POST_EVERY_QUANTA = 6;

class Voice {
  readonly source: PcmSource;
  readonly st = new SoundTouch();
  private readonly scratch = new Float32Array(CHUNK_FRAMES * 2);
  /** Virtual source position of the next frame to feed. */
  readPos = 0;
  gain = 1;
  target = 1;
  exhausted = false;

  constructor(samples: Int16Array) {
    this.source = new PcmSource(samples);
    this.st.pitch = 1;
  }

  get ready(): number {
    return this.st.outputBuffer.frameCount;
  }

  feed(): void {
    const n = this.source.extract(this.scratch, CHUNK_FRAMES, this.readPos);
    if (n === 0) {
      this.exhausted = true;
      return;
    }
    this.readPos += n;
    this.st.inputBuffer.putSamples(this.scratch, 0, n);
    this.st.process();
  }

  /** Source frames still buffered inside SoundTouch (not yet audible). */
  buffered(tempo: number): number {
    const st = this.st;
    return st.inputBuffer.frameCount + st._intermediateBuffer.frameCount + st.outputBuffer.frameCount * tempo;
  }

  reset(frame: number): void {
    this.st.clear();
    this.readPos = frame;
    this.exhausted = false;
  }
}

/**
 * Mixes every stem on the audio thread: per-stem SoundTouch time-stretch,
 * gains, loop wrapping and position reporting. Keeping all of it here means
 * the main thread (React, canvas) can never starve the audio.
 */
class StemMixerProcessor extends AudioWorkletProcessor {
  private readonly voices = new Map<string, Voice>();
  private order: Voice[] = [];
  private playing = false;
  private tempo = 1;
  private loop: LoopFrames | null = null;
  private totalFrames = 0;
  private epoch = 0;
  private quanta = 0;

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent<MixerCommand>) => this.handle(e.data);
  }

  private post(event: MixerEvent): void {
    this.port.postMessage(event);
  }

  private handle(cmd: MixerCommand): void {
    switch (cmd.type) {
      case "load": {
        const voice = new Voice(new Int16Array(cmd.buffer, cmd.byteOffset, cmd.length));
        voice.st.tempo = this.tempo;
        voice.source.loop = this.loop;
        this.voices.set(cmd.id, voice);
        this.order = [...this.voices.values()];
        this.totalFrames = Math.max(this.totalFrames, voice.source.frames);
        break;
      }
      case "gain": {
        const voice = this.voices.get(cmd.id);
        if (voice) voice.target = cmd.value;
        break;
      }
      case "tempo":
        this.tempo = cmd.value;
        for (const v of this.order) v.st.tempo = cmd.value;
        break;
      case "loop":
        this.setLoop(cmd.loop);
        break;
      case "seek":
        this.epoch = cmd.epoch;
        for (const v of this.order) v.reset(cmd.frame);
        this.postPosition();
        break;
      case "play":
        this.playing = true;
        break;
      case "pause":
        this.epoch = cmd.epoch;
        this.playing = false;
        this.postPosition();
        break;
    }
  }

  private setLoop(loop: LoopFrames | null): void {
    for (const v of this.order) {
      // Already wrapped under the old loop: rebase so the position keeps
      // meaning "where we really are" once the loop changes or turns off.
      // No flush needed - what's buffered stays valid.
      const mapped = v.source.mapPosition(v.readPos);
      if (mapped !== v.readPos) v.readPos = mapped;
      v.source.loop = loop;
    }
    this.loop = loop;
  }

  /** Audible position: what's been fed minus what's still queued, folded into the loop. */
  private audibleVirtual(): number {
    const ref = this.order[0];
    return ref ? Math.max(0, ref.readPos - ref.buffered(this.tempo)) : 0;
  }

  private postPosition(): void {
    const ref = this.order[0];
    if (!ref) return;
    this.post({ type: "pos", frame: ref.source.mapPosition(this.audibleVirtual()), at: currentTime, epoch: this.epoch });
  }

  /** Top up the emptiest voice by one chunk - keeps the DSP spread across quanta. */
  private prefetch(): void {
    let lowest: Voice | null = null;
    for (const v of this.order) {
      if (!v.exhausted && v.ready < LOW_WATER_FRAMES && (!lowest || v.ready < lowest.ready)) lowest = v;
    }
    lowest?.feed();
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    if (this.order.length === 0) return true;

    if (!this.playing) {
      this.prefetch();
      return true;
    }

    const out = outputs[0];
    const left = out[0];
    const right = out[1] ?? out[0];
    const n = left.length;

    // Anything that can't cover this quantum must be fed now (first quantum
    // after a seek needs several chunks before SoundTouch emits audio).
    for (const v of this.order) {
      while (v.ready < n && !v.exhausted) v.feed();
    }
    this.prefetch();

    for (const v of this.order) {
      const ob = v.st.outputBuffer;
      const take = Math.min(n, ob.frameCount);
      const vec = ob.vector;
      let o = ob.startIndex;
      const g0 = v.gain;
      const g1 = v.target;
      if (g0 !== 0 || g1 !== 0) {
        const step = (g1 - g0) / n;
        let g = g0;
        for (let i = 0; i < take; i++) {
          g += step;
          left[i] += vec[o] * g;
          right[i] += vec[o + 1] * g;
          o += 2;
        }
      }
      ob.receive(take);
      v.gain = g1;
    }

    if (!this.loop && this.audibleVirtual() >= this.totalFrames) {
      this.playing = false;
      this.post({ type: "ended" });
    }

    if (++this.quanta % POST_EVERY_QUANTA === 0) this.postPosition();
    return true;
  }
}

registerProcessor("stem-mixer", StemMixerProcessor);

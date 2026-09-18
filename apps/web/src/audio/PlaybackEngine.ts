import { PitchShifter } from "soundtouchjs";
import { LoopingBufferSource } from "./LoopingBufferSource";

// Larger blocks trade latency for stability - with 6 simultaneous
// ScriptProcessorNodes (one per stem) this keeps CPU load reasonable.
const SCRIPT_BUFFER_SIZE = 4096;

/**
 * Sample-accurate-enough multi-track playback with pitch-preserving tempo
 * control. Each stem is decoded once into an AudioBuffer and wrapped in a
 * soundtouchjs PitchShifter (a pseudo-node backed by a ScriptProcessorNode
 * running the SoundTouch time-stretch algorithm). Unlike a plain
 * AudioBufferSourceNode, a PitchShifter isn't one-shot - connecting it
 * resumes playback from wherever its internal position is, and
 * `percentagePlayed` seeks live without needing to stop/recreate anything,
 * which is what makes tempo changes and loop-wrap jumps simple: change
 * `.tempo` or `.percentagePlayed` on every stem's shifter and they all pick
 * it up on their next audio callback.
 */
export class PlaybackEngine {
  private ctx: AudioContext;
  private masterGain: GainNode;
  private buffers = new Map<string, AudioBuffer>();
  private gains = new Map<string, GainNode>();
  private shifters = new Map<string, PitchShifter>();
  private sources = new Map<string, LoopingBufferSource>();
  private loop: { start: number; end: number } | null = null;

  private playing = false;
  private duration = 0;
  private tempo = 1;

  constructor() {
    this.ctx = new AudioContext();
    this.masterGain = this.ctx.createGain();
    this.masterGain.connect(this.ctx.destination);
  }

  async loadStems(
    stems: { id: string; url: string }[]
  ): Promise<{ buffers: Map<string, AudioBuffer>; duration: number }> {
    await Promise.all(
      stems.map(async (stem) => {
        const res = await fetch(stem.url);
        const arrayBuffer = await res.arrayBuffer();
        const buffer = await this.ctx.decodeAudioData(arrayBuffer);
        this.buffers.set(stem.id, buffer);

        const gain = this.ctx.createGain();
        gain.connect(this.masterGain);
        this.gains.set(stem.id, gain);

        const shifter = new PitchShifter(this.ctx, buffer, SCRIPT_BUFFER_SIZE);
        shifter.tempo = this.tempo;
        shifter.pitch = 1; // keep natural pitch regardless of tempo

        // Swap in a source that wraps loops inside the audio callback
        // instead of relying on seeks (see LoopingBufferSource).
        const source = new LoopingBufferSource(buffer);
        shifter._filter.sourceSound = source;
        this.sources.set(stem.id, source);
        this.applyLoopTo(source);

        this.shifters.set(stem.id, shifter);
      })
    );

    this.duration = Math.max(0, ...[...this.buffers.values()].map((b) => b.duration));
    return { buffers: this.buffers, duration: this.duration };
  }

  setGain(stemId: string, value: number): void {
    const gain = this.gains.get(stemId);
    if (gain) gain.gain.setTargetAtTime(value, this.ctx.currentTime, 0.01);
  }

  setMasterGain(value: number): void {
    this.masterGain.gain.setTargetAtTime(value, this.ctx.currentTime, 0.01);
  }

  setTempo(rate: number): void {
    this.tempo = rate;
    for (const shifter of this.shifters.values()) shifter.tempo = rate;
  }

  private applyLoopTo(source: LoopingBufferSource): void {
    const sr = this.ctx.sampleRate;
    const loop = this.loop;
    const start = loop ? Math.round(loop.start * sr) : 0;
    const end = loop ? Math.round(loop.end * sr) : 0;
    source.loop = loop && end > start ? { start, end } : null;
  }

  setLoop(region: { start: number; end: number } | null): void {
    this.loop = region;
    for (const [stemId, shifter] of this.shifters) {
      const source = this.sources.get(stemId);
      if (!source) continue;
      const virtual = shifter._filter.sourcePosition;
      const mapped = source.mapPosition(virtual);
      this.applyLoopTo(source);
      // Already wrapped under the old loop: rebase so the position keeps
      // meaning "where we really are" once the loop changes or turns off.
      if (virtual !== mapped) shifter._filter.sourcePosition = mapped;
    }
  }

  async play(): Promise<void> {
    if (this.playing) return;
    if (this.ctx.state === "suspended") await this.ctx.resume();
    for (const [stemId, shifter] of this.shifters) {
      const gain = this.gains.get(stemId);
      if (gain) shifter.connect(gain);
    }
    this.playing = true;
  }

  pause(): void {
    if (!this.playing) return;
    for (const shifter of this.shifters.values()) shifter.disconnect();
    this.playing = false;
  }

  seek(time: number): void {
    const fraction = this.duration > 0 ? Math.min(1, Math.max(0, time / this.duration)) : 0;
    for (const shifter of this.shifters.values()) shifter.percentagePlayed = fraction;
  }

  getCurrentTime(): number {
    const entry = this.shifters.entries().next().value;
    if (!entry) return 0;
    const [stemId, shifter] = entry;
    const source = this.sources.get(stemId);
    const position = source ? source.mapPosition(shifter.sourcePosition) : shifter.sourcePosition;
    return position / this.ctx.sampleRate;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  dispose(): void {
    for (const shifter of this.shifters.values()) {
      shifter.off();
      shifter.disconnect();
    }
    void this.ctx.close();
  }
}

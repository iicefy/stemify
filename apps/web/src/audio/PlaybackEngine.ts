import { PitchShifter } from "soundtouchjs";

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
    const first = this.shifters.values().next().value;
    return first ? first.timePlayed : 0;
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

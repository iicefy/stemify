import mixerWorkletUrl from "./mixer.worklet.ts?worker&url";
import { decodeToPcm16, parseWav16, type Pcm16 } from "./wav";
import { computePeakPyramid, type PeakPyramid } from "./waveform";
import type { LoopFrames, MixerCommand, MixerEvent } from "./mixerProtocol";

const yieldToMain = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * Multi-track playback with pitch-preserving tempo control.
 *
 * Stems stay as raw 16-bit PCM (parsed straight from the WAV, no decode, no
 * float copy) and are handed to a single AudioWorklet that time-stretches,
 * mixes and loops them on the audio thread. This class is just the main-thread
 * remote control: it forwards commands and extrapolates the playhead from the
 * worklet's periodic position reports.
 */
export class PlaybackEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private node: AudioWorkletNode | null = null;
  private disposed = false;

  private gains = new Map<string, number>();
  private masterValue = 1;
  private tempo = 1;
  private loop: { start: number; end: number } | null = null;

  private sampleRate = 44100;
  private totalFrames = 0;
  private playing = false;
  private epoch = 0;
  // Last known audible position and the context time it was true at.
  private lastFrame = 0;
  private lastAt = 0;

  onEnded: (() => void) | null = null;

  async loadStems(
    stems: { id: string; url: string }[]
  ): Promise<{ peaks: Map<string, PeakPyramid>; duration: number }> {
    const files = await Promise.all(
      stems.map(async (stem) => ({ id: stem.id, ab: await (await fetch(stem.url)).arrayBuffer() }))
    );
    this.assertAlive();

    const parsed = new Map<string, Pcm16 | null>(files.map((f) => [f.id, parseWav16(f.ab)]));
    const firstParsed = [...parsed.values()].find((p): p is Pcm16 => p !== null);
    this.sampleRate = firstParsed?.sampleRate ?? 44100;

    const ctx = new AudioContext({ sampleRate: this.sampleRate, latencyHint: "playback" });
    this.ctx = ctx;
    this.masterGain = ctx.createGain();
    this.masterGain.gain.value = this.masterValue;
    this.masterGain.connect(ctx.destination);

    await ctx.audioWorklet.addModule(mixerWorkletUrl);
    this.assertAlive();

    const node = new AudioWorkletNode(ctx, "stem-mixer", {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });
    node.port.onmessage = (e: MessageEvent<MixerEvent>) => this.onMixerEvent(e.data);
    node.connect(this.masterGain);
    this.node = node;

    const peaks = new Map<string, PeakPyramid>();
    for (const file of files) {
      // Anything that isn't 16-bit PCM at the shared rate goes through the
      // browser decoder (which also resamples to the context rate).
      let pcm = parsed.get(file.id) ?? null;
      if (!pcm || pcm.sampleRate !== this.sampleRate) pcm = await decodeToPcm16(file.ab, ctx);
      this.assertAlive();

      peaks.set(file.id, computePeakPyramid(pcm.samples, this.sampleRate));
      this.totalFrames = Math.max(this.totalFrames, pcm.frames);

      // Transferring hands the buffer to the audio thread with no copy.
      const { buffer, byteOffset, length } = pcm.samples;
      this.send({ type: "load", id: file.id, buffer: buffer as ArrayBuffer, byteOffset, length }, [buffer as ArrayBuffer]);
      await yieldToMain(); // keep the page responsive between stems
      this.assertAlive();
    }

    this.send({ type: "tempo", value: this.tempo });
    for (const [id, value] of this.gains) this.send({ type: "gain", id, value });
    if (this.loop) this.applyLoop();

    return { peaks, duration: this.totalFrames / this.sampleRate };
  }

  private assertAlive(): void {
    if (this.disposed) throw new Error("Playback engine disposed");
  }

  private send(cmd: MixerCommand, transfer?: Transferable[]): void {
    this.node?.port.postMessage(cmd, transfer ?? []);
  }

  private onMixerEvent(event: MixerEvent): void {
    if (event.type === "ended") {
      this.playing = false;
      this.lastFrame = this.totalFrames;
      this.onEnded?.();
      return;
    }
    // Reports from before the latest seek/pause describe a stale position.
    if (event.epoch !== this.epoch) return;
    this.lastFrame = event.frame;
    this.lastAt = event.at;
  }

  setGain(stemId: string, value: number): void {
    this.gains.set(stemId, value);
    this.send({ type: "gain", id: stemId, value });
  }

  setMasterGain(value: number): void {
    this.masterValue = value;
    if (this.masterGain && this.ctx) this.masterGain.gain.setTargetAtTime(value, this.ctx.currentTime, 0.01);
  }

  setTempo(rate: number): void {
    this.tempo = rate;
    this.send({ type: "tempo", value: rate });
  }

  setLoop(region: { start: number; end: number } | null): void {
    this.loop = region;
    this.applyLoop();
  }

  private applyLoop(): void {
    const sr = this.sampleRate;
    const loop = this.loop;
    const frames: LoopFrames | null =
      loop && Math.round(loop.end * sr) > Math.round(loop.start * sr)
        ? { start: Math.round(loop.start * sr), end: Math.round(loop.end * sr) }
        : null;
    this.send({ type: "loop", loop: frames });
  }

  async play(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx || this.playing) return;
    if (ctx.state === "suspended") await ctx.resume();
    this.lastAt = ctx.currentTime;
    this.playing = true;
    this.send({ type: "play" });
  }

  pause(): void {
    if (!this.playing) return;
    this.lastFrame = Math.round(this.getCurrentTime() * this.sampleRate);
    this.playing = false;
    this.send({ type: "pause", epoch: ++this.epoch });
  }

  seek(time: number): void {
    const frame = Math.min(this.totalFrames, Math.max(0, Math.round(time * this.sampleRate)));
    this.lastFrame = frame;
    this.lastAt = this.ctx?.currentTime ?? 0;
    this.send({ type: "seek", frame, epoch: ++this.epoch });
  }

  /** Called every animation frame: extrapolates from the last worklet report. */
  getCurrentTime(): number {
    const ctx = this.ctx;
    let time = this.lastFrame / this.sampleRate;
    if (this.playing && ctx) {
      time += Math.max(0, ctx.currentTime - this.lastAt) * this.tempo;
      const loop = this.loop;
      if (loop && loop.end > loop.start && time >= loop.end && this.lastFrame / this.sampleRate < loop.end) {
        // Extrapolated past the loop end before the worklet's next report.
        time = loop.start + ((time - loop.start) % (loop.end - loop.start));
      }
    }
    return Math.min(time, this.totalFrames / this.sampleRate);
  }

  isPlaying(): boolean {
    return this.playing;
  }

  dispose(): void {
    this.disposed = true;
    if (this.node) this.node.port.onmessage = null;
    void this.ctx?.close();
  }
}

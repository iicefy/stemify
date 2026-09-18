/** Messages between the main thread and the mixer AudioWorklet. */

export interface LoopFrames {
  start: number;
  end: number;
}

export type MixerCommand =
  | { type: "load"; id: string; buffer: ArrayBuffer; byteOffset: number; length: number }
  | { type: "gain"; id: string; value: number }
  | { type: "tempo"; value: number }
  | { type: "loop"; loop: LoopFrames | null }
  | { type: "seek"; frame: number; epoch: number }
  | { type: "play" }
  | { type: "pause"; epoch: number };

export type MixerEvent =
  /** Audible position (already mapped into the loop) at context time `at`. */
  | { type: "pos"; frame: number; at: number; epoch: number }
  | { type: "ended" };

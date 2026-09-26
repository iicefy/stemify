declare module "soundtouchjs" {
  export class FifoSampleBuffer {
    readonly vector: Float32Array;
    readonly startIndex: number;
    readonly frameCount: number;
    putSamples(samples: Float32Array, position?: number, numFrames?: number): void;
    receive(numFrames?: number): void;
  }

  export class SoundTouch {
    tempo: number;
    pitch: number;
    readonly inputBuffer: FifoSampleBuffer;
    readonly outputBuffer: FifoSampleBuffer;
    // Holds the transposer -> stretch hand-off; needed to measure buffered latency.
    readonly _intermediateBuffer: FifoSampleBuffer;
    process(): void;
    clear(): void;
  }
}

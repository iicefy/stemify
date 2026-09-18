declare module "soundtouchjs" {
  export class PitchShifter {
    constructor(context: AudioContext, buffer: AudioBuffer, bufferSize: number, onEnd?: () => void);
    tempo: number;
    pitch: number;
    pitchSemitones: number;
    rate: number;
    readonly duration: number;
    readonly sampleRate: number;
    timePlayed: number;
    sourcePosition: number;
    percentagePlayed: number;
    readonly formattedDuration: string;
    readonly formattedTimePlayed: string;
    readonly node: ScriptProcessorNode;
    _filter: { sourceSound: unknown; sourcePosition: number };
    connect(toNode: AudioNode): void;
    disconnect(): void;
    on(eventName: string, cb: (detail: unknown) => void): void;
    off(eventName?: string): void;
  }
}

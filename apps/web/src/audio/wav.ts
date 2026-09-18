export interface Pcm16 {
  /** Interleaved stereo. `buffer`/`byteOffset` let it be transferred without a copy. */
  samples: Int16Array;
  sampleRate: number;
  frames: number;
}

/**
 * Reads a 16-bit PCM WAV straight into an Int16Array view (no decode, no
 * copy). Returns null for anything else (float, 24-bit, compressed...) so the
 * caller can fall back to decodeAudioData.
 */
export function parseWav16(ab: ArrayBuffer): Pcm16 | null {
  if (ab.byteLength < 44) return null;
  const view = new DataView(ab);
  const tag = (o: number) => String.fromCharCode(view.getUint8(o), view.getUint8(o + 1), view.getUint8(o + 2), view.getUint8(o + 3));
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") return null;

  let format = 0;
  let channels = 0;
  let sampleRate = 0;
  let bits = 0;
  let offset = 12;
  while (offset + 8 <= ab.byteLength) {
    const id = tag(offset);
    const size = view.getUint32(offset + 4, true);
    const body = offset + 8;
    if (id === "fmt ") {
      format = view.getUint16(body, true);
      channels = view.getUint16(body + 2, true);
      sampleRate = view.getUint32(body + 4, true);
      bits = view.getUint16(body + 14, true);
    } else if (id === "data") {
      const isPcm = format === 1 || format === 0xfffe;
      if (!isPcm || bits !== 16 || (channels !== 1 && channels !== 2)) return null;
      const bytes = Math.min(size, ab.byteLength - body);
      const frames = Math.floor(bytes / (2 * channels));
      const length = frames * channels;
      let source = body % 2 === 0 ? new Int16Array(ab, body, length) : new Int16Array(ab.slice(body, body + length * 2));
      if (channels === 1) {
        const stereo = new Int16Array(frames * 2);
        for (let i = 0; i < frames; i++) stereo[i * 2] = stereo[i * 2 + 1] = source[i];
        source = stereo;
      }
      return { samples: source, sampleRate, frames };
    }
    offset = body + size + (size % 2);
  }
  return null;
}

/** Fallback for non-16-bit-PCM files: let the browser decode, then quantize. */
export async function decodeToPcm16(ab: ArrayBuffer, ctx: BaseAudioContext): Promise<Pcm16> {
  const audio = await ctx.decodeAudioData(ab);
  const left = audio.getChannelData(0);
  const right = audio.numberOfChannels > 1 ? audio.getChannelData(1) : left;
  const samples = new Int16Array(audio.length * 2);
  const q = (v: number) => Math.max(-32768, Math.min(32767, Math.round(v * 32768)));
  for (let i = 0; i < audio.length; i++) {
    samples[i * 2] = q(left[i]);
    samples[i * 2 + 1] = q(right[i]);
  }
  return { samples, sampleRate: audio.sampleRate, frames: audio.length };
}

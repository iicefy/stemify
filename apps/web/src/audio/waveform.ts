/**
 * Multi-resolution min/max peaks. Level 0 has one bucket per BASE_FRAMES
 * samples; each higher level merges pairs, so a lane can always draw about
 * one bucket per pixel - sharp when zoomed in, cheap when zoomed out.
 */
export interface PeakPyramid {
  baseFrames: number;
  sampleRate: number;
  /** Each level is [min, max, min, max, ...] in -1..1. */
  levels: Float32Array[];
}

const BASE_FRAMES = 128;
const COARSEST_BUCKETS = 256;

/** `samples` is interleaved stereo 16-bit; channels are averaged into one lane. */
export function computePeakPyramid(samples: Int16Array, sampleRate: number): PeakPyramid {
  const frames = samples.length >> 1;
  const buckets = Math.max(1, Math.ceil(frames / BASE_FRAMES));
  const base = new Float32Array(buckets * 2);
  const scale = 1 / 65536; // (l + r) / 2 / 32768

  for (let b = 0; b < buckets; b++) {
    const end = Math.min(frames, (b + 1) * BASE_FRAMES);
    let min = 0;
    let max = 0;
    for (let i = b * BASE_FRAMES * 2, stop = end * 2; i < stop; i += 2) {
      const v = samples[i] + samples[i + 1];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    base[b * 2] = min * scale;
    base[b * 2 + 1] = max * scale;
  }

  const levels = [base];
  while (levels[levels.length - 1].length / 2 > COARSEST_BUCKETS) {
    const prev = levels[levels.length - 1];
    const count = prev.length / 2;
    const next = new Float32Array(Math.ceil(count / 2) * 2);
    for (let i = 0; i < next.length / 2; i++) {
      const a = i * 2;
      const c = Math.min(a + 1, count - 1);
      next[i * 2] = Math.min(prev[a * 2], prev[c * 2]);
      next[i * 2 + 1] = Math.max(prev[a * 2 + 1], prev[c * 2 + 1]);
    }
    levels.push(next);
  }

  return { baseFrames: BASE_FRAMES, sampleRate, levels };
}

/** Level whose buckets are at most ~1px wide (or the finest available). */
export function pickPeakLevel(pyramid: PeakPyramid, pxPerSecond: number): { peaks: Float32Array; bucketSeconds: number } {
  const baseSeconds = pyramid.baseFrames / pyramid.sampleRate;
  let level = 0;
  while (level + 1 < pyramid.levels.length && baseSeconds * 2 ** (level + 1) * pxPerSecond <= 1) level++;
  return { peaks: pyramid.levels[level], bucketSeconds: baseSeconds * 2 ** level };
}

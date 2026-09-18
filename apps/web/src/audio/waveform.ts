/** Downsamples an AudioBuffer to [min, max] pairs for fast waveform drawing. */
export function computePeaks(buffer: AudioBuffer, buckets: number): Float32Array {
  const channelCount = buffer.numberOfChannels;
  const length = buffer.length;
  const samplesPerBucket = Math.max(1, Math.floor(length / buckets));
  const peaks = new Float32Array(buckets * 2);

  const left = buffer.getChannelData(0);
  const right = channelCount > 1 ? buffer.getChannelData(1) : null;
  const extraChannels: Float32Array[] = [];
  for (let c = 2; c < channelCount; c++) extraChannels.push(buffer.getChannelData(c));

  for (let b = 0; b < buckets; b++) {
    const start = b * samplesPerBucket;
    const end = Math.min(length, start + samplesPerBucket);
    let min = 0;
    let max = 0;

    // Stereo collapses to one lane by averaging channels. The mono and
    // stereo cases (nearly everything) get tight loops with no per-sample
    // channel iteration or division; >2 channels take the generic path.
    if (!right) {
      for (let i = start; i < end; i++) {
        const v = left[i];
        if (v < min) min = v;
        if (v > max) max = v;
      }
    } else if (extraChannels.length === 0) {
      for (let i = start; i < end; i++) {
        const v = (left[i] + right[i]) * 0.5;
        if (v < min) min = v;
        if (v > max) max = v;
      }
    } else {
      for (let i = start; i < end; i++) {
        let sum = left[i] + right[i];
        for (const channel of extraChannels) sum += channel[i];
        const v = sum / channelCount;
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }

    peaks[b * 2] = min;
    peaks[b * 2 + 1] = max;
  }

  return peaks;
}

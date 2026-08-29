/** Downsamples an AudioBuffer to [min, max] pairs for fast waveform drawing. */
export function computePeaks(buffer: AudioBuffer, buckets: number): Float32Array {
  const channelCount = buffer.numberOfChannels;
  const length = buffer.length;
  const samplesPerBucket = Math.max(1, Math.floor(length / buckets));
  const peaks = new Float32Array(buckets * 2);

  const channelData: Float32Array[] = [];
  for (let c = 0; c < channelCount; c++) channelData.push(buffer.getChannelData(c));

  for (let b = 0; b < buckets; b++) {
    const start = b * samplesPerBucket;
    const end = Math.min(length, start + samplesPerBucket);
    let min = 0;
    let max = 0;
    for (let i = start; i < end; i++) {
      // Average across channels so stereo content collapses to one lane.
      let sum = 0;
      for (let c = 0; c < channelCount; c++) sum += channelData[c][i];
      const value = sum / channelCount;
      if (value < min) min = value;
      if (value > max) max = value;
    }
    peaks[b * 2] = min;
    peaks[b * 2 + 1] = max;
  }

  return peaks;
}

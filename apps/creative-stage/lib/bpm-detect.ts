/**
 * BPM Detection — analyzes audio to extract tempo.
 * Uses Web Audio API's AnalyserNode with onset-detection algorithm.
 * Returns BPM estimate (60-200 range) from audio buffer peaks.
 */

export interface BpmResult {
  bpm: number;
  confidence: number; // 0-1
}

/**
 * Detect BPM from an audio URL or File.
 * Decodes the first 30 seconds, runs peak-interval analysis.
 */
export async function detectBpm(source: string | File): Promise<BpmResult> {
  const ctx = new OfflineAudioContext(1, 44100 * 30, 44100);

  let buffer: ArrayBuffer;
  if (typeof source === "string") {
    const resp = await fetch(source);
    buffer = await resp.arrayBuffer();
  } else {
    buffer = await source.arrayBuffer();
  }

  const audioBuffer = await ctx.decodeAudioData(buffer);
  const data = audioBuffer.getChannelData(0);

  // Low-pass filter the signal to focus on kick/bass hits
  const filtered = lowPassFilter(data, 44100, 150);

  // Find peaks (onset detection)
  const peaks = findPeaks(filtered, 44100);

  if (peaks.length < 4) {
    return { bpm: 120, confidence: 0.1 }; // fallback
  }

  // Calculate intervals between peaks
  const intervals: number[] = [];
  for (let i = 1; i < peaks.length; i++) {
    intervals.push(peaks[i] - peaks[i - 1]);
  }

  // Cluster intervals to find the dominant tempo
  const bpm = intervalsToBpm(intervals, 44100);
  const confidence = Math.min(peaks.length / 30, 1); // more peaks = more confident

  return { bpm: Math.round(bpm), confidence: Math.round(confidence * 100) / 100 };
}

/** Simple low-pass filter via moving average */
function lowPassFilter(data: Float32Array, sampleRate: number, cutoff: number): Float32Array {
  const windowSize = Math.floor(sampleRate / cutoff);
  const filtered = new Float32Array(data.length);
  let sum = 0;

  for (let i = 0; i < data.length; i++) {
    sum += Math.abs(data[i]);
    if (i >= windowSize) sum -= Math.abs(data[i - windowSize]);
    filtered[i] = sum / Math.min(i + 1, windowSize);
  }
  return filtered;
}

/** Find peaks above a dynamic threshold */
function findPeaks(data: Float32Array, sampleRate: number): number[] {
  const peaks: number[] = [];
  const minInterval = Math.floor(sampleRate * 0.15); // min 150ms between peaks (~400 BPM max)

  // Dynamic threshold: mean + 1.5 * std deviation
  let sum = 0, sumSq = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i];
    sumSq += data[i] * data[i];
  }
  const mean = sum / data.length;
  const std = Math.sqrt(sumSq / data.length - mean * mean);
  const threshold = mean + 1.5 * std;

  let lastPeak = -minInterval;
  for (let i = 1; i < data.length - 1; i++) {
    if (data[i] > threshold && data[i] > data[i - 1] && data[i] > data[i + 1] && i - lastPeak >= minInterval) {
      peaks.push(i);
      lastPeak = i;
    }
  }
  return peaks;
}

/** Convert peak intervals to BPM via histogram clustering */
function intervalsToBpm(intervals: number[], sampleRate: number): number {
  // Convert to BPM values
  const bpms = intervals.map((iv) => (60 * sampleRate) / iv).filter((b) => b >= 60 && b <= 200);

  if (bpms.length === 0) return 120;

  // Simple histogram with 1-BPM bins
  const bins = new Map<number, number>();
  for (const b of bpms) {
    const rounded = Math.round(b);
    bins.set(rounded, (bins.get(rounded) || 0) + 1);
  }

  // Also check half/double tempo
  for (const b of bpms) {
    const half = Math.round(b / 2);
    const dbl = Math.round(b * 2);
    if (half >= 60 && half <= 200) bins.set(half, (bins.get(half) || 0) + 0.5);
    if (dbl >= 60 && dbl <= 200) bins.set(dbl, (bins.get(dbl) || 0) + 0.5);
  }

  // Find most frequent
  let bestBpm = 120;
  let bestCount = 0;
  for (const [bpm, count] of bins) {
    if (count > bestCount) {
      bestCount = count;
      bestBpm = bpm;
    }
  }

  return bestBpm;
}

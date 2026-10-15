/**
 * DETERMINISTIC DSP.
 *
 * ⚠ NO ML DEPENDENCY. The repository has no audio-analysis library and one was **not added**, because the
 * brief asks for the minimum stack that reliably provides metadata, waveform features, beats, onsets and
 * energy — and permits structural analysis to be a justified method of our own. Every value here is
 * reproducible from the source and the configuration, which is what §31 requires and what an ML detector
 * would not guarantee.
 *
 * Nothing in this file knows about music. It is signal processing.
 */

/** in-place iterative radix-2 FFT. `re`/`im` length must be a power of two. */
export function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  if (n !== im.length || (n & (n - 1)) !== 0) throw new Error(`fft: length must be a power of two, got ${n}`);
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { const tr = re[i]!; re[i] = re[j]!; re[j] = tr; const ti = im[i]!; im[i] = im[j]!; im[j] = ti; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cwr = 1, cwi = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k]!, ui = im[i + k]!;
        const vr = re[i + k + len / 2]! * cwr - im[i + k + len / 2]! * cwi;
        const vi = re[i + k + len / 2]! * cwi + im[i + k + len / 2]! * cwr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const nwr = cwr * wr - cwi * wi; cwi = cwr * wi + cwi * wr; cwr = nwr;
      }
    }
  }
}

/** a Hann window of length n */
export function hann(n: number): Float64Array {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
  return w;
}

export interface Spectrum { magnitude: Float64Array; sampleRate: number; fftSize: number }
export function spectrumOf(frame: Float64Array, sampleRate: number): Spectrum {
  const n = frame.length;
  const re = Float64Array.from(frame), im = new Float64Array(n);
  fft(re, im);
  const half = n / 2;
  const magnitude = new Float64Array(half);
  for (let i = 0; i < half; i++) magnitude[i] = Math.hypot(re[i]!, im[i]!);
  return { magnitude, sampleRate, fftSize: n };
}
export const binFrequency = (bin: number, sampleRate: number, fftSize: number): number => (bin * sampleRate) / fftSize;

/** RMS of a frame */
export function rms(frame: Float64Array): number {
  let s = 0; for (let i = 0; i < frame.length; i++) s += frame[i]! * frame[i]!;
  return Math.sqrt(s / Math.max(1, frame.length));
}
/** half-wave-rectified spectral flux between two magnitude spectra */
export function spectralFlux(prev: Float64Array, cur: Float64Array): number {
  let s = 0; const n = Math.min(prev.length, cur.length);
  for (let i = 0; i < n; i++) { const d = cur[i]! - prev[i]!; if (d > 0) s += d; }
  return s / Math.max(1, n);
}
/** band energy, in bins */
export function bandEnergy(mag: Float64Array, loBin: number, hiBin: number): number {
  let s = 0; const a = Math.max(0, Math.floor(loBin)), b = Math.min(mag.length, Math.ceil(hiBin));
  for (let i = a; i < b; i++) s += mag[i]! * mag[i]!;
  return Math.sqrt(s / Math.max(1, b - a));
}

/** median absolute deviation — used for robust thresholds */
export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}
export function mad(xs: number[]): number {
  if (!xs.length) return 0;
  const m = median(xs);
  return median(xs.map((x) => Math.abs(x - m)));
}
export function mean(xs: number[]): number { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0; }

/**
 * PEAK PICKING with an adaptive threshold.
 *
 * The threshold is `median + k * MAD`, so it adapts to the material instead of being an absolute constant
 * tuned on one track. **No absolute threshold is claimed to be universal.**
 */
export function pickPeaks(values: number[], opts: { k?: number; minSeparation: number; floor?: number } = { minSeparation: 1 }): { index: number; value: number }[] {
  const k = opts.k ?? 1.6, floor = opts.floor ?? 0;
  const m = median(values), d = mad(values);
  const thresh = m + k * d;
  const out: { index: number; value: number }[] = [];
  for (let i = 1; i < values.length - 1; i++) {
    const v = values[i]!;
    if (v <= thresh || v <= floor) continue;
    if (v < values[i - 1]! || v < values[i + 1]!) continue;
    const last = out[out.length - 1];
    if (last && i - last.index < opts.minSeparation) { if (v > last.value) out[out.length - 1] = { index: i, value: v }; continue; }
    out.push({ index: i, value: v });
  }
  return out;
}

/**
 * AUTOCORRELATION of a strength envelope.
 *
 * Used for TEMPO, and deliberately returned as a **full lag curve** rather than a single winning lag — because
 * half-time and double-time are real perceptual readings and the caller must be able to see both.
 */
export function autocorrelation(x: number[], maxLag: number): Float64Array {
  const n = x.length;
  const m = mean(x);
  const c = new Float64Array(maxLag + 1);
  for (let lag = 0; lag <= maxLag; lag++) {
    let s = 0;
    for (let i = 0; i + lag < n; i++) s += (x[i]! - m) * (x[i + lag]! - m);
    c[lag] = s / Math.max(1, n - lag);
  }
  /** normalise by zero-lag so values are comparable across fixtures */
  const z = c[0] || 1;
  for (let i = 0; i <= maxLag; i++) c[i] = c[i]! / z;
  return c;
}

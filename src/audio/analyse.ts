/**
 * ANALYSIS PIPELINE — measured features, then inference. **The two layers are computed separately and never
 * merged**, because a measured rise is a fact and an "energy build" is a reading of it.
 */
import { hann, spectrumOf, rms, spectralFlux, bandEnergy, binFrequency, pickPeaks, autocorrelation, median, mean } from "./dsp.js";
import { AudioClock } from "./clock.js";
import { confidence, type MeasuredAudioFeatures, type EnergySample, type EnergyLandmark, type SilenceRegion, type BreathPoint,
  type InferredMusicStructure, type TempoEstimate, type BeatEvent, type OnsetEvent, type MeterEstimate, type DownbeatGrid, type Phrase, type Section, type Confidence } from "./analysis-types.js";

export interface AnalysisConfig {
  fftSize: number;
  hopSize: number;
  splitFrequencyHz: number;
  /** onset peak picking: threshold = median + k * MAD */
  onsetK: number;
  onsetMinSeparationSeconds: number;
  /** silence: RMS dB below the window peak */
  silenceThresholdDb: number;
  nearSilenceThresholdDb: number;
  breathMinRoomSeconds: number;
  /** tempo search range in BPM */
  tempoMinBpm: number;
  tempoMaxBpm: number;
  version: string;
}

export const DEFAULT_CONFIG: AnalysisConfig = {
  fftSize: 2048, hopSize: 512, splitFrequencyHz: 250,
  onsetK: 1.6, onsetMinSeparationSeconds: 0.05,
  silenceThresholdDb: -45, nearSilenceThresholdDb: -35,
  breathMinRoomSeconds: 0.35,
  tempoMinBpm: 50, tempoMaxBpm: 200,
  version: "4a.1.0",
};

// ---------------------------------------------------------------------------
// MEASURED
// ---------------------------------------------------------------------------

export interface FrameTable {
  times: number[];
  sampleIndex: number[];
  rmsArr: number[];
  flux: number[];
  low: number[];
  high: number[];
  mags: Float64Array[];
  rmsDb: number[];
}

export function frameTable(mono: Float64Array, clock: AudioClock, cfg: AnalysisConfig): FrameTable {
  const w = hann(cfg.fftSize);
  const times: number[] = [], sampleIndex: number[] = [], rmsArr: number[] = [], flux: number[] = [], low: number[] = [], high: number[] = [];
  const mags: Float64Array[] = [];
  const splitBin = cfg.splitFrequencyHz / (clock.sampleRate / cfg.fftSize);
  let prev: Float64Array | undefined;
  const frame = new Float64Array(cfg.fftSize);
  for (let start = 0; start + cfg.fftSize <= mono.length; start += cfg.hopSize) {
    for (let i = 0; i < cfg.fftSize; i++) frame[i] = mono[start + i]! * w[i]!;
    const sp = spectrumOf(frame, clock.sampleRate);
    times.push(start / clock.sampleRate);
    sampleIndex.push(start);
    rmsArr.push(rms(frame));
    flux.push(prev ? spectralFlux(prev, sp.magnitude) : 0);
    low.push(bandEnergy(sp.magnitude, 1, splitBin));
    high.push(bandEnergy(sp.magnitude, splitBin, sp.magnitude.length));
    mags.push(sp.magnitude);
    prev = sp.magnitude;
  }
  const peak = Math.max(1e-9, ...rmsArr);
  const rmsDb = rmsArr.map((r) => 20 * Math.log10(Math.max(1e-9, r) / peak));
  return { times, sampleIndex, rmsArr, flux, low, high, mags, rmsDb };
}

export function measure(table: FrameTable, clock: AudioClock, cfg: AnalysisConfig): MeasuredAudioFeatures {
  const energyCurve: EnergySample[] = table.times.map((t, i) => ({
    timeSeconds: +t.toFixed(6), sampleIndex: table.sampleIndex[i]!, rms: +table.rmsArr[i]!.toFixed(6),
    spectralFlux: +table.flux[i]!.toFixed(6), lowEnergy: +table.low[i]!.toFixed(6), highEnergy: +table.high[i]!.toFixed(6),
    rmsDb: +table.rmsDb[i]!.toFixed(2),
  }));

  /** ENERGY LANDMARKS — read off the curve with explicit evidence */
  const energyLandmarks: EnergyLandmark[] = [];
  const hopSeconds = cfg.hopSize / clock.sampleRate;
  const smooth = (xs: number[], win: number) => xs.map((_, i) => { let s = 0, n = 0; for (let j = Math.max(0, i - win); j <= Math.min(xs.length - 1, i + win); j++) { s += xs[j]!; n++; } return s / n; });
  const sm = smooth(table.rmsDb, 4);
  const slope = sm.map((v, i) => (i === 0 ? 0 : (v - sm[i - 1]!) / hopSeconds));
  const slopePeaks = pickPeaks(slope.map(Math.abs), { k: 2.0, minSeparation: Math.round(0.5 / hopSeconds) });
  for (const p of slopePeaks) {
    const kind: EnergyLandmark["kind"] = slope[p.index]! > 0 ? "rise" : "drop";
    energyLandmarks.push({ kind, timeSeconds: +table.times[p.index]!.toFixed(3), evidence: `${kind === "rise" ? "rise" : "drop"} of ${Math.abs(slope[p.index]!).toFixed(1)} dB/s sustained over ${(slopePeaks.length > 1 ? 0.5 : 0.5)}s`, confidence: confidence(Math.min(1, p.value / (Math.abs(median(slope.map(Math.abs))) * 6 + 1e-9))) });
  }
  /** peaks and near-silence from the curve itself */
  const rmsPeaks = pickPeaks(table.rmsArr, { k: 1.2, minSeparation: Math.round(0.4 / hopSeconds) });
  for (const p of rmsPeaks) energyLandmarks.push({ kind: "peak", timeSeconds: +table.times[p.index]!.toFixed(3), evidence: `local RMS maximum at ${table.rmsDb[p.index]!.toFixed(1)} dB`, confidence: confidence(Math.min(1, p.value / Math.max(1e-9, Math.max(...table.rmsArr)))) });
  for (let i = 0; i < table.rmsDb.length; i++) if (table.rmsDb[i]! <= cfg.silenceThresholdDb) energyLandmarks.push({ kind: "near-silence", timeSeconds: +table.times[i]!.toFixed(3), evidence: `RMS ${table.rmsDb[i]!.toFixed(1)} dB, at or below the configured ${cfg.silenceThresholdDb} dB`, confidence: confidence(0.9) });

  /** SILENCE REGIONS */
  const silenceRegions: SilenceRegion[] = [];
  { let start = -1;
    for (let i = 0; i <= table.rmsDb.length; i++) {
      const db = i < table.rmsDb.length ? table.rmsDb[i]! : 1e9;
      const quiet = db <= cfg.nearSilenceThresholdDb;
      if (quiet && start < 0) start = i;
      if (!quiet && start >= 0) {
        const endIdx = i - 1;
        if (endIdx >= start) {
          const seg = table.rmsDb.slice(start, endIdx + 1);
          const m = Math.max(...seg);
          silenceRegions.push({ startSeconds: +table.times[start]!.toFixed(3), endSeconds: +table.times[endIdx]!.toFixed(3), rmsDb: +m.toFixed(2), kind: m <= cfg.silenceThresholdDb ? "silence" : "near-silence" });
        }
        start = -1;
      }
    } }

  /** BREATH POINTS — silence regions AND large transients followed by space */
  const breathPoints: BreathPoint[] = [];
  for (const r of silenceRegions) {
    const room = r.endSeconds - r.startSeconds;
    if (room >= cfg.breathMinRoomSeconds) breathPoints.push({ timeSeconds: +((r.startSeconds + r.endSeconds) / 2).toFixed(3), evidence: `${r.kind} region of ${room.toFixed(2)}s at ${r.rmsDb} dB`, roomSeconds: +room.toFixed(3), confidence: confidence(r.kind === "silence" ? 0.9 : 0.6) });
  }
  {
    const fluxPeaks = pickPeaks(table.flux, { k: 2.2, minSeparation: Math.round(0.15 / hopSeconds) });
    for (const p of fluxPeaks) {
      /** space AFTER the transient, measured against the window peak */
      let quietRun = 0;
      for (let j = p.index + 1; j < table.rmsDb.length; j++) { if (table.rmsDb[j]! <= cfg.nearSilenceThresholdDb + 5) quietRun++; else break; }
      const room = quietRun * hopSeconds;
      if (room >= cfg.breathMinRoomSeconds) breathPoints.push({ timeSeconds: +table.times[p.index]!.toFixed(3), evidence: `large transient followed by ${room.toFixed(2)}s of space`, roomSeconds: +room.toFixed(3), confidence: confidence(0.55) });
    }
  }
  breathPoints.sort((a, b) => a.timeSeconds - b.timeSeconds);
  energyLandmarks.sort((a, b) => a.timeSeconds - b.timeSeconds);
  return { energyCurve, energyLandmarks, silenceRegions, breathPoints, windowSize: cfg.fftSize, hopSize: cfg.hopSize, splitFrequencyHz: cfg.splitFrequencyHz };
}

/**
 * THE CANONICAL ANALYSIS REPRESENTATION.
 *
 * ⚠ THE DISTINCTION THIS FILE EXISTS TO ENFORCE: **measured fact / inferred structure / director
 * interpretation are THREE LAYERS and are never collapsed into one field.**
 *
 *     MEASURED                RMS rises 6 dB over 4.2 s
 *     INFERRED                energy build
 *     DIRECTOR (Phase 4B)     increasing dramatic pressure
 *
 * Phase 4A produces the first two. **The third does not exist here** — and `EnergyLandmark` deliberately uses
 * `rise / peak / drop / plateau / release / near-silence` rather than `climax / tension / resolution`, because
 * those are directorial readings and not audio facts.
 */

// ---------------------------------------------------------------------------
// confidence
// ---------------------------------------------------------------------------

export const CONFIDENCE_BANDS = ["high", "medium", "low", "unknown"] as const;
export type ConfidenceBand = (typeof CONFIDENCE_BANDS)[number];

/**
 * CONFIDENCE — a numeric value with a semantic band.
 *
 * **No false precision:** the number is a detector's own score, and the band is the reading of it. Both are
 * kept because a band alone loses information and a number alone invites over-trust.
 */
export interface Confidence {
  value: number;
  band: ConfidenceBand;
}

export function confidence(value: number): Confidence {
  const v = Math.max(0, Math.min(1, value));
  return { value: +v.toFixed(4), band: v >= 0.75 ? "high" : v >= 0.45 ? "medium" : v > 0 ? "low" : "unknown" };
}

// ---------------------------------------------------------------------------
// MEASURED layer
// ---------------------------------------------------------------------------

/** A continuous energy sample. **Preserved as a curve; never collapsed to LOW/MEDIUM/HIGH here.** */
export interface EnergySample {
  timeSeconds: number;
  sampleIndex: number;
  /** root-mean-square of the analysis window */
  rms: number;
  /** spectral flux against the previous window */
  spectralFlux: number;
  /** energy below the split frequency */
  lowEnergy: number;
  /** energy above it */
  highEnergy: number;
  /** RMS in dB relative to the analysis-window peak, so the curve is comparable across tracks */
  rmsDb: number;
}

export type EnergyLandmarkKind = "rise" | "peak" | "drop" | "plateau" | "release" | "near-silence";

/** A candidate landmark found IN THE CURVE. Not a dramatic reading. */
export interface EnergyLandmark {
  kind: EnergyLandmarkKind;
  timeSeconds: number;
  /** the feature that produced it, so the landmark is auditable */
  evidence: string;
  confidence: Confidence;
}

export interface SilenceRegion {
  startSeconds: number;
  endSeconds: number;
  /** the region's RMS in dB, so "near-silence" is quantified rather than asserted */
  rmsDb: number;
  kind: "silence" | "near-silence" | "low-density";
}

/**
 * A BREATH POINT — a location that may allow a hold, cut, title, visual pause or dramatic reset.
 *
 * **A breath point is not necessarily literal silence.** It is derived from silence regions AND from large
 * transients followed by space, and the `evidence` field records which.
 */
export interface BreathPoint {
  timeSeconds: number;
  evidence: string;
  /** how much room the point offers, in seconds, as a measurable quantity */
  roomSeconds: number;
  confidence: Confidence;
}

/** RAW MEASURED FEATURES. Nothing here is an interpretation. */
export interface MeasuredAudioFeatures {
  energyCurve: EnergySample[];
  energyLandmarks: EnergyLandmark[];
  silenceRegions: SilenceRegion[];
  breathPoints: BreathPoint[];
  /** the analysis-window settings, so every measurement is reproducible */
  windowSize: number;
  hopSize: number;
  splitFrequencyHz: number;
}

// ---------------------------------------------------------------------------
// INFERRED layer
// ---------------------------------------------------------------------------

/** A pulse event. **BEAT is the metrical pulse; it is NOT an acoustic event.** */
export interface BeatEvent {
  timeSeconds: number;
  sampleIndex: number;
  beatIndex: number;
  /** the tracking score at this beat */
  confidence: Confidence;
  /** the inter-beat interval that follows, in seconds; `undefined` on the final beat */
  intervalToNext?: number;
}

/** An acoustic event. **ONSET is a transient in the signal; it need not fall on a beat.** */
export interface OnsetEvent {
  timeSeconds: number;
  sampleIndex: number;
  /** the detector's salience at this onset */
  strength: number;
  confidence: Confidence;
  /**
   * A coarse class ONLY when the evidence supports one. `undefined` means the analyser does not claim to know.
   *
   * ⚠ **No instrument classification is claimed.** The classes are broadband energy-shape descriptions derived
   * from the spectrum, not source labels, and the field is absent when the shape is ambiguous.
   */
  spectralShape?: "low-heavy" | "mid-heavy" | "high-heavy";
}

/**
 * TEMPO — **ambiguity is preserved rather than resolved.**
 *
 * ⚠ A detector returning 140 BPM does not mean the music is 140 BPM. Half-time and double-time readings are
 * perceptually real and the director needs to choose. `halfDoubleAmbiguous` is set when two candidate periods
 * both score highly, and **no average is ever produced** — averaging 70 and 140 into 105 is a fabricated tempo
 * that no listener would tap.
 */
export interface TempoEstimate {
  /** the primary estimate, in beats per minute */
  bpm: number;
  /** the period the estimate came from, in seconds */
  periodSeconds: number;
  confidence: Confidence;
  /** every candidate period that scored meaningfully, strongest first */
  candidates: { bpm: number; periodSeconds: number; score: number }[];
  /** true when a half or double reading is comparably supported */
  halfDoubleAmbiguous: boolean;
  /** the relationship between the primary and the strongest rival, when ambiguous */
  ambiguousWith?: { bpm: number; ratio: number };
  method: string;
}

/** BAR STRUCTURE — and `unknown` is a first-class answer. */
export interface MeterEstimate {
  beatsPerBar: number | null;
  meter: string;
  confidence: Confidence;
  /** true when no meter could be inferred; downstream must not fabricate a bar grid */
  unknown: boolean;
  evidence: string;
}

export interface DownbeatGrid {
  beatsPerBar: number | null;
  downbeats: BeatEvent[];
  confidence: Confidence;
  unknown: boolean;
}

/** A PHRASE boundary is INFERRED and always carries confidence. It is never objective. */
export interface Phrase {
  index: number;
  startSeconds: number;
  endSeconds: number;
  startConfidence: Confidence;
  endConfidence: Confidence;
  /** what produced the boundary, so it is auditable */
  evidence: string[];
}

export interface Section {
  index: number;
  /** a NEUTRAL label. Pop labels are not claimed unless the evidence supports them. */
  label: string;
  startSeconds: number;
  endSeconds: number;
  startConfidence: Confidence;
  endConfidence: Confidence;
  evidence: string[];
  /** mean RMS across the section, so its character is quantified */
  meanRmsDb: number;
}

/** INFERRED MUSICAL STRUCTURE. Every field here is an inference and says so by its confidence. */
export interface InferredMusicStructure {
  tempo: TempoEstimate;
  beats: BeatEvent[];
  meter: MeterEstimate;
  downbeats: DownbeatGrid;
  onsets: OnsetEvent[];
  phrases: Phrase[];
  sections: Section[];
}

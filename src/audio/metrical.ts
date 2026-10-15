/**
 * METRICAL ELEVATION — separating ACOUSTIC evidence from METRICAL evidence.
 *
 * ⚠ **THE ROOT CAUSE THIS ADDRESSES.** Every existing criterion in the chain measures an **acoustic** property:
 *
 *   - the DP tracker maximises **envelope energy along a path**
 *   - `strengthContrast` compares **onset strength at beats vs between them**
 *   - a phase sweep maximises **accumulated onset support**
 *
 * All three answer *"where is the sound?"*. **None answers *"where is the beat?"*** — and on syncopated material
 * the loudest events are deliberately **between** the beats. Fixture C is exactly this, and the real track is
 * the same failure class: the metric's winner (phase 0.133333 s) is selected by an objective that cannot see
 * metre, and its margin over the runner-up is only 1.3%.
 *
 * ## The metrical property the acoustic scores miss
 *
 * On metrical material, **beat positions are local maxima of event density**, and the positions immediately
 * around them are troughs — that is what a beat *is*. So for an inter-onset-interval histogram, one can ask
 * whether a candidate phase sits **on a density peak** and whether the region around it is **depleted**.
 *
 * **Crucially this is a property of the RELATIVE distribution, not of amplitude**, so it does not reward the
 * loudest events. An off-beat subdivision that is louder but less densely populated scores lower.
 *
 * ## And the veto the strength metric lacks
 *
 * `strengthContrast` returns a number that can pass by accident. A metrical claim additionally requires
 * **coverage** — if most beats carry no event at all, the grid is a hypothesis about silence. So the score is
 * multiplied by coverage, which makes abstention the natural outcome on ametric material.
 */
import { median, mean, mad } from "./dsp.js";
import type { OnsetEvent, BeatEvent, Confidence } from "./analysis-types.js";
import { confidence } from "./analysis-types.js";
import type { AudioClock } from "./clock.js";

export interface MetricalEvidence {
  phaseSeconds: number;
  bpm: number;
  /** the fraction of predicted beats that have an onset within the tolerance — the ABSTENTION GUARD */
  beatCoverage: number;
  /** IOI-histogram density at the candidate phase, normalised against the whole histogram */
  densityPeak: number;
  /** the same density at phases half a period away — a metrical phase must exceed it */
  troughDensity: number;
  /** densityPeak / troughDensity; below 1 the phase sits in a valley and is NOT a beat */
  peakToTrough: number;
  /** peakToTrough x beatCoverage — the combined criterion */
  metricalScore: number;
  /** the phase's share of ALL predicted positions at this period, so an off-beat grid is visible as low */
  phaseShare: number;
  confidence: Confidence;
  /** true when the evidence is too weak to assert a metre */
  abstained: boolean;
  reason: string;
  beats: BeatEvent[];
}

export interface MetricalSearchResult {
  candidates: MetricalEvidence[];
  best?: MetricalEvidence;
  /** true when the strongest candidate is not strong enough to assert a metre */
  abstained: boolean;
  /** the margin of the winner over the runner-up, as a fraction */
  margin: number;
  /** true when the winner is not separable from the runner-up */
  ambiguous: boolean;
  method: string;
}

export interface MetricalOptions {
  /** how many phase subdivisions of the period to evaluate */
  phaseSteps: number;
  /** onset tolerance for coverage, in seconds */
  toleranceSeconds: number;
  /** the density histogram's smoothing width, as a fraction of the period */
  smoothing: number;
  /** minimum peakToTrough for the phase to count as a beat */
  minPeakToTrough: number;
  /** minimum beat coverage to make any claim */
  minCoverage: number;
  /** margin below which the result is reported ambiguous */
  ambiguityMargin: number;
}

export const DEFAULT_METRICAL: MetricalOptions = {
  phaseSteps: 48,
  toleranceSeconds: 0.08,
  smoothing: 0.06,
  minPeakToTrough: 1.15,
  minCoverage: 0.35,
  ambiguityMargin: 1.15,
};

/**
 * Score every phase of a period by **metrical density structure**, not by amplitude.
 *
 * @param periodSeconds the candidate period
 * @param onsets all detected onsets — **only their TIMES are used**, so amplitude cannot influence the score
 */
export function searchMetricalPhase(periodSeconds: number, onsets: OnsetEvent[], clock: AudioClock, opts: MetricalOptions = DEFAULT_METRICAL): MetricalSearchResult {
  const duration = clock.durationSeconds;
  const times = onsets.map((o) => o.timeSeconds);
  if (!times.length || !(periodSeconds > 0)) {
    return { candidates: [], abstained: true, margin: 1, ambiguous: true, method: 'no onsets or no period' };
  }
  /** the density histogram over one period, from ALL onset phases modulo the period */
  const bins = 128;
  const hist = new Float64Array(bins);
  for (const t of times) { const p = ((t % periodSeconds) + periodSeconds) % periodSeconds; hist[Math.min(bins - 1, Math.floor((p / periodSeconds) * bins))]++; }
  /** circular smoothing, so the histogram has no seam at the period boundary */
  const half = Math.max(1, Math.round(opts.smoothing * bins));
  const smooth = new Float64Array(bins);
  for (let i = 0; i < bins; i++) { let s = 0; for (let k = -half; k <= half; k++) s += hist[(i + k + bins * 4) % bins]!; smooth[i] = s / (2 * half + 1); }
  const histMedian = median([...smooth]);

  const candidates: MetricalEvidence[] = [];
  for (let k = 0; k < opts.phaseSteps; k++) {
    const phase = (k / opts.phaseSteps) * periodSeconds;
    const beats: BeatEvent[] = [];
    for (let t = phase; t < duration; t += periodSeconds) beats.push({ timeSeconds: +t.toFixed(6), sampleIndex: clock.secondsToSamples(t), beatIndex: beats.length, confidence: confidence(1) });
    if (!beats.length) continue;
    const binAt = (p: number) => smooth[Math.min(bins - 1, Math.floor(((((p % periodSeconds) + periodSeconds) % periodSeconds) / periodSeconds) * bins))]!;
    const densityPeak = binAt(phase);
    /** the troughs half a period away, where an off-beat grid would place its notional beats */
    const troughDensity = (binAt(phase + periodSeconds / 2) + binAt(phase - periodSeconds / 2)) / 2;
    const peakToTrough = troughDensity > 1e-9 ? densityPeak / troughDensity : densityPeak > 1e-9 ? 99 : 0;
    /** coverage uses TIMES only — amplitude is deliberately ignored */
    let covered = 0;
    for (const b of beats) if (times.some((t) => Math.abs(t - b.timeSeconds) <= opts.toleranceSeconds)) covered++;
    const beatCoverage = covered / beats.length;
    const metricalScore = peakToTrough * beatCoverage;
    const phaseShare = covered / times.length;
    const abstained = peakToTrough < opts.minPeakToTrough || beatCoverage < opts.minCoverage;
    const reason = abstained
      ? `ABSTAINED: ${peakToTrough < opts.minPeakToTrough ? `peak-to-trough ${peakToTrough.toFixed(3)} below ${opts.minPeakToTrough}` : `beat coverage ${(beatCoverage * 100).toFixed(1)}% below ${(opts.minCoverage * 100).toFixed(0)}%`}`
      : `density peak ${densityPeak.toFixed(1)} vs trough ${troughDensity.toFixed(1)} (${peakToTrough.toFixed(3)}x) at ${(beatCoverage * 100).toFixed(1)}% coverage`;
    candidates.push({
      phaseSeconds: +phase.toFixed(6), bpm: +(60 / periodSeconds).toFixed(3), beatCoverage: +beatCoverage.toFixed(4),
      densityPeak: +densityPeak.toFixed(4), troughDensity: +troughDensity.toFixed(4), peakToTrough: +peakToTrough.toFixed(4),
      metricalScore: +metricalScore.toFixed(4), phaseShare: +phaseShare.toFixed(4),
      confidence: confidence(Math.min(1, (peakToTrough - 1) * 1.5) * Math.min(1, beatCoverage / 0.6)),
      abstained, reason, beats,
    });
  }
  candidates.sort((a, b) => b.metricalScore - a.metricalScore);
  const best = candidates[0];
  const runnerUp = candidates[1];
  const margin = best && runnerUp ? best.metricalScore / Math.max(1e-9, runnerUp.metricalScore) : 1;
  return {
    candidates: candidates.slice(0, 8), best,
    /** ⚠ the whole search abstains when its winner is weak — this is what stops false grids on ambient material */
    abstained: !best || best.abstained,
    margin: +margin.toFixed(4),
    ambiguous: margin < opts.ambiguityMargin,
    method: `metrical density search: phases are scored by peak-to-trough IOI density x beat coverage, using onset TIMES ONLY so amplitude cannot influence the result (${opts.phaseSteps} phases, ${bins}-bin circular histogram, smoothing ${opts.smoothing})`,
  };
}

/**
 * ACCENT HIERARCHY — the narrow repair §11 asks for.
 *
 * ⚠ **THE DIAGNOSIS GOT NARROWER AFTER MEASUREMENT.** The full metrical density search regressed three cases and
 * **failed to abstain on ambient material**, so it is not a defensible replacement. But the comparison isolated
 * where the baseline actually fails:
 *
 *   - the baseline's **period** is right (fixture C: 120.185 BPM, correct; the held-out 96 BPM: 95.703, correct)
 *   - the baseline's **phase** is what fails
 *
 * So the minimal change is to keep the DP tracker's timing and ask a **different question about its phase**:
 * **does the accent pattern REPEAT at the beat period?**
 *
 * On metrical material a strong event recurs every period, so the beat phase's onsets are more **evenly spread**
 * across the track than a decoy phase's. **The measure is the dispersion of the number of onsets per beat** —
 * a metrical phase gives a consistent count; an arbitrary phase gives an erratic one.
 *
 * This is still an acoustic measure, so it does **not** solve the syncopation case on its own. It is reported
 * with its own held-out result rather than asserted as a fix.
 */
export interface AccentHierarchy {
  phaseSeconds: number;
  /** onsets per beat, mean and the coefficient of variation across beats */
  onsetsPerBeatMean: number;
  onsetsPerBeatCv: number;
  /** 1/(1+cv) — 1 means perfectly even recurrence */
  recurrence: number;
  /** the fraction of beats that are the strongest within their own 2-beat neighbourhood */
  accentShare: number;
  score: number;
  abstained: boolean;
  reason: string;
  beats: BeatEvent[];
}

export function searchAccentHierarchy(periodSeconds: number, onsets: OnsetEvent[], clock: AudioClock, opts: MetricalOptions = DEFAULT_METRICAL): { candidates: AccentHierarchy[]; best?: AccentHierarchy; abstained: boolean; margin: number; method: string } {
  const duration = clock.durationSeconds;
  const times = onsets.map((o) => o.timeSeconds);
  const strengths = onsets.map((o) => o.strength);
  if (!times.length || !(periodSeconds > 0)) return { candidates: [], abstained: true, margin: 1, method: 'no onsets' };
  const out: AccentHierarchy[] = [];
  for (let k = 0; k < opts.phaseSteps; k++) {
    const phase = (k / opts.phaseSteps) * periodSeconds;
    const beats: BeatEvent[] = [];
    for (let t = phase; t < duration; t += periodSeconds) beats.push({ timeSeconds: +t.toFixed(6), sampleIndex: clock.secondsToSamples(t), beatIndex: beats.length, confidence: confidence(1) });
    if (beats.length < 4) continue;
    /** onsets per beat — a metrical phase collects a consistent number */
    const counts = beats.map((b) => times.filter((t) => t >= b.timeSeconds && t < b.timeSeconds + periodSeconds).length);
    const mu = mean(counts);
    const cv = mu > 0 ? Math.sqrt(mean(counts.map((c) => (c - mu) ** 2))) / mu : 1;
    const recurrence = mu > 0 ? 1 / (1 + cv) : 0;
    /** accent share: is the beat the strongest position in its own neighbourhood? */
    let accents = 0;
    for (const b of beats) {
      let at = 0, around = 0;
      for (let i = 0; i < times.length; i++) { const d = Math.abs(times[i] - b.timeSeconds); if (d <= opts.toleranceSeconds) at = Math.max(at, strengths[i]!); else if (d <= periodSeconds / 2) around = Math.max(around, strengths[i]!); }
      if (at > 0 && at >= around) accents++;
    }
    const accentShare = accents / beats.length;
    let covered = 0;
    for (const b of beats) if (times.some((t) => Math.abs(t - b.timeSeconds) <= opts.toleranceSeconds)) covered++;
    const beatCoverage = covered / beats.length;
    const score = recurrence * accentShare * beatCoverage;
    const abstained = beatCoverage < opts.minCoverage || accentShare < 0.2;
    out.push({ phaseSeconds: +phase.toFixed(6), onsetsPerBeatMean: +mu.toFixed(3), onsetsPerBeatCv: +cv.toFixed(4), recurrence: +recurrence.toFixed(4), accentShare: +accentShare.toFixed(4), score: +score.toFixed(4), abstained, reason: `recurrence ${recurrence.toFixed(3)} x accentShare ${accentShare.toFixed(3)} x coverage ${beatCoverage.toFixed(3)}`, beats });
  }
  out.sort((a, b) => b.score - a.score);
  const best = out[0], ru = out[1];
  return { candidates: out.slice(0, 8), best, abstained: !best || best.abstained, margin: best && ru ? +(best.score / Math.max(1e-9, ru.score)).toFixed(4) : 1, method: 'accent hierarchy: recurrence (inverse CV of onsets-per-beat) x accent share x beat coverage, onset times and strengths' };
}

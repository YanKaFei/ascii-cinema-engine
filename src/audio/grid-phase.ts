/**
 * BEAT-PHASE AS A FIRST-CLASS SEARCH DIMENSION.
 *
 * ⚠ THE FAILURE THIS EXISTS TO REPAIR, measured on fixture C:
 *
 *     interval error ≈ 0.15%      (tempo CORRECT)
 *     grid internally stable       (regular)
 *     beatAccuracy F1 = 0.000      (phase WRONG)
 *     phase offset   ≈ 220.6 ms
 *
 * **TEMPO CORRECTNESS ≠ BEAT-PHASE CORRECTNESS.** A stable wrong grid is the most dangerous output for
 * HARD_SYNC, because every interval-based metric passes while every click lands off the pulse.
 *
 * ## Why the previous attempt failed
 *
 * Phase 4A tried a phase fix by **sampling the envelope at each phase's predicted beat frames** and keeping the
 * best-scoring phase. It did not find the right phase and *degraded* fixture A (16 → 15 matched beats). The
 * reason is that point-sampling is the wrong statistic: a **single loud transient anywhere in the track** can
 * outvote the pulse, and a click track's flux is so sparse that one missed sample decides it.
 *
 * ## What phase inference needs instead
 *
 * A phase is supported when the beats **consistently** coincide with acoustic events, measured as
 * **periodic support accumulated over the whole track** — not as the value at a predicted index. This module
 * therefore evaluates each (period, phase) pair by summing onset strength in a **window** around every
 * predicted beat, normalised by the number of predicted beats, with **the same normalisation for every phase**
 * so phases are comparable.
 *
 * **Phases are ranked, never averaged.** If two phases are within a stated margin the ambiguity is reported,
 * because a perceptual ambiguity cannot be resolved by arithmetic.
 */
import { confidence, type BeatEvent, type OnsetEvent, type Confidence } from "./analysis-types.js";
import { AudioClock } from "./clock.js";

export interface BeatGridCandidate {
  /** the tempo this grid was built from */
  tempoCandidateBpm: number;
  periodSeconds: number;
  /** phase as an absolute time offset within the first period, in seconds */
  phaseOffsetSeconds: number;
  /** the beats this candidate would place */
  beats: BeatEvent[];
  /** accumulated acoustic support, the ranking statistic — comparable ACROSS phases */
  support: number;
  /** how many predicted beats carried any event at all */
  occupiedBeats: number;
  /** support restricted to the strongest events, so one loud transient cannot decide */
  robustSupport: number;
  confidence: Confidence;
  sourceMethod: string;
}

/**
 * THE PHASE-SUPPORT CURVE — the evidence the readiness gate needs.
 *
 * ⚠ **A STABLY WRONG PHASE IS STABLE.** Fixture C's grid has near-zero interval error and steady phase, so every
 * stability-based measure passes while the grid sits 220.6 ms off the pulse. **Phase STABILITY cannot detect
 * phase CORRECTNESS.**
 *
 * What can: whether the best phase is **separated from its rivals**. On a clear pulse one phase stands well
 * above its neighbours; where two phases compete — as on C, whose off-beat transients rival its on-beat events
 * — the best phase has a comparably strong neighbour, and **the grid must not be trusted for hard sync even
 * though it is perfectly stable.**
 */
export interface PhaseSupportCurve {
  /** support at each evaluated phase, for the winning period */
  support: number[];
  /** phase offsets, in seconds, matching `support` */
  phases: number[];
  /** the best phase's support divided by the best support at a phase at least 0.25 period away */
  separation: number;
  /** true when a rival phase more than a quarter period away scores within the margin */
  ambiguous: boolean;
  rival?: { phaseOffsetSeconds: number; support: number; ratio: number };
  periodSeconds: number;
}

export interface GridPhaseResult {
  /** every candidate, strongest first */
  candidates: BeatGridCandidate[];
  /**
   * ⚠ WHETHER THE PHASE SEARCH BYPASSED THE SUPPORT GATE.
   *
   * The support gate asks *"does the tracked pulse actually mark events stronger than the space between
   * them?"* and withholds the grid when it does not. **The phase search does not ask that question** — it
   * ranks (period, phase) pairs by accumulated support, so on the real track it produced an **82-beat grid at
   * 56.25 BPM (the HALF-TIME reading)** while the gate had rejected the 112.5 BPM pulse.
   *
   * **A grid the support gate rejected must not be published through a second door.**
   */
  bypassedSupportGate?: boolean;
  /** the support verdict this search was told about, if any */
  supportNote?: string;
  /** ⚠ the phase-support curve for the winning period — REQUIRED, because stability cannot detect correctness */
  curve?: PhaseSupportCurve;
  /** the chosen grid, or undefined when nothing is supported */
  best?: BeatGridCandidate;
  /** true when a rival phase is within the margin — a PERCEPTUAL ambiguity, reported not resolved */
  phaseAmbiguous: boolean;
  ambiguityWith?: { phaseOffsetSeconds: number; support: number; ratio: number };
  /** how many phase candidates were evaluated for the winning period */
  phasesEvaluated: number;
}

export interface PhaseSearchOptions {
  /** window around each predicted beat in which an event counts as support */
  windowSeconds: number;
  /** how many phase subdivisions of the period to evaluate */
  phaseSteps: number;
  /** margin within which a rival phase makes the result ambiguous */
  ambiguityMargin: number;
}

export const DEFAULT_PHASE_SEARCH: PhaseSearchOptions = {
  windowSeconds: 0.09,
  phaseSteps: 24,
  ambiguityMargin: 0.88,
};

/**
 * Score one (period, phase) pair.
 *
 * ⚠ **The support statistic is accumulated, and it is normalised identically for every phase** so candidates
 * are directly comparable. `robustSupport` repeats the calculation using only events above the median
 * strength, so a single loud transient cannot carry a phase on its own.
 */
export function scorePhase(onsets: OnsetEvent[], periodSeconds: number, phaseSeconds: number, durationSeconds: number, opts: PhaseSearchOptions): { support: number; robustSupport: number; occupiedBeats: number; beats: BeatEvent[]; times: number[] } {
  const times: number[] = [];
  for (let t = phaseSeconds; t < durationSeconds; t += periodSeconds) times.push(t);
  if (!times.length) return { support: 0, robustSupport: 0, occupiedBeats: 0, beats: [], times };
  const strengths = onsets.map((o) => o.strength).sort((a, b) => a - b);
  const medianStrength = strengths.length ? strengths[strengths.length >> 1]! : 0;
  let support = 0, robust = 0, occupied = 0;
  for (const t of times) {
    let best = 0, bestRobust = 0;
    for (const o of onsets) {
      const d = Math.abs(o.timeSeconds - t);
      if (d > opts.windowSeconds) continue;
      /** a triangular window weights an exactly-coincident event highest, so phase resolution is real */
      const w = 1 - d / opts.windowSeconds;
      const v = o.strength * w;
      if (v > best) best = v;
      if (o.strength >= medianStrength && v > bestRobust) bestRobust = v;
    }
    if (best > 0) occupied++;
    support += best;
    robust += bestRobust;
  }
  /** normalise by the number of PREDICTED beats, so a longer or shorter grid is comparable */
  return { support: support / times.length, robustSupport: robust / times.length, occupiedBeats: occupied, beats: [], times };
}

/**
 * SEARCH TEMPO AND PHASE SEPARATELY — the core of this phase.
 *
 * For each tempo candidate from the analysis, **every phase subdivision is evaluated**, and the candidates are
 * ranked by accumulated acoustic support. **Phase is never averaged and never derived from one detected
 * onset.**
 */
export function searchGridPhase(
  tempoCandidates: { bpm: number; periodSeconds: number; score: number }[],
  onsets: OnsetEvent[],
  clock: AudioClock,
  opts: PhaseSearchOptions = DEFAULT_PHASE_SEARCH,
  maxTempoCandidates = 3,
  /**
   * ⚠ THE SUPPORT VERDICT MUST BE PASSED IN, so the search cannot publish a grid the gate rejected.
   * When `pulseSupported === false` the search still runs — the evidence is useful — but it reports
   * `bypassedSupportGate: true` and **the caller must withhold the published grid.**
   */
  gate?: { pulseSupported: boolean; note: string },
): GridPhaseResult {
  const duration = clock.durationSeconds;
  const all: BeatGridCandidate[] = [];
  let phasesEvaluated = 0;
  for (const tc of tempoCandidates.slice(0, maxTempoCandidates)) {
    if (!(tc.periodSeconds > 0)) continue;
    let bestForPeriod: { phase: number; s: ReturnType<typeof scorePhase> } | undefined;
    for (let k = 0; k < opts.phaseSteps; k++) {
      const phase = (k / opts.phaseSteps) * tc.periodSeconds;
      const s = scorePhase(onsets, tc.periodSeconds, phase, duration, opts);
      phasesEvaluated++;
      if (!bestForPeriod || s.support > bestForPeriod.s.support) bestForPeriod = { phase, s };
    }
    if (!bestForPeriod || bestForPeriod.s.support <= 0) continue;
    const { phase, s } = bestForPeriod;
    const beats: BeatEvent[] = s.times.map((t, i) => ({
      timeSeconds: +t.toFixed(6), sampleIndex: clock.secondsToSamples(t), beatIndex: i,
      confidence: confidence(Math.min(1, s.support * 4)),
    }));
    for (let i = 0; i < beats.length - 1; i++) beats[i]!.intervalToNext = +(beats[i + 1]!.timeSeconds - beats[i]!.timeSeconds).toFixed(6);
    all.push({
      tempoCandidateBpm: +tc.bpm.toFixed(3), periodSeconds: +tc.periodSeconds.toFixed(6),
      phaseOffsetSeconds: +phase.toFixed(6), beats, support: +s.support.toFixed(6),
      occupiedBeats: s.occupiedBeats, robustSupport: +s.robustSupport.toFixed(6),
      confidence: confidence(Math.min(1, (s.support * 3 + s.robustSupport * 3) / 2)),
      sourceMethod: `phase search: ${opts.phaseSteps} subdivisions of ${tc.periodSeconds.toFixed(4)}s, triangular support window ${(opts.windowSeconds * 1000).toFixed(0)}ms, accumulated over ${s.times.length} predicted beats`,
    });
  }
  /**
   * Build the phase-support curve for the WINNING period, so a rival phase can be seen rather than merely
   * scored. This is the quantity a readiness verdict must consult.
   */
  let curve: PhaseSupportCurve | undefined;
  if (all.length) {
    const winner = all.reduce((b, c) => (c.support > b.support ? c : b), all[0]!);
    const period = winner.periodSeconds;
    const support: number[] = [], phases: number[] = [];
    for (let k = 0; k < opts.phaseSteps; k++) {
      const phase = (k / opts.phaseSteps) * period;
      const s = scorePhase(onsets, period, phase, duration, opts);
      support.push(+s.support.toFixed(6)); phases.push(+phase.toFixed(6));
    }
    const bestVal = Math.max(...support);
    const bestIdx = support.indexOf(bestVal);
    let rivalIdx = -1, rivalVal = -Infinity;
    for (let k = 0; k < support.length; k++) {
      const sep = Math.min(Math.abs(k - bestIdx), support.length - Math.abs(k - bestIdx)) / support.length;
      if (sep < 0.25) continue;
      if (support[k]! > rivalVal) { rivalVal = support[k]!; rivalIdx = k; }
    }
    const separation = rivalVal > 1e-9 ? bestVal / rivalVal : bestVal > 1e-9 ? 99 : 0;
    const ambiguous = rivalIdx >= 0 && separation < 1.25;
    curve = {
      support, phases, separation: +separation.toFixed(4), ambiguous, periodSeconds: period,
      ...(rivalIdx >= 0 ? { rival: { phaseOffsetSeconds: phases[rivalIdx]!, support: rivalVal, ratio: +(rivalVal / Math.max(1e-9, bestVal)).toFixed(4) } } : {}),
    };
  }
  all.sort((a, b) => b.support + b.robustSupport - (a.support + a.robustSupport));
  const best = all[0];
  let phaseAmbiguous = false, ambiguityWith: GridPhaseResult["ambiguityWith"];
  if (best) {
    const rival = all.find((c) => c !== best && Math.abs(c.periodSeconds - best.periodSeconds) / best.periodSeconds < 0.05 && Math.abs(c.phaseOffsetSeconds - best.phaseOffsetSeconds) > best.periodSeconds * 0.2);
    if (rival && rival.support >= best.support * opts.ambiguityMargin) {
      phaseAmbiguous = true;
      ambiguityWith = { phaseOffsetSeconds: rival.phaseOffsetSeconds, support: rival.support, ratio: +(rival.support / best.support).toFixed(4) };
    }
  }
  return {
    candidates: all.slice(0, 6), curve, best, phaseAmbiguous, ambiguityWith, phasesEvaluated,
    ...(gate ? { bypassedSupportGate: !gate.pulseSupported, supportNote: gate.note } : {}),
  };
}

/**
 * LOCAL PHASE STABILITY — does the phase hold across the track?
 *
 * ⚠ **One whole-track confidence is not acceptable when different sections behave differently.** A grid may be
 * locked for the first thirty seconds and drift afterwards, and the Director must be able to know **where**
 * HARD_SYNC is safe.
 */
export interface PhaseWindow {
  startSeconds: number;
  endSeconds: number;
  support: number;
  /** the phase that locally best fits, relative to the global grid */
  localPhaseOffsetSeconds: number;
  /** drift of the local phase from the global one, in seconds */
  phaseDriftSeconds: number;
  beatsInWindow: number;
}

export function localPhaseStability(grid: BeatGridCandidate, onsets: OnsetEvent[], clock: AudioClock, windowSeconds = 10, opts: PhaseSearchOptions = DEFAULT_PHASE_SEARCH): PhaseWindow[] {
  const duration = clock.durationSeconds;
  const out: PhaseWindow[] = [];
  for (let start = 0; start < duration; start += windowSeconds) {
    const end = Math.min(duration, start + windowSeconds);
    if (end - start < 2) continue;
    const localOnsets = onsets.filter((o) => o.timeSeconds >= start && o.timeSeconds < end);
    const globalInWindow = grid.beats.filter((b) => b.timeSeconds >= start && b.timeSeconds < end);
    if (!globalInWindow.length) continue;
    /** re-run the phase search inside the window, anchored near the global phase */
    const basePhase = ((grid.phaseOffsetSeconds - start) % grid.periodSeconds + grid.periodSeconds) % grid.periodSeconds;
    let bestPhase = basePhase, bestSupport = -1;
    for (let k = -6; k <= 6; k++) {
      const phase = ((basePhase + (k / 12) * grid.periodSeconds) % grid.periodSeconds + grid.periodSeconds) % grid.periodSeconds;
      const s = scorePhase(localOnsets, grid.periodSeconds, start + phase, end, { ...opts, windowSeconds: Math.min(opts.windowSeconds, (end - start) / 4) });
      if (s.support > bestSupport) { bestSupport = s.support; bestPhase = phase; }
    }
    const drift = bestPhase - basePhase;
    out.push({
      startSeconds: +start.toFixed(3), endSeconds: +end.toFixed(3), support: +bestSupport.toFixed(6),
      localPhaseOffsetSeconds: +(start + bestPhase).toFixed(6),
      /** wrap into [-period/2, period/2] so a drift across the wrap point is not reported as a jump */
      phaseDriftSeconds: +(((drift + grid.periodSeconds * 1.5) % grid.periodSeconds) - grid.periodSeconds * 0.5).toFixed(6),
      beatsInWindow: globalInWindow.length,
    });
  }
  return out;
}

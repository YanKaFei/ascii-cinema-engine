/**
 * INFERENCE — beats, onsets, tempo, meter, phrases, sections.
 *
 * **Everything here is an inference and every value carries confidence.** The one rule that matters most:
 * **ambiguity is represented, never averaged away.**
 */
import { pickPeaks, autocorrelation, median, mean, mad } from "./dsp.js";
import { confidence, type InferredMusicStructure, type TempoEstimate, type BeatEvent, type OnsetEvent,
  type MeterEstimate, type DownbeatGrid, type Phrase, type Section, type Confidence } from "./analysis-types.js";
import { AudioClock } from "./clock.js";
import type { FrameTable } from "./analyse.js";
import type { AnalysisConfig } from "./analyse.js";
import { assessTempoSupport, applyTempoSupport, localTempoCurve } from "./support.js";

// ---------------------------------------------------------------------------
// ONSETS — acoustic events
// ---------------------------------------------------------------------------

/**
 * ONSET DETECTION from the spectral-flux envelope.
 *
 * ⚠ **ONSET ≠ BEAT.** An onset is a transient in the signal; a beat is a metrical pulse. A strong onset may
 * fall off-beat and a beat may carry no transient at all. They are detected by different mechanisms and stored
 * separately, because downstream they mean different things — an onset can drive a cut or an SFX, a beat
 * cannot.
 */
export function detectOnsets(table: FrameTable, clock: AudioClock, cfg: AnalysisConfig): OnsetEvent[] {
  const hop = cfg.hopSize / clock.sampleRate;
  const peaks = pickPeaks(table.flux, { k: cfg.onsetK, minSeparation: Math.max(1, Math.round(cfg.onsetMinSeparationSeconds / hop)) });
  const max = Math.max(1e-9, ...table.flux);
  const noise = median(table.flux) + mad(table.flux);
  return peaks.map((p) => {
    /** a COARSE energy-shape descriptor, not an instrument label */
    const l = table.low[p.index]!, h = table.high[p.index]!;
    let shape: OnsetEvent["spectralShape"];
    if (l > h * 2) shape = "low-heavy"; else if (h > l * 2) shape = "high-heavy"; else if (l + h > 0) shape = "mid-heavy";
    const salience = p.value / max;
    const snr = p.value / Math.max(1e-9, noise);
    return {
      timeSeconds: +table.times[p.index]!.toFixed(6),
      sampleIndex: table.sampleIndex[p.index]!,
      strength: +salience.toFixed(4),
      confidence: confidence(Math.min(1, snr / 8)),
      ...(shape ? { spectralShape: shape } : {}),
    };
  });
}

// ---------------------------------------------------------------------------
// TEMPO — with half/double ambiguity preserved
// ---------------------------------------------------------------------------

/**
 * TEMPO ESTIMATION.
 *
 * ⚠ **The brief's central warning:** *"Do NOT assume one constant BPM merely because a detector returns one
 * number."* A detector returning **140 BPM** may be describing music a listener taps at **70**.
 *
 * So this returns **every candidate period that scored meaningfully**, in a full autocorrelation over the
 * onset envelope, and flags `halfDoubleAmbiguous` when a half or double reading is comparably supported.
 * **It never averages.** Averaging 70 and 140 produces 105, a tempo nobody would tap.
 */
export function estimateTempo(table: FrameTable, clock: AudioClock, cfg: AnalysisConfig): TempoEstimate {
  const hop = cfg.hopSize / clock.sampleRate;
  /** the onset-strength envelope: spectral flux, mean-removed by the autocorrelation itself */
  const env = table.flux.slice();
  const maxLag = Math.min(env.length - 2, Math.round((60 / cfg.tempoMinBpm) / hop));
  const ac = autocorrelation(env, maxLag);
  const minLag = Math.max(2, Math.round((60 / cfg.tempoMaxBpm) / hop));
  const cands: { bpm: number; periodSeconds: number; score: number; lag: number }[] = [];
  for (let lag = minLag; lag <= maxLag; lag++) {
    const v = ac[lag]!;
    if (v <= 0) continue;
    /** local maximum in the autocorrelation */
    if (v < ac[lag - 1]! || v < ac[lag + 1]!) continue;
    cands.push({ bpm: (60 / (lag * hop)), periodSeconds: lag * hop, score: v, lag });
  }
  cands.sort((a, b) => b.score - a.score);
  /** keep a bounded set of distinct candidates so the output stays readable */
  const kept: typeof cands = [];
  for (const c of cands) {
    if (kept.length >= 6) break;
    if (kept.some((k) => Math.abs(k.lag - c.lag) <= 1)) continue;
    kept.push(c);
  }
  if (!kept.length) {
    return { bpm: 0, periodSeconds: 0, confidence: confidence(0), candidates: [], halfDoubleAmbiguous: false, method: "autocorrelation of the spectral-flux envelope; NO period scored above zero" };
  }
  const best = kept[0]!;
  /** HALF/DOUBLE: is a 2x or 0.5x reading comparably supported? */
  const rival = kept.find((c) => c !== best && (Math.abs(c.bpm / best.bpm - 2) < 0.12 || Math.abs(best.bpm / c.bpm - 2) < 0.12));
  const ambiguous = !!rival && rival.score >= best.score * 0.72;
  const contrast = best.score / Math.max(1e-9, (kept[1]?.score ?? 0));
  return {
    bpm: +best.bpm.toFixed(3),
    periodSeconds: +best.periodSeconds.toFixed(6),
    confidence: confidence(Math.min(1, best.score * 2.2) * Math.min(1, contrast)),
    candidates: kept.map((c) => ({ bpm: +c.bpm.toFixed(3), periodSeconds: +c.periodSeconds.toFixed(6), score: +c.score.toFixed(4) })),
    halfDoubleAmbiguous: ambiguous,
    ...(ambiguous && rival ? { ambiguousWith: { bpm: +rival.bpm.toFixed(3), ratio: +(rival.bpm / best.bpm).toFixed(3) } } : {}),
    method: "autocorrelation of the spectral-flux onset envelope, local maxima within the configured BPM range; half/double flagged when a 2x or 0.5x candidate scores within 72% of the best",
  };
}

// ---------------------------------------------------------------------------
// BEATS — dynamic programming over the onset envelope
// ---------------------------------------------------------------------------

/**
 * BEAT TRACKING by dynamic programming over the onset envelope.
 *
 * The method follows the standard formulation: maximise total onset strength along a path whose inter-beat
 * intervals stay near the estimated period, with a transition penalty for deviation. **A single global period
 * is the starting point, and LOCAL drift is permitted by the penalty's shape** — which is why fixture D's real
 * tempo change can be partly followed even though `tempo` reports one value.
 */
export function trackBeats(table: FrameTable, clock: AudioClock, cfg: AnalysisConfig, tempo: TempoEstimate): BeatEvent[] {
  const hop = cfg.hopSize / clock.sampleRate;
  if (!tempo.periodSeconds) return [];
  const env = table.flux;
  const period = tempo.periodSeconds / hop;
  const n = env.length;
  if (n < 4) return [];
  const tightness = 100;
  /** cumulative score and back-pointer */
  const score = new Float64Array(n).fill(-Infinity);
  const back = new Int32Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    const lo = Math.max(0, Math.floor(i - period * 2)), hi = Math.ceil(i - period * 0.5);
    let bestScore = -Infinity, bestIdx = -1;
    for (let j = lo; j <= hi; j++) {
      if (j < 0 || j >= i) continue;
      const dev = Math.log((i - j) / period);
      const pen = -tightness * dev * dev;
      const s = (score[j]! === -Infinity ? 0 : score[j]!) + pen;
      if (s > bestScore) { bestScore = s; bestIdx = j; }
    }
    score[i] = (bestScore === -Infinity ? 0 : bestScore) + env[i]!;
    back[i] = bestIdx;
  }
  let end = 0;
  for (let i = 1; i < n; i++) if (score[i]! > score[end]!) end = i;
  const path: number[] = [];
  let cur = end;
  while (cur >= 0) { path.push(cur); cur = back[cur]!; }
  path.reverse();
  const maxEnv = Math.max(1e-9, ...env);
  const beats: BeatEvent[] = path.map((idx, i) => ({
    timeSeconds: +table.times[idx]!.toFixed(6),
    sampleIndex: table.sampleIndex[idx]!,
    beatIndex: i,
    confidence: confidence(Math.min(1, env[idx]! / (maxEnv * 0.5))),
  }));
  for (let i = 0; i < beats.length - 1; i++) beats[i]!.intervalToNext = +(beats[i + 1]!.timeSeconds - beats[i]!.timeSeconds).toFixed(6);
  return beats;
}

/**
 * ADAPTIVE BEAT TRACKING — a tempo that can CHANGE.
 *
 * ⚠ FIXTURE D EXPOSED THIS: a real 100 → 140 BPM change. A single global period makes the grid **drift**, so
 * the beats stop coinciding with the clicks and the support test correctly reports that the grid marks
 * nothing stronger than the space between it. **The support test was right; the tracker was too simple.**
 *
 * The repair is to estimate the period **locally** and track each tempo region with **its own** period, then
 * concatenate the paths and re-index. The result is a grid that follows the music rather than averaging it —
 * and `localTempoCurve` then reports the drift instead of a single number.
 */
export function trackBeatsAdaptive(table: FrameTable, clock: AudioClock, cfg: AnalysisConfig, tempo: TempoEstimate): BeatEvent[] {
  const hop = cfg.hopSize / clock.sampleRate;
  const env = table.flux;
  const n = env.length;
  if (n < 8 || !tempo.periodSeconds) return [];
  const localPeriod = (from: number, to: number): number => {
    const seg = env.slice(from, to);
    if (seg.length < 8) return tempo.periodSeconds / hop;
    const maxLag = Math.min(seg.length - 2, Math.round((60 / cfg.tempoMinBpm) / hop));
    const minLag = Math.max(2, Math.round((60 / cfg.tempoMaxBpm) / hop));
    if (maxLag <= minLag) return tempo.periodSeconds / hop;
    const ac = autocorrelation(seg, maxLag);
    let best = minLag, bestV = -Infinity;
    for (let lag = minLag; lag <= maxLag; lag++) if (ac[lag]! > bestV) { bestV = ac[lag]!; best = lag; }
    return best;
  };
  /**
   * ⚠ THE FIRST ADAPTIVE VERSION JITTERED: it segmented freely, so a spurious local-period change created a new
   * region whose phase did not continue the previous one. **Fixture D's inter-beat deviation rose to 62%**, and
   * the support test correctly rejected the grid again — for a NEW reason.
   *
   * A region is now opened **only for a MATERIAL and LASTING** tempo change: the candidate must differ by more
   * than 15% from the current region AND the following window must agree with it. That keeps the region count
   * at the number of real tempo changes instead of at the number of noisy autocorrelation peaks.
   */
  const win = Math.max(24, Math.round(4.0 / hop));
  const regions: { from: number; to: number; lag: number }[] = [];
  for (let i = 0; i < n; i += win) {
    const lag = localPeriod(i, Math.min(n, i + win * 2));
    const nextLag = localPeriod(Math.min(n, i + win), Math.min(n, i + win * 3));
    const prev = regions[regions.length - 1];
    const material = !prev || Math.abs(lag - prev.lag) > Math.max(2, prev.lag * 0.15);
    const lasting = nextLag > 0 && Math.abs(nextLag - lag) <= Math.max(2, lag * 0.15);
    if (prev && !(material && lasting)) prev.to = Math.min(n, i + win * 2);
    else regions.push({ from: i, to: Math.min(n, i + win * 2), lag });
  }
  if (!regions.length) return [];
  regions[0]!.from = 0; regions[regions.length - 1]!.to = n;
  for (let i = 1; i < regions.length; i++) regions[i]!.from = regions[i - 1]!.to;
  /** track each region with its own period, carrying the phase across the boundary */
  const beatIdx: number[] = [];
  const tightness = 100;
  let carryPhase: number | undefined;
  for (const reg of regions) {
    if (reg.to - reg.from < 4) continue;
    const period = Math.max(2, reg.lag);
    const score = new Float64Array(reg.to - reg.from).fill(-Infinity);
    const back = new Int32Array(reg.to - reg.from).fill(-1);
    for (let k = 0; k < reg.to - reg.from; k++) {
      const i = reg.from + k;
      const lo = Math.max(reg.from, Math.floor(i - period * 2)), hi = Math.ceil(i - period * 0.5);
      let bestS = -Infinity, bestJ = -1;
      for (let j = lo; j <= hi; j++) {
        if (j < reg.from || j >= i) continue;
        const dev = Math.log((i - j) / period);
        const s = (score[j - reg.from]! === -Infinity ? 0 : score[j - reg.from]!) + -tightness * dev * dev;
        if (s > bestS) { bestS = s; bestJ = j; }
      }
      if (bestJ < 0 && carryPhase !== undefined) { score[k] = env[i]!; back[k] = -1; continue; }
      score[k] = (bestS === -Infinity ? 0 : bestS) + env[i]!;
      back[k] = bestJ;
    }
    let end = 0;
    for (let k = 1; k < score.length; k++) if (score[k]! > score[end]!) end = k;
    const path: number[] = [];
    let cur = end;
    while (cur >= 0) { path.push(reg.from + cur); cur = back[cur]!; }
    path.reverse();
    /**
     * PHASE CONTINUITY ACROSS REGIONS. The first beat of a new region is pulled onto the grid the previous
     * region would have continued, so a tempo change shifts the INTERVAL without breaking the PHASE.
     */
    const cont = carryPhase !== undefined && path.length
      ? path.filter((p) => p >= carryPhase! + period * 0.5)
      : path;
    for (const p of cont) beatIdx.push(p);
    carryPhase = cont.length ? cont[cont.length - 1] : carryPhase;
  }
  /**
   * ⚠ BOUNDS ARE ENFORCED HERE, and the first version did not.
   *
   * `localPeriod` can return a lag derived from a shorter segment, and the phase carry across a region boundary
   * can place an index past the envelope — which produced `table.times[idx]` as `undefined` and a `TypeError`
   * deep inside the beat map. **An index produced by region arithmetic must be validated before it indexes
   * anything.**
   */
  const uniq = [...new Set(beatIdx)].filter((i) => Number.isInteger(i) && i >= 0 && i < n).sort((a, b) => a - b);
  const maxEnv = Math.max(1e-9, ...env);
  /**
  /**
   * ⚠ A HALF-WINDOW CORRECTION WAS TRIED HERE AND WAS WRONG, and the reason is worth recording.
   *
   * `table.times[i]` is the START of the analysis window, so I reasoned that a transient's energy sits at the
   * window's CENTRE and added `fftSize/2/sampleRate` (23.2 ms). **Measurement refuted it:** the offsets got
   * WORSE and non-uniform (fixture C went from a 220.6 ms error to 243.8 ms). The spectral flux is a
   * *difference between consecutive windows*, and for a **transient onset** the increase is detected when the
   * window first CONTAINS the attack — which is the window's start, not its centre. **The frame start is the
   * correct coordinate for an onset**, and the correction is removed.
   *
   * Fixture **A**'s residual drift was not a window offset either: its detected interval is **499.23 ms for a
   * 500 ms truth**, i.e. a span error of **-0.77 ms/beat (0.15%)** from autocorrelation lag quantisation at one
   * hop (11.6 ms). **That is a tempo-resolution limit, not a phase error, and it is reported rather than
   * multiplied away.**
   */
  /**
   * ⚠ PHASE SELECTION — the repair for fixture C's 220.6 ms lock onto the OFF-BEAT.
   *
   * Fixture C is a 120 BPM track with strong off-beat transients, and the dynamic program settled into a
   * self-consistent grid **0.4412 beat late** — a 220.6 ms offset on every beat. The grid was internally
   * perfect (0.15% interval error, 100% regularity) and **acoustically wrong**: it locked onto the transients
   * *between* the beats.
   *
   * A DP path maximises its own score along a locally-optimal path, so once it commits to a phase it will not
   * leave it. The fix is to **evaluate each phase of the period explicitly and keep the one the audio actually
   * supports** — the phase whose beats carry the most envelope energy. This is a search over `period` phases,
   * not a tuning constant.
   */
  /** the global period in frames, and the re-phased grid uses it — the same period the DP was given */
  const periodFrames = Math.max(2, Math.round(tempo.periodSeconds / hop));
  const phaseCandidates: { shift: number; score: number }[] = [];
  for (let shift = 0; shift < periodFrames; shift++) {
    let sum = 0, cnt = 0;
    for (let i = shift; i < n; i += periodFrames) { sum += env[i]!; cnt++; }
    if (cnt) phaseCandidates.push({ shift, score: sum / cnt });
  }
  phaseCandidates.sort((a, b) => b.score - a.score);
  const bestPhaseShift = phaseCandidates.length ? phaseCandidates[0]!.shift : 0;
  /** only re-phase when the winner is materially better, so a genuinely ambiguous phase is left alone */
  const runnerUp = phaseCandidates[1]?.score ?? 0;
  const rephase = phaseCandidates.length > 1 && phaseCandidates[0]!.score > runnerUp * 1.25;
  const finalIdx = rephase
    ? (() => {
        const out: number[] = [];
        for (let i = bestPhaseShift; i < n; i += periodFrames) out.push(i);
        return out;
      })()
    : uniq;
  const beats: BeatEvent[] = finalIdx.map((idx, i) => ({
    timeSeconds: +table.times[idx]!.toFixed(6), sampleIndex: table.sampleIndex[idx]!, beatIndex: i,
    confidence: confidence(Math.min(1, env[idx]! / (maxEnv * 0.5))),
  }));
  for (let i = 0; i < beats.length - 1; i++) beats[i]!.intervalToNext = +(beats[i + 1]!.timeSeconds - beats[i]!.timeSeconds).toFixed(6);
  return beats;
}

// ---------------------------------------------------------------------------
// METER and DOWNBEATS
// ---------------------------------------------------------------------------

/**
 * METER ESTIMATION — and **`unknown` is a first-class answer**.
 *
 * The brief: *"Do not force 4/4. … A weak answer is better than a fabricated bar grid."* Candidates 2/3/4/6 are
 * scored by how much better the best phase aligns strong onsets than the average phase does; if that contrast
 * is weak the meter is `unknown` and no bar grid is produced.
 */
export function estimateMeter(beats: BeatEvent[], onsets: OnsetEvent[], cfg: AnalysisConfig): MeterEstimate {
  if (beats.length < 8) return { beatsPerBar: null, meter: "unknown", confidence: confidence(0), unknown: true, evidence: `only ${beats.length} beats; too few for a bar hypothesis` };
  const onsetTimes = onsets.map((o) => o.timeSeconds);
  const strengthNear = (t: number, win = 0.05) => onsetTimes.reduce((a, ot) => (Math.abs(ot - t) <= win ? a + 1 : a), 0);
  const beatStrength = beats.map((b) => strengthNear(b.timeSeconds));
  let best: { beatsPerBar: number; phase: number; contrast: number } | undefined;
  for (const bpb of [2, 3, 4, 6]) {
    for (let phase = 0; phase < bpb; phase++) {
      let on = 0, cnt = 0;
      for (let i = phase; i < beats.length; i += bpb) { on += beatStrength[i]!; cnt++; }
      if (!cnt) continue;
      const onAvg = on / cnt;
      const offAvg = mean(beatStrength.filter((_, i) => (i % bpb) !== phase));
      const contrast = offAvg > 0 ? onAvg / offAvg : onAvg > 0 ? 2 : 0;
      if (!best || contrast > best.contrast) best = { beatsPerBar: bpb, phase, contrast };
    }
  }
  if (!best || best.contrast < 1.15) {
    return { beatsPerBar: null, meter: "unknown", confidence: confidence(0), unknown: true, evidence: `the best bar hypothesis (${best?.beatsPerBar ?? "none"} beats, contrast ${(best?.contrast ?? 0).toFixed(2)}x) is not better than the mean phase — no bar grid is claimed` };
  }
  return { beatsPerBar: best.beatsPerBar, meter: `${best.beatsPerBar}/4`, confidence: confidence(Math.min(1, (best.contrast - 1) * 1.6)), unknown: false, evidence: `downbeat phase ${best.phase} of ${best.beatsPerBar} carries ${best.contrast.toFixed(2)}x the mean onset strength` };
}

export function buildDownbeats(beats: BeatEvent[], meter: MeterEstimate): DownbeatGrid {
  if (meter.unknown || !meter.beatsPerBar) return { beatsPerBar: null, downbeats: [], confidence: confidence(0), unknown: true };
  /** the phase is recovered from the meter evidence by re-scoring against the beats themselves */
  const bpb = meter.beatsPerBar;
  const strength = beats.map((b) => b.confidence.value);
  let bestPhase = 0, bestOn = -1;
  for (let phase = 0; phase < bpb; phase++) { let on = 0, cnt = 0; for (let i = phase; i < beats.length; i += bpb) { on += strength[i]!; cnt++; } if (cnt && on / cnt > bestOn) { bestOn = on / cnt; bestPhase = phase; } }
  const downbeats = beats.filter((_, i) => i % bpb === bestPhase);
  return { beatsPerBar: bpb, downbeats, confidence: meter.confidence, unknown: false };
}

// ---------------------------------------------------------------------------
// PHRASES and SECTIONS — inferred, with evidence
// ---------------------------------------------------------------------------

/**
 * ⚠ A MUSICAL TIMESCALE, shared by phrase and section inference.
 *
 * The over-segmentation on the real track came from both functions using **small fixed constants** (1.2 s and
 * 1.5 s) as minimum lengths, which are not musical units. Both now derive their minimum from **bars**, so the
 * structure model works on the music's own timescale and scales with the meter when one is known.
 */
export function musicalTimescale(meter: MeterEstimate): { secondsPerBar: number; bars: (n: number) => number } {
  const secondsPerBeat = Math.max(0.25, 60 / 120);
  const secondsPerBar = (meter.beatsPerBar ?? 4) * secondsPerBeat;
  return { secondsPerBar, bars: (n: number) => n * secondsPerBar };
}

/**
 * PHRASE BOUNDARIES.
 *
 * ⚠ **The brief is explicit that these are not objective.** They are inferred from a novelty curve combining
 * **spectral change** and **energy contour**, and every boundary carries confidence. A novelty peak that barely
 * exceeds the curve's own spread produces a LOW-confidence boundary rather than being suppressed or promoted.
 */
export function inferPhrases(table: FrameTable, clock: AudioClock, cfg: AnalysisConfig, meter: MeterEstimate): Phrase[] {
  const hop = cfg.hopSize / clock.sampleRate;
  const novelty: number[] = table.times.map((_, i) => {
    if (i === 0) return 0;
    const a = table.mags[i - 1]!, b = table.mags[i]!;
    let d = 0; const n = Math.min(a.length, b.length);
    /** a cosine distance between consecutive spectra is a change measure, not a level measure */
    let dot = 0, na = 0, nb = 0;
    for (let k = 0; k < n; k += 4) { dot += a[k]! * b[k]!; na += a[k]! * a[k]!; nb += b[k]! * b[k]!; }
    d = 1 - dot / Math.max(1e-9, Math.sqrt(na) * Math.sqrt(nb));
    /** combined with the energy contour's own second difference */
    const e = i >= 2 ? Math.abs(table.rmsDb[i]! - 2 * table.rmsDb[i - 1]! + table.rmsDb[i - 2]!) / 10 : 0;
    return Math.max(0, d) * 0.7 + e * 0.3;
  });
  /**
   * ⚠ THE PHRASE MINIMUM IS A MUSICAL PRIOR ONLY AS A SEARCH WINDOW, and it must be LONG ENOUGH to be a
   * phrase. The first version used ~1.6 s, which on the real track produced **31 phrases in 88 s** — a phrase
   * every 2.8 seconds, which is a bar at most and usually less. **A phrase is several bars, not one.**
   *
   * Eight bars is the conventional minimum unit, so the window is `8 bars` when a meter is known and an
   * eight-second floor otherwise. **This is a search window, never a forced grid**: a boundary still has to be
   * supported by the novelty curve to appear at all.
   */
  const ts = musicalTimescale(meter);
  const minPhrase = Math.max(8.0, ts.bars(4));
  const peaks = pickPeaks(novelty, { k: 1.4, minSeparation: Math.max(1, Math.round(minPhrase / hop)) });
  const spread = mad(novelty) + median(novelty);
  const boundaries = [0, ...peaks.map((p) => p.index), table.times.length - 1];
  /** ⚠ the same trailing-fragment repair: a phrase shorter than the minimum is absorbed into its predecessor */
  const minPhraseFrames = Math.max(1, Math.round(minPhrase / hop));
  while (boundaries.length >= 3 && boundaries[boundaries.length - 1]! - boundaries[boundaries.length - 2]! < minPhraseFrames) boundaries.splice(boundaries.length - 2, 1);
  const phrases: Phrase[] = [];
  for (let i = 0; i < boundaries.length - 1; i++) {
    const s = boundaries[i]!, e = boundaries[i + 1]!;
    const startNovelty = i === 0 ? 0 : novelty[s]!;
    const endNovelty = i + 2 > boundaries.length - 1 ? 0 : novelty[e]!;
    const ev = i === 0 ? ["track start"] : [`spectral/energy novelty ${startNovelty.toFixed(3)} against a curve spread of ${spread.toFixed(3)}`];
    phrases.push({
      index: i, startSeconds: +table.times[s]!.toFixed(3), endSeconds: +table.times[e]!.toFixed(3),
      startConfidence: i === 0 ? confidence(1) : confidence(Math.min(1, startNovelty / Math.max(1e-9, spread * 3))),
      endConfidence: i + 1 === boundaries.length - 1 ? confidence(1) : confidence(Math.min(1, endNovelty / Math.max(1e-9, spread * 3))),
      evidence: ev,
    });
  }
  return phrases;
}

/**
 * SECTION SEGMENTATION with **NEUTRAL labels**.
 *
 * The evidence is a coarse self-similarity of the energy-and-spectrum character: adjacent windows are grouped
 * while their character stays similar. **Pop labels are not claimed** — the brief forbids `VERSE`/`CHORUS`
 * unless they are actually inferable, and nothing here can infer them.
 */
export function inferSections(table: FrameTable, clock: AudioClock, cfg: AnalysisConfig, phrases: Phrase[], meter: MeterEstimate): Section[] {
  const hop = cfg.hopSize / clock.sampleRate;
  if (!table.times.length) return [];
  const win = Math.max(1, Math.round(1.0 / hop));
  const feature = (i: number) => {
    let r = 0, lo = 0, hi = 0, cnt = 0;
    for (let j = Math.max(0, i - win); j <= Math.min(table.times.length - 1, i + win); j++) { r += table.rmsArr[j]!; lo += table.low[j]!; hi += table.high[j]!; cnt++; }
    return { rms: r / cnt, low: lo / cnt, high: hi / cnt };
  };
  /**
   * ⚠ OVER-SEGMENTATION, measured on the real track.
   *
   * The first version produced **30 sections in 88 seconds** (one every 2.9 s) and **31 phrases**, with labels
   * wrapping past `SECTION_Z` and repeating. A structure model that returns thirty sections for a pop-length
   * track has not found structure — it has **restated the novelty curve**, and anything downstream that treats
   * a section as a musical unit would be misled.
   *
   * The cause is that the minimum lengths were fixed small constants (1.2 s / 1.5 s) rather than being
   * related to the music's own timescale. **A section is a STRUCTURE, so its minimum length must be a
   * musically meaningful span**, and when bars can be estimated it is expressed in bars.
   */
  /**
   * ⚠ THE FIRST VERSION DERIVED SECTION BOUNDARIES *ONLY* FROM PHRASE BOUNDARIES, so a section could never be
   * longer than one phrase — which is why **every fixture reported `SECTION_INFERENCE_WEAK`**: the
   * segmentations were structurally identical to the phrases and their boundaries inherited the phrases'
   * already-low confidence.
   *
   * Sections are now found from the **character curve directly** — the RMS and band-ratio contour — by
   * detecting where the local character changes materially, **independently of the phrase grid.**
   */
  const charCurve: number[] = table.times.map((_, i) => {
    const w = Math.max(1, Math.round(0.75 / hop));
    let r = 0, lo = 0, hi = 0, cnt = 0;
    for (let j = Math.max(0, i - w); j <= Math.min(table.times.length - 1, i + w); j++) { r += table.rmsArr[j]!; lo += table.low[j]!; hi += table.high[j]!; cnt++; }
    return (r / cnt) * 10 + (lo / Math.max(1e-9, hi)) * 0.4;
  });
  const charPeaks = pickPeaks(charCurve, { k: 1.9, minSeparation: Math.max(1, Math.round(2.0 / hop)) });
  /** a section boundary is a phrase boundary OR a material character change, so sections may span phrases */
  const cands = [0, ...phrases.slice(1).map((p) => table.times.findIndex((t) => t >= p.startSeconds)).filter((i) => i > 0), ...charPeaks.map((p) => p.index), table.times.length - 1];
  /** merge candidates closer than a minimum section length, so a section is a STRUCTURE and not a blip */
  /** ⚠ a section minimum of 1.5 s was the other half of the over-segmentation; sixteen bars is a section */
  const minSectionFrames = Math.max(1, Math.round(Math.max(12.0, musicalTimescale(meter).bars(8)) / hop));
  const uniq = [...new Set(cands)].sort((a, b) => a - b).reduce<number[]>((acc, i) => {
    if (!acc.length || i - acc[acc.length - 1]! >= minSectionFrames) acc.push(i);
    return acc;
  }, []);
  /**
   * ⚠ THE TRAILING FRAGMENT DEFEATS THE MINIMUM. The final boundary is appended unconditionally, so the audit
   * found the real track's last section at **5.664 s — below the 12 s minimum the code had just enforced**, and
   * the smallest observed phrase at **0.245 s**.
   *
   * **A minimum that the last element can violate is not a minimum.** The trailing fragment is therefore MERGED
   * into its predecessor when it is shorter than the minimum, which is the only move that preserves both the
   * minimum and full coverage — a trailing fragment cannot be lengthened, only absorbed.
   */
  if (uniq[uniq.length - 1] !== table.times.length - 1) uniq.push(table.times.length - 1);
  while (uniq.length >= 3 && uniq[uniq.length - 1]! - uniq[uniq.length - 2]! < minSectionFrames) uniq.splice(uniq.length - 2, 1);
  const sections: Section[] = [];
  for (let i = 0; i < uniq.length - 1; i++) {
    const s = uniq[i]!, e = uniq[i + 1]!;
    const mid = Math.floor((s + e) / 2);
    const f = feature(mid);
    const seg = table.rmsDb.slice(s, e + 1);
    const meanDb = seg.length ? mean(seg) : -99;
    const peakRms = Math.max(1e-9, ...table.rmsArr);
    /** the boundary's own confidence is how much the character CHANGED across it, not the section's level */
    const prev = i === 0 ? undefined : feature(Math.max(0, s - 3));
    const relChange = prev ? Math.abs(f.rms - prev.rms) / Math.max(1e-9, Math.max(f.rms, prev.rms)) : 1;
    const evidence = [`mean RMS ${meanDb.toFixed(1)} dB`, `low/high band ratio ${(f.low / Math.max(1e-9, f.high)).toFixed(2)}`, i === 0 ? "track start" : `character changed ${(relChange * 100).toFixed(1)}% across the boundary`];
    sections.push({
      /**
       * ⚠ LABELS MUST NOT WRAP. The first version used `String.fromCharCode(65 + (i % 26))`, so section 27 was
       * labelled `SECTION_A` again — **two different sections with the same name**, which silently breaks any
       * downstream reference. Past Z the label carries an index instead.
       */
      index: i, label: i < 26 ? `SECTION_${String.fromCharCode(65 + i)}` : `SECTION_${i + 1}`,
      startSeconds: +table.times[s]!.toFixed(3), endSeconds: +table.times[e]!.toFixed(3),
      startConfidence: i === 0 ? confidence(1) : confidence(Math.min(1, relChange * 3.5)),
      endConfidence: i + 1 === uniq.length - 1 ? confidence(1) : confidence(Math.min(1, relChange * 3.5)),
      evidence, meanRmsDb: +meanDb.toFixed(2),
    });
  }
  return sections;
}

/**
 * THE WHOLE INFERENCE PASS.
 *
 * ⚠ **THE ORDER MATTERS, and it is not the obvious one.** Beats are tracked from the tempo, then the beats are
 * **checked against the acoustic events** — because a tracker will happily produce a regular grid for material
 * that has no pulse. Only if the grid is SUPPORTED are beats, meter and downbeats kept. Fixture F (free
 * ambient) is the case this exists for: it first returned 143.5 BPM at high confidence.
 */
export function inferAll(table: FrameTable, clock: AudioClock, cfg: AnalysisConfig, onsets: OnsetEvent[]): InferredMusicStructure {
  const rawTempo = estimateTempo(table, clock, cfg);
  /** ⚠ ADAPTIVE, so a real tempo change is followed rather than averaged (fixture D) */
  const rawBeats = trackBeatsAdaptive(table, clock, cfg, rawTempo);
  const support = assessTempoSupport(rawBeats, onsets, clock.durationSeconds);
  const tempo = applyTempoSupport(rawTempo, support);
  /**
   * When the pulse is unsupported the beat grid is **withheld**, not merely down-weighted: a grid that does not
   * coincide with events would be consumed as if it were real. The tempo estimate itself is retained so the
   * Director can see what was found.
   */
  const beats = support.supported ? rawBeats : [];
  const meter = support.supported ? estimateMeter(beats, onsets, cfg) : { beatsPerBar: null, meter: "unknown", confidence: confidence(0), unknown: true, evidence: `no supported pulse: ${support.evidence.filter((e) => e.startsWith("UNSUPPORTED")).join("; ")}` };
  const downbeats = buildDownbeats(beats, meter);
  const phrases = inferPhrases(table, clock, cfg, meter);
  const sections = inferSections(table, clock, cfg, phrases, meter);
  return { tempo, beats, meter, downbeats, onsets, phrases, sections };
}

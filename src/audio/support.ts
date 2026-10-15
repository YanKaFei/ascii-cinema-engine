/**
 * TEMPO SUPPORT — does the pulse the tracker found actually EXIST in the audio?
 *
 * ⚠ THE FAILURE THIS REPAIRS, measured. Fixture **F-free-ambient** was built with **no metrical pulse at all**,
 * and the first analysis returned **143.555 BPM at HIGH confidence** with 29 beats. The detector had found a
 * period in the noise. **The autocorrelation's own score cannot tell you whether a pulse is real**, because a
 * smooth noise envelope autocorrelates too.
 *
 * A confident tempo on ametric material is the single most dangerous output this system can produce: the
 * Director would hard-sync to a pulse nobody can hear.
 *
 * ## ⚠ THE FIRST SUPPORT TEST WAS WRONG, AND FIXTURE C IS WHY
 *
 * The first version measured **the share of onsets that fall near a beat**. Fixture **C** is a 120 BPM track
 * whose off-beat transients are almost as strong as its downbeats — genuine music, correctly tracked — and it
 * scored **32% support and was REJECTED**. The test was counting legitimate off-beat events as evidence
 * *against* the grid.
 *
 * **The brief is explicit that BEAT and ONSET are different things and that a strong onset may occur
 * off-beat.** A test that penalises off-beat onsets contradicts the model it is testing.
 *
 * ## The corrected test
 *
 * A pulse is real when **the beats land on STRONGER events than the moments between them do.** So the
 * comparison is between the mean onset strength **at** the beats and the mean strength **between** them:
 *
 * | quantity | a real pulse | noise |
 * |---|---|---|
 * | **strength contrast** — mean onset strength near beats ÷ mean strength between beats | meaningfully above 1 | ≈ 1 |
 * | **events per beat** — a grid needs events to be a grid OF | ≥ ~0.5 | arbitrary |
 * | **interval regularity** — the spread of inter-beat intervals | low | low *as well*, which is why it cannot decide alone |
 *
 * **Off-beat onsets no longer count against the grid.** Fixture C's asymmetric beat (strong on-beat, weaker
 * off-beat) should pass on contrast; fixture F's noise should fail because its beats mark nothing stronger
 * than the space between them.
 */
import { median, mean } from "./dsp.js";
import { confidence, type BeatEvent, type OnsetEvent, type TempoEstimate, type Confidence } from "./analysis-types.js";

export interface TempoSupport {
  /** ⚠ the corrected measure: mean onset strength AT the beats versus BETWEEN them */
  strengthContrast: number;
  /**
   * ⚠ THE METRIC'S ACTUAL NUMERATOR AND DENOMINATOR, EXPOSED.
   *
   * A summary ratio cannot be audited. During the Phase 4A.3 audit the metric was **re-implemented from its
   * description** and produced 0.8092 where the real one produced 1.1469 — because the description said
   * *"the strongest onset within the window"* while the code uses a **rectangular** window and, when no onset
   * falls between the beats, returns a **fallback of 4.0**. **A metric that cannot be decomposed from its own
   * output will eventually be mis-reported by whoever re-derives it.** These fields make that impossible.
   */
  atBeatMeanOnsetStrength: number;
  betweenBeatMeanOnsetStrength: number;
  /** true when no onset fell between the beats, so the contrast is the 4.0 fallback and NOT a ratio */
  contrastIsFallback: boolean;
  /** the share of onsets near a beat, KEPT for reporting but NOT used as the verdict */
  onsetSupport: number;
  /** onsets per second — a pulse needs events to be a pulse OF something */
  onsetDensity: number;
  /** relative spread of inter-beat intervals; low is regular */
  intervalSpread: number;
  /** onsets per beat; below ~0.5 the "beats" mostly mark nothing */
  eventsPerBeat: number;
  /** measured verdict, and the reason */
  supported: boolean;
  evidence: string[];
}

export function assessTempoSupport(beats: BeatEvent[], onsets: OnsetEvent[], durationSeconds: number, windowSeconds = 0.08): TempoSupport {
  const evidence: string[] = [];
  if (!beats.length) return { strengthContrast: 0, atBeatMeanOnsetStrength: 0, betweenBeatMeanOnsetStrength: 0, contrastIsFallback: false, onsetSupport: 0, onsetDensity: 0, intervalSpread: 0, eventsPerBeat: 0, supported: false, evidence: ["no beats were tracked, so there is no pulse to support"] };
  const beatTimes = beats.map((b) => b.timeSeconds);
  let matched = 0;
  for (const o of onsets) {
    let best = Infinity;
    for (const bt of beatTimes) { const d = Math.abs(bt - o.timeSeconds); if (d < best) best = d; if (best <= windowSeconds) break; }
    if (best <= windowSeconds) matched++;
  }
  const onsetSupport = onsets.length ? matched / onsets.length : 0;
  const onsetDensity = durationSeconds > 0 ? onsets.length / durationSeconds : 0;
  const eventsPerBeat = onsets.length / beats.length;
  const iv = beats.map((b) => b.intervalToNext).filter((x): x is number => x !== undefined);
  let intervalSpread = 0;
  if (iv.length > 1) {
    const md = median(iv);
    intervalSpread = mean(iv.map((x) => Math.abs(x - md) / Math.max(1e-9, md)));
  }
  /**
   * THE STRENGTH CONTRAST — the corrected verdict quantity.
   *
   * For every beat, take the strongest onset within the window; for the space between consecutive beats, take
   * the strongest onset that is NOT near either beat. **A real pulse makes the first number larger.**
   */
  let atBeatSum = 0, atBeatN = 0;
  for (const bt of beatTimes) {
    let best = 0;
    for (const o of onsets) if (Math.abs(o.timeSeconds - bt) <= windowSeconds && o.strength > best) best = o.strength;
    if (best > 0) { atBeatSum += best; atBeatN++; }
  }
  let betweenSum = 0, betweenN = 0;
  for (const o of onsets) {
    let nearest = Infinity;
    for (const bt of beatTimes) { const d = Math.abs(bt - o.timeSeconds); if (d < nearest) nearest = d; }
    if (nearest > windowSeconds * 2) { betweenSum += o.strength; betweenN++; }
  }
  const atBeatMean = atBeatN ? atBeatSum / atBeatN : 0;
  const betweenMean = betweenN ? betweenSum / betweenN : 0;
  /**
   * ⚠ THE 4.0 FALLBACK IS NOT A RATIO, and it must be labelled as such. When nothing falls between the beats
   * the denominator is zero, and returning `4` conflates **"infinitely good contrast"** with **"there was
   * nothing to contrast against."** For a bare click track the two are the same in effect, but the value must
   * not be read as a measured 4x contrast.
   */
  const contrastIsFallback = !(betweenMean > 1e-9);
  const strengthContrast = !contrastIsFallback ? atBeatMean / betweenMean : atBeatMean > 1e-9 ? 4 : 0;

  evidence.push(`STRENGTH CONTRAST ${strengthContrast.toFixed(2)}x — mean onset strength ${atBeatMean.toFixed(3)} at the beats versus ${betweenMean.toFixed(3)} between them (${atBeatN} beats carried an onset, ${betweenN} onsets fell between)`);
  evidence.push(`onset support ${(onsetSupport * 100).toFixed(1)}% of ${onsets.length} onsets within ${(windowSeconds * 1000).toFixed(0)} ms of a beat — REPORTED, NOT USED AS THE VERDICT`);
  evidence.push(`onset density ${onsetDensity.toFixed(2)}/s, ${eventsPerBeat.toFixed(2)} onsets per beat`);
  evidence.push(`mean relative inter-beat deviation ${(intervalSpread * 100).toFixed(1)}%`);

  /**
   * The verdict, and the thresholds are stated as MEASURED bands rather than hidden constants.
   * **A pulse with almost no events is not a pulse**, and a pulse whose beats do not coincide with events is a
   * period found in the noise.
   */
  const reasons: string[] = [];
  if (eventsPerBeat < 0.5) reasons.push(`only ${eventsPerBeat.toFixed(2)} onsets per beat — the beats mostly mark nothing`);
  if (betweenN > 2 && strengthContrast < 1.25) reasons.push(`strength contrast only ${strengthContrast.toFixed(2)}x — the beats do not mark events stronger than the space between them`);
  if (intervalSpread > 0.25) reasons.push(`inter-beat deviation ${(intervalSpread * 100).toFixed(1)}% — the intervals are not regular`);
  const supported = reasons.length === 0;
  if (!supported) evidence.push(...reasons.map((r) => `UNSUPPORTED: ${r}`));
  return { strengthContrast: +strengthContrast.toFixed(4), atBeatMeanOnsetStrength: +atBeatMean.toFixed(6), betweenBeatMeanOnsetStrength: +betweenMean.toFixed(6), contrastIsFallback, onsetSupport: +onsetSupport.toFixed(4), onsetDensity: +onsetDensity.toFixed(4), intervalSpread: +intervalSpread.toFixed(4), eventsPerBeat: +eventsPerBeat.toFixed(4), supported, evidence };
}

/**
 * Apply the support verdict to a tempo estimate.
 *
 * **The estimate is not deleted** — it is still the best period found, and the Director may want to know it.
 * **Its confidence is what changes**, and `beatGridTrustworthy` is set false so no downstream consumer can
 * mistake it for a pulse.
 */
export function applyTempoSupport(tempo: TempoEstimate, support: TempoSupport): TempoEstimate & { support: TempoSupport; beatGridTrustworthy: boolean } {
  const cap: Confidence = support.supported ? tempo.confidence : confidence(Math.min(tempo.confidence.value, 0.25));
  return {
    ...tempo,
    confidence: cap,
    support,
    beatGridTrustworthy: support.supported,
  };
}

/**
 * LOCAL TEMPO — a drift curve.
 *
 * ⚠ Fixture D changes tempo for real (100 → 140 BPM). **A single global BPM cannot describe it**, and the brief
 * asks for local tempo when tempo drifts. This reports the median inter-beat BPM in overlapping windows so the
 * drift is visible rather than averaged into one number.
 */
export interface LocalTempoPoint { timeSeconds: number; bpm: number; beatsInWindow: number }
export function localTempoCurve(beats: BeatEvent[], windowBeats = 6): LocalTempoPoint[] {
  if (beats.length < 3) return [];
  const out: LocalTempoPoint[] = [];
  for (let i = 0; i + windowBeats <= beats.length; i += Math.max(1, Math.floor(windowBeats / 2))) {
    const seg = beats.slice(i, i + windowBeats);
    const iv = seg.map((b) => b.intervalToNext).filter((x): x is number => x !== undefined);
    if (iv.length < 2) continue;
    const md = median(iv);
    if (md <= 0) continue;
    out.push({ timeSeconds: +(((seg[0]!.timeSeconds + seg[seg.length - 1]!.timeSeconds) / 2)).toFixed(3), bpm: +(60 / md).toFixed(2), beatsInWindow: seg.length });
  }
  return out;
}

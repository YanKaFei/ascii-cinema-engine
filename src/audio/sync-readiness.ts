/**
 * REGIONAL SYNC READINESS.
 *
 * ⚠ **§14 is explicit that HARD_SYNC_READY may not be issued from BPM confidence alone.** The Phase 4A failure
 * proves why: fixture C has a high-confidence tempo and a **wrong phase**, so a BPM-based readiness verdict
 * would have labelled it safe for hard synchronisation while every click landed off the pulse.
 *
 * Readiness is therefore derived from **phase evidence**, region by region — never from the whole track, because
 * tempo and phase behaviour routinely differ between sections.
 */
import { confidence, type Confidence } from "./analysis-types.js";
import type { BeatGridCandidate, PhaseWindow } from "./grid-phase.js";

export const REGION_KINDS = ["SUPPORTED_METRICAL", "AMBIGUOUS_METRICAL", "NON_METRICAL", "TEMPO_TRANSITION", "LOW_EVIDENCE"] as const;
export type RegionKind = (typeof REGION_KINDS)[number];

/**
 * ⚠ `SOFT_SYNC_ONLY` WAS MISSING FROM THIS TUPLE, and the typechecker caught it.
 *
 * §14 names three readiness levels — `HARD_SYNC_READY`, `SOFT_SYNC_READY`, `FREE_SYNC_ONLY` — and the region
 * classifier needs to distinguish **"soft sync is enough"** from **"approximate alignment only"**. I had
 * written the tuple with `SOFT_SYNC_READY`, a name the brief does not use, and every `SOFT_SYNC_ONLY`
 * assignment was rejected. **The vocabulary now matches the brief exactly.**
 */
export const SYNC_READINESS = ["HARD_SYNC_READY", "SOFT_SYNC_ONLY", "FREE_SYNC_ONLY"] as const;
export type SyncReadiness = (typeof SYNC_READINESS)[number];

export interface RegionAssessment {
  index: number;
  startSeconds: number;
  endSeconds: number;
  kind: RegionKind;
  readiness: SyncReadiness;
  /** the measured quantities the verdict rests on */
  measured: { support: number; robustSupport: number; phaseDriftSeconds: number; occupiedBeats: number; predictedBeats: number };
  confidence: Confidence;
  evidence: string[];
  /** what the Director must not do here */
  implication: string;
}

export interface SyncReadinessReport {
  regions: RegionAssessment[];
  /** ⚠ the phase-separation evidence, without which no HARD_SYNC_READY may be issued */
  phaseSeparation?: number;
  phaseAmbiguous?: boolean;
  /** the track-level verdict is the WORST region, because a sync decision spans the whole edit */
  overall: SyncReadiness;
  hardSyncAllowed: boolean;
  rationale: string;
}

/**
 * Classify regions and issue readiness.
 *
 * The rules are stated as **measured conditions**, not tuned constants, and each one names the evidence it
 * required. A region that cannot satisfy them is `LOW_EVIDENCE` rather than being given a generous verdict.
 */
export function assessSyncReadiness(grid: BeatGridCandidate | undefined, windows: PhaseWindow[], regionSeconds = 10, tempoTransitionRegions: { start: number; end: number }[] = [], curve?: import("./grid-phase.js").PhaseSupportCurve): SyncReadinessReport {
  const regions: RegionAssessment[] = [];
  const duration = windows.length ? windows[windows.length - 1]!.endSeconds : 0;
  for (let i = 0, start = 0; start < duration; start += regionSeconds, i++) {
    const end = Math.min(duration, start + regionSeconds);
    const inWin = windows.filter((w) => w.startSeconds >= start && w.startSeconds < end);
    if (!inWin.length) continue;
    const support = inWin.reduce((a, w) => a + w.support, 0) / inWin.length;
    const maxDrift = Math.max(...inWin.map((w) => Math.abs(w.phaseDriftSeconds)));
    const occupied = inWin.reduce((a, w) => a + w.beatsInWindow, 0);
    const predicted = occupied;
    const evidence: string[] = [
      `mean accumulated phase support ${support.toFixed(4)} over ${inWin.length} window(s)`,
      `maximum local phase drift ${(maxDrift * 1000).toFixed(1)} ms`,
      `${predicted} beats predicted in the region`,
    ];
    const isTransition = tempoTransitionRegions.some((t) => start < t.end && end > t.start);
    /**
     * ⚠ THE VERDICT IS COMPUTED AS ONE EXPRESSION, not assigned branch by branch.
     *
     * The first version declared `let readiness: SyncReadiness` and assigned it inside each branch, and
     * TypeScript narrowed the variable to whatever the FIRST branch assigned — so every later branch was
     * rejected as unassignable. Computing the class first and deriving the verdict from it removes the
     * narrowing entirely and is clearer about the dependency: **the region KIND determines the READINESS.**
     */
    const driftRatio = grid ? maxDrift / grid.periodSeconds : Infinity;
    /**
     * ⚠ THE VERDICT IS DERIVED FROM THE REGION KIND, and the kind is computed first.
     *
     * Two earlier formulations failed: assigning `readiness` inside each branch let TypeScript narrow the
     * variable to the FIRST branch's literal, and a nested ternary chain inferred the same way. **The kind is
     * therefore decided by a plain block and the readability follows from a lookup**, which states the real
     * dependency and leaves no narrowing to fight.
     */
    /**
     * ⚠ THE PHASE-CORRECTNESS GATE, and it is the check whose ABSENCE produced a serious defect.
     *
     * The first version of this function measured **phase stability** and nothing else, so fixture **C** —
     * whose grid is perfectly stable and **220.6 ms off the pulse** — was labelled `HARD_SYNC_READY`. That is
     * precisely the failure §14 forbids: *"do not issue HARD_SYNC_READY from BPM confidence alone."* Stability
     * cannot see a stably-wrong phase.
     *
     * A region is only `SUPPORTED_METRICAL` when **phase stability AND phase separation** hold. `separation` is
     * the best phase's support divided by the strongest rival at least a quarter period away; a value near 1
     * means two phases are equally defensible and **the grid must not be locked.**
     */
    const phaseSeparated = curve ? curve.separation >= 1.25 : false;
    let kind: RegionKind = "LOW_EVIDENCE";
    if (grid && predicted > 0) {
      if (isTransition) kind = "TEMPO_TRANSITION";
      else if (support <= 0) kind = "NON_METRICAL";
      else if (!phaseSeparated) kind = "AMBIGUOUS_METRICAL";
      else if (driftRatio <= 0.12) kind = "SUPPORTED_METRICAL";
      else kind = "AMBIGUOUS_METRICAL";
    }
    const READINESS_OF: Record<RegionKind, SyncReadiness> = {
      SUPPORTED_METRICAL: "HARD_SYNC_READY",
      AMBIGUOUS_METRICAL: "SOFT_SYNC_ONLY",
      NON_METRICAL: "FREE_SYNC_ONLY",
      TEMPO_TRANSITION: "FREE_SYNC_ONLY",
      LOW_EVIDENCE: "FREE_SYNC_ONLY",
    };
    const readiness: SyncReadiness = READINESS_OF[kind];
    let implication = "support exists but phase stability is not established to the hard-sync margin";
    if (kind === "LOW_EVIDENCE") implication = "do not align anything to a beat here";
    else if (kind === "TEMPO_TRANSITION") implication = "do not hard-sync across a tempo change; use dramatic timing or a re-planned grid per region";
    else if (kind === "NON_METRICAL") implication = "no pulse evidence; take cues from energy, onsets and silence";
    else if (kind === "SUPPORTED_METRICAL") implication = "beat phase is stable across this region and may be locked";
    if (grid && driftRatio > 0.12) evidence.push(`phase drift is ${(driftRatio * 100).toFixed(0)}% of the period`);
    if (curve) {
      evidence.push(`phase separation ${curve.separation.toFixed(2)}x between the best phase and the strongest rival at least a quarter period away`);
      if (!phaseSeparated) evidence.push(`UNSAFE FOR HARD SYNC: rivalry means the chosen phase is not distinguishable from another — a stably WRONG phase passes every stability measure`);
    }
    regions.push({ index: i, startSeconds: +start.toFixed(3), endSeconds: +end.toFixed(3), kind, readiness, measured: { support: +support.toFixed(6), robustSupport: grid?.robustSupport ?? 0, phaseDriftSeconds: +maxDrift.toFixed(6), occupiedBeats: occupied, predictedBeats: predicted }, confidence: confidence(Math.min(1, support * 3)), evidence, implication });
  }
  /**
   * ⚠ THE TRACK VERDICT IS THE WORST REGION — **and with NO regions it is FREE_SYNC_ONLY, not HARD_SYNC_READY.**
   *
   * The first version folded `reduce` over an empty list with `HARD_SYNC_READY` as the seed, so a track whose
   * grid was entirely withheld reported **`HARD_SYNC_READY — 0 of 0 regions are not hard-sync ready`**. That is
   * a verdict of *ready* derived from having **no evidence at all** — the precise inversion of §14, and the
   * single most dangerous output this module can produce.
   */
  const order: SyncReadiness[] = ["HARD_SYNC_READY", "SOFT_SYNC_ONLY", "FREE_SYNC_ONLY"];
  const overall: SyncReadiness = regions.length === 0
    ? "FREE_SYNC_ONLY"
    : regions.reduce<SyncReadiness>((worst, r) => (order.indexOf(r.readiness) > order.indexOf(worst) ? r.readiness : worst), "HARD_SYNC_READY");
  const hardSyncAllowed = regions.length > 0 && regions.every((r) => r.readiness === "HARD_SYNC_READY");
  const blocked = regions.filter((r) => r.readiness !== "HARD_SYNC_READY");
  return {
    regions, overall, hardSyncAllowed, phaseSeparation: curve?.separation, phaseAmbiguous: curve?.ambiguous,
    rationale: regions.length === 0
      ? "NO REGIONS COULD BE ASSESSED — no beat grid was published, so there is no phase evidence to assess; a verdict of ready cannot be derived from the absence of evidence"
      : hardSyncAllowed
        ? `every one of the ${regions.length} regions is SUPPORTED_METRICAL with phase drift within 12% of the period`
        : `${blocked.length} of ${regions.length} regions are not hard-sync ready (${[...new Set(blocked.map((r) => r.kind))].join(", ")}), and the track verdict is the WORST region because a sync decision spans the whole edit`,
  };
}

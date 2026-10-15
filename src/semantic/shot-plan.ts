/**
 * SEQUENCE PLANNING — the semantic story compiled into a shot list, checked before anything renders.
 *
 * THE DISTINCTION THIS PHASE TESTS. Every mechanism in this project already works in isolation. What has
 * never been tested is whether the **Director** can turn a semantic story into a **coherent series of
 * shots** — shot selection, shot order, attention control, causal continuity, camera motivation and
 * restraint. That is a planning problem, so it is checked at the planning layer, before a frame is drawn.
 */

import type { ShotIntent, CompositionRelation } from "./motion.js";
import { validateShotIntent, restraintReport, explainShot, type DirectorDecisionRecord } from "./motion.js";

/**
 * CONTINUITY STATE — one continuous semantic world across cuts.
 *
 * Forms do not reset at a cut. Without this, a name can break in one shot and be intact in the next, or a
 * room can vanish and return — and **nothing in the per-shot validators would notice**, because each shot
 * is individually legal. Continuity is a property of the SEQUENCE and can only be checked between shots.
 */
export interface ContinuityState {
  /** the figure's condition and screen relation */
  personState: string;
  /** the written name's condition */
  nameState: string;
  /** the room's condition */
  roomState: string;
}

/** A shot as planned, with continuity bracketing it and the reason it was cut to. */
export interface PlannedShot {
  id: string;
  intent: ShotIntent;
  /** the world state this shot starts in — must equal the previous shot's `exitsIn` */
  entersIn: ContinuityState;
  /** the world state this shot leaves — must equal the next shot's `entersIn` */
  exitsIn: ContinuityState;
  /** WHY this shot exists and why the cut happens here */
  reasonForCut: string;
  /** mechanisms available and deliberately NOT used in this shot */
  notUsed: string[];
  /** duration in seconds, chosen from information density rather than equalised */
  seconds: number;
}

export interface DirectorPlan {
  story: string;
  shots: PlannedShot[];
  /** the relation the Director declares between the name event and the room event, if any */
  crossShotCausality: { declared: boolean; relation: string; validated: boolean; note: string };
}

// ---------------------------------------------------------------------------
// checks that can only be made across shots
// ---------------------------------------------------------------------------

/** Every shot's `entersIn` must equal the previous shot's `exitsIn`. This is the continuity check. */
export function checkContinuity(plan: DirectorPlan): string[] {
  const p: string[] = [];
  for (let i = 1; i < plan.shots.length; i++) {
    const prev = plan.shots[i - 1]!, cur = plan.shots[i]!;
    for (const k of ["personState", "nameState", "roomState"] as const) {
      if (prev.exitsIn[k] !== cur.entersIn[k]) {
        p.push(`cut ${prev.id} -> ${cur.id}: ${k} changes across the cut without a motivation (leaves as '${prev.exitsIn[k]}', enters as '${cur.entersIn[k]}')`);
      }
    }
  }
  return p;
}

/** Every shot must itself be valid. */
export function checkShots(plan: DirectorPlan): string[] {
  return plan.shots.flatMap((s) => validateShotIntent(s.intent).map((x) => `${s.id}: ${x}`));
}

/**
 * REDUNDANT SHOT CHECK.
 *
 * A shot is POTENTIALLY REDUNDANT if removing it changes nothing: same semantic information, same causal
 * relation, same attention transition, same spatial understanding. **It is flagged, not deleted** — a shot
 * can be redundant in this model and still earn its place through pacing, which this cannot measure.
 */
export function findRedundantShots(plan: DirectorPlan): { id: string; reason: string }[] {
  const out: { id: string; reason: string }[] = [];
  for (let i = 0; i < plan.shots.length; i++) {
    const s = plan.shots[i]!;
    const reasons: string[] = [];
    if (i > 0) {
      const prev = plan.shots[i - 1]!;
      if (prev.intent.expectedAudienceReading === s.intent.expectedAudienceReading) reasons.push("same expected audience reading as the previous shot");
      if (prev.intent.semanticEvent === s.intent.semanticEvent) reasons.push("same semantic event as the previous shot");
      if (prev.exitsIn.personState === s.exitsIn.personState && prev.exitsIn.nameState === s.exitsIn.nameState && prev.exitsIn.roomState === s.exitsIn.roomState) {
        reasons.push("the world state does not change across this shot");
      }
      if (prev.intent.camera.motivation === s.intent.camera.motivation && prev.intent.camera.move === s.intent.camera.move && prev.intent.primaryAttention?.target === s.intent.primaryAttention?.target) {
        reasons.push("same camera motivation and same primary attention as the previous shot");
      }
    }
    if (reasons.length) out.push({ id: s.id, reason: reasons.join("; ") });
  }
  return out;
}

/**
 * ATTENTION PROGRESSION ACROSS THE SEQUENCE.
 *
 * Attention must move, and it must move in a readable order. **If two adjacent shots share a primary
 * attention target, the cut is not redirecting attention** — which is the sequence-level form of the
 * everything-at-once failure the hierarchy exists to prevent.
 */
export function attentionProgression(plan: DirectorPlan): { order: string[]; problems: string[] } {
  const order = plan.shots.map((s) => s.intent.primaryAttention?.target ?? "(none)");
  const problems: string[] = [];
  for (let i = 1; i < order.length; i++) {
    if (order[i] === order[i - 1] && order[i] !== "(none)") {
      problems.push(`shots ${plan.shots[i - 1]!.id} and ${plan.shots[i]!.id} both hold primary attention on '${order[i]}' — the cut does not redirect attention`);
    }
  }
  return { order, problems };
}

/**
 * EFFECT STACKING.
 *
 * At any dramatic beat the Director should prefer **one dominant expressive transformation.** This reports
 * which expressive layers are active per shot so stacking is visible rather than assumed.
 */
export function effectStacking(plan: DirectorPlan): { id: string; active: string[]; stacked: boolean }[] {
  return plan.shots.map((s) => {
    const active: string[] = [];
    if (s.intent.motion.primary.kind !== "none") active.push(`physical:${s.intent.motion.primary.kind}`);
    if (s.intent.motion.secondary.kind !== "none") active.push(`expression:${s.intent.motion.secondary.kind}`);
    if (s.intent.motion.tertiary && s.intent.motion.tertiary.kind !== "none") active.push(`tertiary:${s.intent.motion.tertiary.kind}`);
    /** a camera move is SUPPORTING and does not count as an expressive transformation */
    const expressive = active.filter((a) => !a.startsWith("physical:"));
    return { id: s.id, active, stacked: expressive.length > 1 };
  });
}

/** The full planning report. */
export function reviewPlan(plan: DirectorPlan) {
  const totalSeconds = plan.shots.reduce((a, s) => a + s.seconds, 0);
  return {
    shotCount: plan.shots.length,
    totalSeconds: +totalSeconds.toFixed(2),
    continuity: checkContinuity(plan),
    shotValidity: checkShots(plan),
    redundant: findRedundantShots(plan),
    attention: attentionProgression(plan),
    stacking: effectStacking(plan),
    crossShotCausality: plan.crossShotCausality,
    decisionRecords: plan.shots.map((s) => ({ id: s.id, ...explainShot(s.intent) })),
    restraint: plan.shots.map((s) => ({ id: s.id, ...restraintReport(s.intent) })),
    durations: plan.shots.map((s) => ({ id: s.id, seconds: s.seconds })),
  } as const;
}

/** Convenience for building a state. */
export const state = (personState: string, nameState: string, roomState: string): ContinuityState => ({ personState, nameState, roomState });

/**
 * DIAGNOSTIC BEAT HYPOTHESES — a SEPARATE type from production beats.
 *
 * ⚠ **A hypothesis is not a beat.** Phase 4A.2 correctly refused to publish a beat grid the support gate rejected,
 * but that left the external listening gate unable to run at all: **there was nothing for a listener to hear.**
 * The refusal was right and the consequence was wrong, because *unable to certify* and *unable to investigate*
 * are different states.
 *
 * This type exists to separate them:
 *
 *   PublishedBeatGrid   certified, consumable by the production SyncPlanner
 *   DiagnosticBeatHypothesis   UNVERIFIED, audible, never consumable
 *
 * **Every hypothesis carries `status: "UNVERIFIED"` and a `limitations` list**, and the production guard
 * refuses it — so an exploratory grid can never be mistaken for a measured one.
 */
import type { BeatEvent, Confidence } from "./analysis-types.js";
import type { PhaseSupportCurve } from "./grid-phase.js";

/** ⚠ the literal markers that must appear on every diagnostic artefact */
export const DIAGNOSTIC_MARKERS = ["UNVERIFIED_BEAT_HYPOTHESIS", "NOT_FOR_PRODUCTION_SYNC"] as const;
export type DiagnosticMarker = (typeof DIAGNOSTIC_MARKERS)[number];

export interface DiagnosticBeatHypothesis {
  /** ⚠ ALWAYS "UNVERIFIED". There is no other value; a verified grid is not this type. */
  status: "UNVERIFIED";
  markers: DiagnosticMarker[];
  sourceTrackHash: string;
  candidateId: string;
  tempoBpm: number;
  phaseOffsetSeconds: number;
  candidateBeatTimes: number[];
  /** the measured acoustic support that produced this candidate */
  acousticSupport: { support: number; robustSupport: number; occupiedBeats: number; strengthContrast?: number };
  phaseSeparation: number | null;
  confidence: Confidence;
  sourceMethod: string;
  /** ⚠ REQUIRED, and never empty: what this hypothesis cannot establish */
  limitations: string[];
  /** the same grid as BeatEvents, for the audition mixer ONLY */
  beats: BeatEvent[];
  /** explicitly false, so a reader cannot assume otherwise */
  productionConsumable: false;
}

export interface DiagnosticOnlySet {
  note: string;
  sourceTrackHash: string;
  sourcePath: string;
  generatedBy: string;
  markers: DiagnosticMarker[];
  /** why these exist even though no grid was certified */
  rationale: string;
  hypotheses: DiagnosticBeatHypothesis[];
}

/** A standard set of limitations, extended per candidate. */
export const BASE_LIMITATIONS = [
  "the production support gate REJECTED the pulse, so this grid is not certified",
  "grid cardinality is NOT beat accuracy: a 165-beat count at 112.5 BPM is what the tempo predicts, not evidence that the beats are right",
  "no ground-truth beat annotation exists for this track, so beatAccuracy cannot be computed for it",
  "the phase was selected by accumulated acoustic support and is therefore a hypothesis about the metre, not a measurement of it",
];

/**
 * Build a hypothesis from a phase-search candidate.
 *
 * **Nothing is promoted.** The tempo, phase and support are copied from the search; the limitations say what the
 * search cannot establish.
 */
export function hypothesisFrom(args: {
  candidateId: string; sourceTrackHash: string; bpm: number; phaseOffsetSeconds: number;
  beats: BeatEvent[]; support: number; robustSupport: number; occupiedBeats: number;
  phaseSeparation: number | null; confidence: Confidence; sourceMethod: string;
  extraLimitations?: string[]; strengthContrast?: number;
}): DiagnosticBeatHypothesis {
  return {
    status: "UNVERIFIED",
    markers: [...DIAGNOSTIC_MARKERS],
    sourceTrackHash: args.sourceTrackHash,
    candidateId: args.candidateId,
    tempoBpm: args.bpm,
    phaseOffsetSeconds: args.phaseOffsetSeconds,
    candidateBeatTimes: args.beats.map((b) => b.timeSeconds),
    acousticSupport: {
      support: args.support, robustSupport: args.robustSupport, occupiedBeats: args.occupiedBeats,
      ...(args.strengthContrast !== undefined ? { strengthContrast: args.strengthContrast } : {}),
    },
    phaseSeparation: args.phaseSeparation,
    confidence: args.confidence,
    sourceMethod: args.sourceMethod,
    limitations: [...BASE_LIMITATIONS, ...(args.extraLimitations ?? [])],
    beats: args.beats,
    productionConsumable: false,
  };
}

/**
 * ⚠ THE PRODUCTION GUARD.
 *
 * Any object that announces itself as a diagnostic hypothesis — by `status`, by `markers`, or by the
 * `productionConsumable` flag — is refused. **A hard-sync operation must never accept one.** The guard is
 * deliberately paranoid: it checks all three signals, because relying on any single one would fail open if a
 * future producer forgot to set it.
 */
export class DiagnosticConsumptionError extends Error {
  constructor(message: string) { super(message); this.name = "DiagnosticConsumptionError"; }
}

export function assertProductionConsumable(x: unknown, where: string): void {
  if (!x || typeof x !== "object") return;
  const o = x as Record<string, unknown>;
  if (o.status === "UNVERIFIED") throw new DiagnosticConsumptionError(`${where}: refused — this is an UNVERIFIED diagnostic beat hypothesis and cannot be consumed by production sync`);
  if (Array.isArray(o.markers) && (o.markers as string[]).includes("NOT_FOR_PRODUCTION_SYNC")) throw new DiagnosticConsumptionError(`${where}: refused — the object carries the NOT_FOR_PRODUCTION_SYNC marker`);
  if (o.productionConsumable === false) throw new DiagnosticConsumptionError(`${where}: refused — productionConsumable is false`);
  if (Array.isArray(o.hypotheses)) for (const h of o.hypotheses as unknown[]) assertProductionConsumable(h, where);
}

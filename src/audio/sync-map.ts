/**
 * THE FUTURE-SYNC MAP.
 *
 * ⚠ **THIS IS NOT AN EDIT DECISION.** It records, per region, **which musical evidence actually exists** and
 * **which sync modes that evidence permits** — nothing about video, cuts, performance landmarks or causal
 * events. Phase 4B consumes it; Phase 4A does not act on it.
 *
 * The distinction matters because a sync map is exactly the artifact that invites over-reach: it is easy to
 * write *"cut here"* and very hard to justify it. So the map carries `evidence`, `prohibited`, `reason` and the
 * measured quantities behind the verdict, and it **names the modes it forbids as explicitly as the ones it
 * allows.**
 */
import type { RegionAssessment, SyncReadiness } from "./sync-readiness.js";
import type { MusicTimeline } from "./timeline.js";
import type { PhaseSupportCurve } from "./grid-phase.js";

export const SYNC_EVIDENCE = ["BEAT", "DOWNBEAT", "ONSET", "PHRASE", "SECTION", "ENERGY", "BREATH"] as const;
export type SyncEvidence = (typeof SYNC_EVIDENCE)[number];

export const SYNC_MODE_NAMES = ["HARD_SYNC", "SOFT_SYNC", "FREE_SYNC"] as const;
export type SyncModeName = (typeof SYNC_MODE_NAMES)[number];

export interface FutureSyncRegion {
  region: string;
  startSeconds: number;
  endSeconds: number;
  kind: RegionAssessment["kind"];
  /** which evidence is actually AVAILABLE in this region — not which would be convenient */
  availableEvidence: SyncEvidence[];
  allowedSyncModes: SyncModeName[];
  prohibited: SyncModeName[];
  reason: string;
  measured: RegionAssessment["measured"] & { phaseSeparation?: number };
}

export interface FutureSyncMap {
  /** ⚠ stated in the artifact itself, so the file cannot be mistaken for an edit */
  note: string;
  track: { durationSeconds: number; tempoBpm: number; tempoConfidence: string; beatGridPublished: boolean; downbeatPublished: boolean };
  regions: FutureSyncRegion[];
  globalProhibition: string[];
  overall: SyncReadiness;
}

const READINESS_TO_MODES: Record<SyncReadiness, SyncModeName[]> = {
  HARD_SYNC_READY: ["HARD_SYNC", "SOFT_SYNC", "FREE_SYNC"],
  SOFT_SYNC_ONLY: ["SOFT_SYNC", "FREE_SYNC"],
  FREE_SYNC_ONLY: ["FREE_SYNC"],
};

const ALL_MODES: SyncModeName[] = ["HARD_SYNC", "SOFT_SYNC", "FREE_SYNC"];

/**
 * Build the map from the regional assessment.
 *
 * **Evidence availability is measured, not assumed.** `BEAT` is available only where a grid exists, `DOWNBEAT`
 * only when the meter is established, and `BREATH` only where a breath point was actually detected.
 */
export function buildFutureSyncMap(readiness: RegionAssessment[], timeline: MusicTimeline, durationSeconds: number, curve?: PhaseSupportCurve, opus?: { beatGridPublished: boolean; downbeatPublished: boolean }): FutureSyncMap {
  const tl = timeline;
  const regions: FutureSyncRegion[] = readiness.map((r, i) => {
    const inRegion = <T extends { timeSeconds: number }>(xs: T[]) => xs.filter((x) => x.timeSeconds >= r.startSeconds && x.timeSeconds < r.endSeconds);
    const evidence: SyncEvidence[] = [];
    if (opus?.beatGridPublished && inRegion(tl.structure.beats).length > 0) evidence.push("BEAT");
    if (opus?.downbeatPublished && inRegion(tl.structure.downbeats.downbeats).length > 0) evidence.push("DOWNBEAT");
    if (inRegion(tl.structure.onsets).length > 0) evidence.push("ONSET");
    if (tl.structure.phrases.some((p) => p.startSeconds >= r.startSeconds && p.startSeconds < r.endSeconds)) evidence.push("PHRASE");
    if (tl.structure.sections.some((s) => s.startSeconds >= r.startSeconds && s.startSeconds < r.endSeconds)) evidence.push("SECTION");
    if (tl.measured.energyCurve.some((e) => e.timeSeconds >= r.startSeconds && e.timeSeconds < r.endSeconds)) evidence.push("ENERGY");
    if (inRegion(tl.measured.breathPoints).length > 0) evidence.push("BREATH");

    const allowed = READINESS_TO_MODES[r.readiness];
    const prohibited = ALL_MODES.filter((m) => !allowed.includes(m));

    /**
     * ⚠ THE REASON MUST NAME THE MEASURED CONDITION, not restate the verdict. A region marked
     * `SOFT_SYNC_ONLY` because its phase rivals another must say so; "low confidence" alone would be a label
     * wearing the costume of an explanation.
     */
    let reason = r.implication;
    if (r.kind === "AMBIGUOUS_METRICAL" && curve) reason = `tempo is stable but the beat phase is not separated (${curve.separation.toFixed(2)}x against a rival at least a quarter period away); a stably wrong phase would pass every interval metric`;
    else if (r.kind === "NON_METRICAL") reason = "no pulse evidence in this region; only energy, onsets, silence and breath are available";
    else if (r.kind === "TEMPO_TRANSITION") reason = "a tempo change crosses this region, so one period does not describe it";
    else if (r.kind === "LOW_EVIDENCE") reason = "insufficient evidence; no beat grid was published rather than a plausible-looking one";
    else if (r.kind === "SUPPORTED_METRICAL" && curve) reason = `phase separated ${curve.separation.toFixed(2)}x and stable to within 12% of the period`;

    return {
      region: `R${String(i + 1).padStart(2, "0")}`,
      startSeconds: r.startSeconds, endSeconds: r.endSeconds, kind: r.kind,
      availableEvidence: evidence, allowedSyncModes: allowed, prohibited,
      reason,
      measured: { ...r.measured, ...(curve ? { phaseSeparation: curve.separation } : {}) },
    };
  });

  const globalProhibition = ["HARD_SYNC"];
  if (!opus?.beatGridPublished) globalProhibition.push("SOFT_SYNC");
  return {
    note: "THIS IS NOT AN EDIT DECISION. It records which musical evidence exists per region and which sync modes that evidence permits. It references NO video event, cut, performance landmark or causal landmark.",
    track: { durationSeconds: +durationSeconds.toFixed(3), tempoBpm: tl.structure.tempo.bpm, tempoConfidence: tl.structure.tempo.confidence.band, beatGridPublished: !!opus?.beatGridPublished, downbeatPublished: !!opus?.downbeatPublished },
    regions,
    globalProhibition: regions.every((r) => r.allowedSyncModes.includes("HARD_SYNC")) ? [] : globalProhibition,
    /**
     * ⚠ the track verdict is the WORST region, computed on the READINESS order rather than the mode order.
     * The first version indexed `ALL_MODES`, which is `[HARD, SOFT, FREE]` while readiness is
     * `[HARD, SOFT_ONLY, FREE]` — the two lists happen to align, but relying on that coincidence would break
     * silently the moment either vocabulary changed.
     */
    overall: readiness.length
      ? readiness.reduce<SyncReadiness>((worst, r) => {
          const rank: Record<SyncReadiness, number> = { HARD_SYNC_READY: 0, SOFT_SYNC_ONLY: 1, FREE_SYNC_ONLY: 2 };
          return rank[r.readiness] > rank[worst] ? r.readiness : worst;
        }, "HARD_SYNC_READY")
      : "FREE_SYNC_ONLY",
  };
}

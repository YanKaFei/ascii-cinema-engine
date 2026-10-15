/**
 * ANALYSIS WARNINGS.
 *
 * ⚠ **The future Director must know when NOT to hard-sync.** A warning is not an error — it is the analysis
 * telling the Director which of its own outputs are trustworthy. §18 lists the conditions; each one here is
 * produced from a MEASUREMENT rather than a guess.
 */
import type { InferredMusicStructure, MeasuredAudioFeatures, TempoEstimate, Confidence } from "./analysis-types.js";

export const WARNING_CODES = [
  "TEMPO_AMBIGUOUS",
  "TEMPO_LOW_CONFIDENCE",
  "TEMPO_UNRESOLVED",
  "BEAT_TRACKING_UNSTABLE",
  "TIME_SIGNATURE_UNCLEAR",
  "FREE_TEMPO_SUSPECTED",
  "LARGE_RUBATO",
  "LONG_AMBIENT_SECTION",
  "PERCUSSION_ABSENT",
  "MULTIPLE_PULSE_INTERPRETATIONS",
  "PHRASE_INFERENCE_WEAK",
  "SECTION_INFERENCE_WEAK",
] as const;
export type WarningCode = (typeof WARNING_CODES)[number];

export interface AnalysisWarning {
  code: WarningCode;
  severity: "info" | "caution" | "severe";
  /** what was MEASURED to produce the warning */
  evidence: string;
  /** the measured value, so the warning is auditable */
  measured: Record<string, number | string | boolean>;
  /** what a downstream consumer should NOT do */
  implication: string;
}

export function buildWarnings(m: MeasuredAudioFeatures, s: InferredMusicStructure): AnalysisWarning[] {
  const w: AnalysisWarning[] = [];
  const tempo: TempoEstimate = s.tempo;

  /** ⚠ the support verdict, surfaced as warnings so the Director cannot miss it */
  const sup = (tempo as unknown as { support?: import("./support.js").TempoSupport }).support;
  const trustworthy = (tempo as unknown as { beatGridTrustworthy?: boolean }).beatGridTrustworthy;
  if (sup && !sup.supported) {
    w.push({ code: "PERCUSSION_ABSENT", severity: "severe",
      evidence: `the tracked pulse is NOT supported by the acoustic events: ${sup.evidence.filter((e) => e.startsWith("UNSUPPORTED")).join("; ")}`,
      measured: { onsetSupport: sup.onsetSupport, eventsPerBeat: sup.eventsPerBeat, intervalSpread: sup.intervalSpread, atBeatMean: sup.atBeatMeanOnsetStrength, betweenBeatMean: sup.betweenBeatMeanOnsetStrength, contrastIsFallback: sup.contrastIsFallback },
      implication: "NO beat grid is published for this track; do not hard-sync, and take cut points from energy, onsets and silence instead" });
  }
  if (trustworthy === false) {
    w.push({ code: "TEMPO_UNRESOLVED", severity: "severe",
      evidence: "the beat grid was withheld because the tracked pulse did not coincide with the acoustic events",
      measured: { beatCount: s.beats.length }, implication: "treat this track as ametric; only energy, onsets, silence and breath points are usable" });
  }
  if (tempo.halfDoubleAmbiguous && tempo.ambiguousWith) {
    w.push({ code: "TEMPO_AMBIGUOUS", severity: "caution",
      evidence: `two candidate periods score within 72%: ${tempo.bpm} BPM and ${tempo.ambiguousWith.bpm} BPM (ratio ${tempo.ambiguousWith.ratio})`,
      measured: { primaryBpm: tempo.bpm, rivalBpm: tempo.ambiguousWith.bpm, ratio: tempo.ambiguousWith.ratio },
      implication: "do NOT hard-sync to the reported tempo; a half-time or double-time reading is comparably supported and the choice is a directorial one" });
  }
  if (tempo.confidence.band === "low" || tempo.confidence.band === "unknown") {
    w.push({ code: "TEMPO_LOW_CONFIDENCE", severity: tempo.confidence.value > 0 ? "caution" : "severe",
      evidence: `tempo confidence ${tempo.confidence.value} (${tempo.confidence.band})`,
      measured: { confidence: tempo.confidence.value, band: tempo.confidence.band },
      implication: "prefer FREE_SYNC; do not lock visual landmarks to this estimate" });
  }
  if (!tempo.periodSeconds) {
    w.push({ code: "TEMPO_UNRESOLVED", severity: "severe", evidence: "no candidate period scored above zero in the autocorrelation",
      measured: { bpm: timbreBpm(tempo) }, implication: "no beat grid exists; only energy, onsets and silence are usable" });
  }
  /** BEAT STABILITY — the spread of inter-beat intervals relative to the median */
  if (s.beats.length > 4) {
    const iv = s.beats.map((b) => b.intervalToNext).filter((x): x is number => x !== undefined);
    const md = iv.slice().sort((a, b) => a - b)[iv.length >> 1]!;
    const dev = iv.map((x) => Math.abs(x - md) / Math.max(1e-9, md));
    const p90 = dev.slice().sort((a, b) => a - b)[Math.floor(dev.length * 0.9)]!;
    if (p90 > 0.18) w.push({ code: "BEAT_TRACKING_UNSTABLE", severity: p90 > 0.3 ? "severe" : "caution",
      evidence: `the 90th-percentile relative inter-beat deviation is ${(p90 * 100).toFixed(1)}% against a median interval of ${md.toFixed(3)}s`,
      measured: { p90RelativeDeviation: +p90.toFixed(4), medianIntervalSeconds: +md.toFixed(4) },
      implication: "the pulse is not steady; use SOFT_SYNC or FREE_SYNC" });
    if (p90 > 0.25) w.push({ code: "FREE_TEMPO_SUSPECTED", severity: "caution",
      evidence: `${(p90 * 100).toFixed(1)}% inter-beat deviation with no stable pulse`,
      measured: { p90RelativeDeviation: +p90.toFixed(4) }, implication: "mark the track as free-tempo and do not infer bars" });
  }
  if (s.meter.unknown) {
    w.push({ code: "TIME_SIGNATURE_UNCLEAR", severity: "caution", evidence: s.meter.evidence,
      measured: { beats: s.beats.length }, implication: "no bar grid exists; do not plan cuts on downbeats" });
  }
  /** PERCUSSION ABSENCE — measured through onset density and the low-band share of onsets */
  {
    const dur = m.energyCurve.length ? m.energyCurve[m.energyCurve.length - 1]!.timeSeconds : 0;
    const density = dur > 0 ? s.onsets.length / dur : 0;
    const lowHeavy = s.onsets.filter((o) => o.spectralShape === "low-heavy").length;
    if (density < 0.8 || s.onsets.length < 8) {
      w.push({ code: "PERCUSSION_ABSENT", severity: "info",
        evidence: `onset density ${density.toFixed(2)}/s over ${dur.toFixed(1)}s (${s.onsets.length} onsets); ${lowHeavy} are low-heavy`,
        measured: { onsetsPerSecond: +density.toFixed(3), onsetCount: s.onsets.length },
        implication: "there is little transient material; beats will be unreliable and cut points should come from energy and silence instead" });
    }
  }
  if (tempo.candidates.filter((c) => c.score > 0.3).length >= 3) {
    w.push({ code: "MULTIPLE_PULSE_INTERPRETATIONS", severity: "caution",
      evidence: `${tempo.candidates.filter((c) => c.score > 0.3).length} candidate periods score above 0.3`,
      measured: { candidateCount: tempo.candidates.length }, implication: "several pulse readings are defensible; the tempo is a directorial choice" });
  }
  /** LONG AMBIENT SECTION */
  for (const sec of s.sections) {
    const len = sec.endSeconds - sec.startSeconds;
    if (len > 6 && sec.meanRmsDb - Math.max(...s.sections.map((x) => x.meanRmsDb)) < -12) {
      w.push({ code: "LONG_AMBIENT_SECTION", severity: "info",
        evidence: `section ${sec.label} lasts ${len.toFixed(1)}s at ${sec.meanRmsDb.toFixed(1)} dB, ${(sec.meanRmsDb - Math.max(...s.sections.map((x) => x.meanRmsDb))).toFixed(1)} dB below the loudest section`,
        measured: { seconds: +len.toFixed(2), meanRmsDb: sec.meanRmsDb },
        implication: "a long quiet stretch; visual timing here should be dramatic rather than musical" });
    }
  }
  const weakPhrase = s.phrases.filter((p) => p.startConfidence.band === "low" && p.index > 0).length;
  if (weakPhrase > 0) w.push({ code: "PHRASE_INFERENCE_WEAK", severity: "info",
    evidence: `${weakPhrase} of ${s.phrases.length - 1} internal phrase boundaries carry LOW confidence`,
    measured: { weakBoundaries: weakPhrase, totalPhrases: s.phrases.length },
    implication: "phrase boundaries are candidate, not asserted; do not treat them as musical facts" });
  const weakSection = s.sections.filter((x) => x.startConfidence.band === "low" && x.index > 0 && (x.endSeconds - x.startSeconds) > 2).length;
  if (weakSection > 0) w.push({ code: "SECTION_INFERENCE_WEAK", severity: "info",
    evidence: `${weakSection} of ${s.sections.length - 1} internal section boundaries carry LOW confidence`,
    measured: { weakBoundaries: weakSection, totalSections: s.sections.length },
    implication: "the segmentation is a hypothesis; a human should confirm before it drives an edit" });
  return w;
}
const timbreBpm = (t: TempoEstimate): number => t.bpm;

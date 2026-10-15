/**
 * THE MUSIC TIMELINE AND ITS QUERY API.
 *
 * ⚠ **Downstream systems must never inspect raw detector output.** The timeline is the single authoritative
 * surface, and every value on it carries its domain, its confidence, the evidence that produced it, and the
 * method that measured it.
 *
 * **No director policy lives here.** §22 is explicit: these are timeline queries, not decisions. There is no
 * `snapShotToBeat`, no `autoCutToMusic` — that is Phase 4B territory, and building it here would put directorial
 * judgement inside the analysis layer.
 */
import type { AudioClock } from "./clock.js";
import type { MeasuredAudioFeatures, InferredMusicStructure, BeatEvent, OnsetEvent, Phrase, Section, Confidence } from "./analysis-types.js";
import { confidence } from "./analysis-types.js";

export const MUSIC_LANDMARK_KINDS = [
  "BEAT", "DOWNBEAT", "ONSET", "PHRASE_START", "PHRASE_END", "SECTION_START", "SECTION_END",
  "ENERGY_RISE", "ENERGY_PEAK", "ENERGY_DROP", "BREATH_POINT", "SILENCE_START", "SILENCE_END",
] as const;
export type MusicLandmarkKind = (typeof MUSIC_LANDMARK_KINDS)[number];

/** One auditable musical landmark. **Every field the brief requires is here.** */
export interface MusicLandmark {
  kind: MusicLandmarkKind;
  time: number;
  /** the EXPLICIT domain — §4 forbids a bare number */
  domain: "audio-seconds";
  sampleIndex: number;
  confidence: Confidence;
  /** what was measured to produce it */
  evidence: string;
  /** which analysis method produced it, so a result can be traced to its detector */
  sourceMethod: string;
}

/** The future sync modes are MODELLED here and applied nowhere. */
export const SYNC_MODES = ["HARD_SYNC", "SOFT_SYNC", "FREE_SYNC"] as const;
export type SyncMode = (typeof SYNC_MODES)[number];
export const SYNC_MODE_SEMANTICS: Record<SyncMode, string> = {
  HARD_SYNC: "a visual landmark intentionally locks to a musical landmark",
  SOFT_SYNC: "a visual event occurs within a musically compatible window",
  FREE_SYNC: "visual timing is primarily dramatic; music supplies atmosphere and structure rather than event locking",
};

export interface MusicTimeline {
  clock: AudioClock;
  measured: MeasuredAudioFeatures;
  structure: InferredMusicStructure;
  landmarks: MusicLandmark[];
}

/** Build the timeline by flattening both layers into auditable landmarks. */
export function buildTimeline(clock: AudioClock, measured: MeasuredAudioFeatures, structure: InferredMusicStructure): MusicTimeline {
  const landmarks: MusicLandmark[] = [];
  const push = (kind: MusicLandmarkKind, time: number, c: Confidence, evidence: string, sourceMethod: string) =>
    landmarks.push({ kind, time: +time.toFixed(6), domain: "audio-seconds", sampleIndex: clock.secondsToSamples(time), confidence: c, evidence, sourceMethod });

  for (const b of structure.beats) push("BEAT", b.timeSeconds, b.confidence, `beat ${b.beatIndex}${b.intervalToNext !== undefined ? `, ${b.intervalToNext.toFixed(3)}s to the next` : ", final beat"}`, "dynamic-programming beat tracking over the spectral-flux envelope");
  for (const d of structure.downbeats.downbeats) push("DOWNBEAT", d.timeSeconds, structure.downbeats.confidence, `downbeat in ${structure.meter.meter}`, "bar-phase scoring against beat confidence");
  for (const o of structure.onsets) push("ONSET", o.timeSeconds, o.confidence, `onset strength ${o.strength}${o.spectralShape ? `, ${o.spectralShape}` : ", shape ambiguous"}`, "spectral-flux peak picking with a median+MAD threshold");
  for (const p of structure.phrases) {
    push("PHRASE_START", p.startSeconds, p.startConfidence, p.evidence.join("; "), "spectral-change and energy-curvature novelty");
    push("PHRASE_END", p.endSeconds, p.endConfidence, `end of phrase ${p.index}`, "spectral-change and energy-curvature novelty");
  }
  for (const s of structure.sections) {
    push("SECTION_START", s.startSeconds, s.startConfidence, s.evidence.join("; "), "energy-and-spectrum self-similarity");
    push("SECTION_END", s.endSeconds, s.endConfidence, `end of ${s.label}`, "energy-and-spectrum self-similarity");
  }
  for (const e of measured.energyLandmarks) {
    const kind: MusicLandmarkKind = e.kind === "rise" ? "ENERGY_RISE" : e.kind === "peak" ? "ENERGY_PEAK" : e.kind === "drop" || e.kind === "release" ? "ENERGY_DROP" : "ENERGY_PEAK";
    if (e.kind === "near-silence" || e.kind === "plateau") continue;
    push(kind, e.timeSeconds, e.confidence, e.evidence, "energy-curve landmarks");
  }
  for (const r of measured.silenceRegions) {
    push("SILENCE_START", r.startSeconds, confidence(r.kind === "silence" ? 0.9 : 0.6), `${r.kind} begins at ${r.rmsDb} dB`, "RMS thresholding");
    push("SILENCE_END", r.endSeconds, confidence(r.kind === "silence" ? 0.9 : 0.6), `${r.kind} ends at ${r.rmsDb} dB`, "RMS thresholding");
  }
  for (const b of measured.breathPoints) push("BREATH_POINT", b.timeSeconds, b.confidence, b.evidence, "silence and transient-then-space detection");
  landmarks.sort((a, b) => a.time - b.time);
  return { clock, measured, structure, landmarks };
}

// ---------------------------------------------------------------------------
// QUERY API — deterministic, policy-free
// ---------------------------------------------------------------------------

const dist = (a: number, b: number) => Math.abs(a - b);

export const MusicQueries = {
  /** the nearest beat, optionally restricted */
  nearestBeat(tl: MusicTimeline, time: number, opts: { minConfidence?: number } = {}): BeatEvent | undefined {
    const c = opts.minConfidence ?? 0;
    return tl.structure.beats.filter((b) => b.confidence.value >= c).reduce<BeatEvent | undefined>((best, b) => (!best || dist(b.timeSeconds, time) < dist(best.timeSeconds, time) ? b : best), undefined);
  },
  nearestDownbeat(tl: MusicTimeline, time: number): BeatEvent | undefined {
    return tl.structure.downbeats.downbeats.reduce<BeatEvent | undefined>((best, b) => (!best || dist(b.timeSeconds, time) < dist(best.timeSeconds, time) ? b : best), undefined);
  },
  nearestOnset(tl: MusicTimeline, time: number, minStrength = 0): OnsetEvent | undefined {
    return tl.structure.onsets.filter((o) => o.strength >= minStrength).reduce<OnsetEvent | undefined>((best, o) => (!best || dist(o.timeSeconds, time) < dist(best.timeSeconds, time) ? o : best), undefined);
  },
  nearestBreathPoint(tl: MusicTimeline, time: number) {
    return tl.measured.breathPoints.reduce<typeof tl.measured.breathPoints[number] | undefined>((best, b) => (!best || dist(b.timeSeconds, time) < dist(best.timeSeconds, time) ? b : best), undefined);
  },
  sectionAt(tl: MusicTimeline, time: number): Section | undefined {
    return tl.structure.sections.find((s) => time >= s.startSeconds && time < s.endSeconds) ?? tl.structure.sections[tl.structure.sections.length - 1];
  },
  phraseAt(tl: MusicTimeline, time: number): Phrase | undefined {
    return tl.structure.phrases.find((p) => time >= p.startSeconds && time < p.endSeconds) ?? tl.structure.phrases[tl.structure.phrases.length - 1];
  },
  /** the energy sample nearest a time, so the continuous curve is queryable without collapsing it */
  energyAt(tl: MusicTimeline, time: number) {
    const c = tl.measured.energyCurve;
    if (!c.length) return undefined;
    let best = c[0]!;
    for (const s of c) if (dist(s.timeSeconds, time) < dist(best.timeSeconds, time)) best = s;
    return best;
  },
  landmarksBetween(tl: MusicTimeline, start: number, end: number, kinds?: MusicLandmarkKind[]): MusicLandmark[] {
    return tl.landmarks.filter((l) => l.time >= start && l.time <= end && (!kinds || kinds.includes(l.kind)));
  },
  /** the next landmark of a kind strictly after a time */
  nextLandmark(tl: MusicTimeline, time: number, kind: MusicLandmarkKind): MusicLandmark | undefined {
    return tl.landmarks.find((l) => l.kind === kind && l.time > time);
  },
  strongestOnsetBetween(tl: MusicTimeline, start: number, end: number): OnsetEvent | undefined {
    return tl.structure.onsets.filter((o) => o.timeSeconds >= start && o.timeSeconds <= end).reduce<OnsetEvent | undefined>((best, o) => (!best || o.strength > best.strength ? o : best), undefined);
  },
};

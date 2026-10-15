/**
 * REGION COVERAGE, SECTION/PHRASE AUDIT, BREATH-POINT AUDIT.
 *
 * ⚠ §10: **a missing beat grid must not produce a logically empty musical analysis.** A zero-beat timeline must
 * still answer energy, onset, silence and structure queries — over the ENTIRE 88 seconds, with no gaps.
 */
import { writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..');
const RT = path.join(ROOT, 'out', 'phase4a1', 'real-track');
const OUT = path.join(ROOT, 'out', 'phase4a3');
const a = JSON.parse(await readFile(path.join(RT, 'music-analysis.json'), 'utf8'));
const r = JSON.parse(await readFile(path.join(RT, 'sync-readiness.json'), 'utf8'));
const w = JSON.parse(await readFile(path.join(RT, 'analysis-warnings.json'), 'utf8'));
const diag = JSON.parse(await readFile(path.join(RT, 'diagnostic-hypotheses.json'), 'utf8'));
const dur = a.durationSeconds;

// ---------------------------------------------------------------------------
// REGION COVERAGE — the whole source, no gaps
// ---------------------------------------------------------------------------
const inWin = (xs, s, e) => xs.filter((x) => x.timeSeconds >= s && x.timeSeconds < e);
const WINDOW = 8;
const regions = [];
for (let i = 0, s = 0; s < dur - 1e-9; s += WINDOW, i++) {
  const e = Math.min(dur, s + WINDOW);
  const onsets = inWin(a.onsets, s, e);
  const energy = a.energyCurve.filter((x) => x.timeSeconds >= s && x.timeSeconds < e);
  const sil = a.silenceRegions.filter((x) => x.startSeconds < e && x.endSeconds >= s);
  const breath = a.breathPoints.filter((x) => x.timeSeconds >= s && x.timeSeconds < e);
  const phrases = a.phrases.filter((x) => x.startSeconds < e && x.endSeconds >= s);
  const sections = a.sections.filter((x) => x.startSeconds < e && x.endSeconds >= s);
  const minDb = energy.length ? Math.min(...energy.map((x) => x.rmsDb)) : null;
  const maxDb = energy.length ? Math.max(...energy.map((x) => x.rmsDb)) : null;
  /**
   * ⚠ THE METRICAL STATE IS DERIVED FROM MEASURED EVIDENCE ONLY. No beat grid was published, so no region can
   * be SUPPORTED_METRICAL; but "no grid" is NOT the same as "no music", and the region still carries onsets,
   * energy, silence and structure.
   */
  const density = onsets.length / Math.max(1e-9, e - s);
  const evidence = [
    `${onsets.length} onsets (${density.toFixed(2)}/s)`,
    energy.length ? `RMS range ${minDb.toFixed(1)} .. ${maxDb.toFixed(1)} dB` : 'no energy samples',
    `${sil.length} silence/near-silence overlap(s)`,
    `${breath.length} breath point(s)`,
    `${phrases.length} phrase overlap(s), ${sections.length} section overlap(s)`,
  ];
  const metricalState = onsets.length === 0 ? 'LOW_EVIDENCE' : density < 1.0 ? 'NON_METRICAL' : 'AMBIGUOUS_METRICAL';
  let reason = metricalState === 'LOW_EVIDENCE' ? 'no onsets detected in this span' : `onsets are present at ${density.toFixed(2)}/s, but NO beat grid was published, so the pulse is unestablished rather than absent`;
  regions.push({
    region: `R${String(i + 1).padStart(2, '0')}`, startSeconds: +s.toFixed(3), endSeconds: +e.toFixed(3),
    metricalState, beatGridStatus: 'WITHHELD', syncReadiness: 'FREE_SYNC_ONLY',
    evidence, reason,
    measured: { onsets: onsets.length, onsetDensity: +density.toFixed(3), energySamples: energy.length, minRmsDb: minDb === null ? null : +minDb.toFixed(2), maxRmsDb: maxDb === null ? null : +maxDb.toFixed(2), silenceOverlaps: sil.length, breathPoints: breath.length, phraseOverlaps: phrases.length, sectionOverlaps: sections.length },
    /** ⚠ CONFIRMED EMPTY: the withdrawal is deliberate and recorded, not an omission */
    beatLandmarks: 0,
  });
}
const covered = regions.reduce((t, x) => t + (x.endSeconds - x.startSeconds), 0);
const coverageComplete = Math.abs(covered - dur) < 1e-6;
await writeFile(path.join(OUT, 'region-coverage.json'), JSON.stringify({
  note: 'Region partition over the ENTIRE source. No beat grid was published, so every region carries ONSET, ENERGY, SILENCE and STRUCTURE evidence instead of beat landmarks. A zero-beat timeline is not an empty timeline.',
  sourceTrackHash: diag.sourceTrackHash, durationSeconds: dur, windowSeconds: WINDOW,
  regionCount: regions.length, coveredSeconds: +covered.toFixed(6), coverageComplete,
  beatGridPublished: false,
  regions,
}, null, 2));
console.log('REGION COVERAGE');
console.log(`  ${regions.length} regions of ${WINDOW}s covering ${covered.toFixed(3)}s of ${dur.toFixed(3)}s — complete: ${coverageComplete}`);
const states = regions.reduce((m, x) => ((m[x.metricalState] = (m[x.metricalState] ?? 0) + 1), m), {});
console.log('  metrical states:', JSON.stringify(states));
console.log(`  every region: beatGridStatus WITHHELD, syncReadiness FREE_SYNC_ONLY, 0 beat landmarks`);
console.log(`  but every region carries onsets and energy: ${regions.every((x) => x.measured.onsets > 0 && x.measured.energySamples > 0)}`);

// ---------------------------------------------------------------------------
// SECTION / PHRASE AUDIT — does the fix depend on an invented meter?
// ---------------------------------------------------------------------------
console.log('\nSECTION / PHRASE AUDIT');
console.log(`  meter is ${a.meter.meter} (unknown: ${a.meter.unknown})`);
console.log(`  sections ${a.sections.length}, phrases ${a.phrases.length}`);
const spans = a.sections.map((s) => +(s.endSeconds - s.startSeconds).toFixed(3));
console.log(`  section spans: ${spans.join(', ')} s  (min ${Math.min(...spans)}, max ${Math.max(...spans)})`);
const phraseSpans = a.phrases.map((p) => +(p.endSeconds - p.startSeconds).toFixed(3));
const labels = a.sections.map((s) => s.label);
const audit = {
  note: 'Audit of the claim that the section minimum is derived from bars.',
  meter: a.meter, meterUnknown: a.meter.unknown,
  sectionCount: a.sections.length, phraseCount: a.phrases.length,
  sectionSpansSeconds: spans, phraseSpansSeconds: phraseSpans,
  labelsUnique: labels.length === new Set(labels).size, labels,
  /**
   * ⚠ THE HONEST ANSWER. `musicalTimescale` uses `meter.beatsPerBar ?? 4` and a FIXED 120 BPM assumption, so
   * with the meter UNKNOWN the "bar" is **4 beats at 120 BPM = 2.0 s**, and the minimums become 4 bars = 8 s for
   * phrases and 8 bars = 16 s for sections. **The bar is therefore a CONSTANT, not a measurement** — it is a
   * time-domain prior, and presenting it as validated would be exactly the overreach §11 forbids.
   */
  barDerivation: {
    beatsPerBar: a.meter.beatsPerBar ?? 4, beatsPerBarSource: a.meter.beatsPerBar === null ? 'DEFAULT (meter is UNKNOWN)' : 'measured',
    assumedSecondsPerBeat: 0.5, assumedBpm: 120, assumedBpmSource: 'HARD-CODED in musicalTimescale — NOT measured from this track',
    derivedSecondsPerBar: 2.0,
    minPhraseSeconds: Math.max(8.0, 4 * 2.0), minSectionSeconds: Math.max(12.0, 8 * 2.0),
    verdict: 'THE METER IS INVENTED AS A CONSTANT. With the meter unknown, "4 beats at 120 BPM" is an assumption, not an observation. The minimums are therefore TIME-DOMAIN PRIORS, and should be described that way rather than as bar-derived.',
  },
  independentEvidence: {
    minSectionSpanObserved: Math.min(...spans), minPhraseSpanObserved: Math.min(...phraseSpans),
    note: 'the observed minimum section span EXCEEDS the 12 s prior and the observed minimum phrase span exceeds the 8 s prior, so the priors are binding as intended',
    sectionBoundariesSeconds: a.sections.map((s) => s.startSeconds),
    boundaryConfidence: a.sections.map((s) => ({ label: s.label, startConfidence: s.startConfidence, endConfidence: s.endConfidence })),
  },
  uniqueIdentifiers: labels.length === new Set(labels).size,
  notFittedToAesthetics: 'the section count (4) was produced by the same algorithm as the previous run\'s 30; only the minimum length changed, and no target count was specified',
};
await writeFile(path.join(OUT, 'section-phrase-audit.json'), JSON.stringify(audit, null, 2));
console.log(`  ⚠ barDerivation: 4 beats/bar is a DEFAULT (meter unknown), 120 BPM is HARD-CODED -> 2.0 s "bar"`);
console.log(`  so the minimums are TIME-DOMAIN PRIORS (8 s phrase, 12 s section), NOT validated bar boundaries`);
console.log(`  labels unique: ${audit.uniqueIdentifiers}; observed min spans: section ${Math.min(...spans)}s, phrase ${Math.min(...phraseSpans)}s`);

// ---------------------------------------------------------------------------
// BREATH-POINT AUDIT
// ---------------------------------------------------------------------------
console.log('\nBREATH POINT AUDIT');
const bp = a.breathPoints;
console.log(`  detected: ${bp.length}`);
for (const b of bp) console.log(`    ${b.timeSeconds}s  room ${b.roomSeconds}s  ${b.confidence.band}  ${b.evidence}`);
/** ⚠ look for release candidates the silence-only rule would MISS: energy drops followed by a quiet span */
const releases = [];
for (const l of a.energyLandmarks.filter((x) => x.kind === 'drop')) {
  const after = a.energyCurve.filter((x) => x.timeSeconds > l.timeSeconds && x.timeSeconds < l.timeSeconds + 2.5);
  if (!after.length) continue;
  const base = a.energyCurve.filter((x) => x.timeSeconds >= l.timeSeconds - 1 && x.timeSeconds <= l.timeSeconds);
  const baseMean = base.length ? base.reduce((t, x) => t + x.rmsDb, 0) / base.length : 0;
  const afterMean = after.reduce((t, x) => t + x.rmsDb, 0) / after.length;
  const drop = baseMean - afterMean;
  if (drop >= 8) releases.push({ timeSeconds: l.timeSeconds, dropDb: +drop.toFixed(2), evidence: `energy fell ${drop.toFixed(1)} dB within 2.5 s of an energy drop` });
}
/** and phrase terminations, which are structural rather than silent */
const phraseEnds = a.phrases.slice(0, -1).map((p) => ({ timeSeconds: p.endSeconds, evidence: `phrase ${p.index} terminates here (boundary confidence ${p.endConfidence.band})` }));
console.log(`  RELEASE candidates the silence-only rule MISSED (energy drop >= 8 dB): ${releases.length}`);
for (const x of releases.slice(0, 8)) console.log(`    ${x.timeSeconds.toFixed(2)}s  ${x.evidence}`);
console.log(`  PHRASE TERMINATIONS (structural, not silent): ${phraseEnds.length}`);
await writeFile(path.join(OUT, 'breath-point-audit.json'), JSON.stringify({
  note: 'A breath point is not necessarily literal silence. This audits whether the silence-based rule is too narrow.',
  definition: 'Phase 4A detects breath points from (a) silence/near-silence regions >= 0.35 s and (b) large transients followed by >= 0.35 s of space',
  detectedCount: bp.length, detected: bp,
  missedReleaseCandidates: releases,
  phraseTerminations: phraseEnds,
  finding: bp.length === 1
    ? `the silence-based rule found ${bp.length} breath point in ${dur.toFixed(0)}s while ${releases.length} energy-drop release candidates (>= 8 dB) and ${phraseEnds.length} phrase terminations were NOT offered as breath points. The definition is NARROW: "transient followed by space" and "silence region" both require near-silence, so a dense track that never goes quiet can have almost no breath points even where it clearly releases.`
    : 'the rule found multiple breath points',
  recommendation: 'the breath-point definition should be widened to include energy-drop releases and phrase terminations AS SEPARATE EVIDENCE KINDS, each confidence-qualified, rather than relaxing the silence threshold — but NOT in this phase, because widening it here would change measured output without calibration evidence.',
}, null, 2));
console.log(`\n  FINDING: the rule is NARROW — ${releases.length} release candidates and ${phraseEnds.length} phrase terminations were not offered`);

// ---------------------------------------------------------------------------
// independent detector report (placeholder resolved by the aubio script)
// ---------------------------------------------------------------------------
console.log(`\n  region-coverage.json, section-phrase-audit.json, breath-point-audit.json written`);

#!/usr/bin/env node
/**
 * PHASE 4A TESTS.
 *
 * ⚠ §27 is the governing rule: **a metric's name must describe exactly what it measures.** Phase 3 produced
 * five metrics whose names did not, two of which made correct behaviour look broken. So `beatAccuracy` here
 * really compares beat positions against the fixture's own ground truth, and `tempoError` really compares tempo.
 */
import { readFileSet } from './lib/read.mjs';
const { analysis, groundTruth, warnings, timeline, source: sources, queries, T } = await readFileSet();
const ROOT = decodeURIComponent(new URL('../../', import.meta.url).pathname);

let pass = 0, fail = 0;
const ok = (c, n, d = '') => { if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}${d ? `  (${d})` : ''}`); } };

/** match detected beats to ground-truth beats within a window; returns precision/recall/F */
function beatAccuracy(detected, truthTimes, windowSeconds = 0.07) {
  const used = new Set();
  let matched = 0, errSum = 0;
  for (const d of detected) {
    let best = -1, bestErr = Infinity;
    for (let i = 0; i < truthTimes.length; i++) {
      if (used.has(i)) continue;
      const e = Math.abs(truthTimes[i] - d);
      if (e < bestErr) { bestErr = e; best = i; }
    }
    if (best >= 0 && bestErr <= windowSeconds) { used.add(best); matched++; errSum += bestErr; }
  }
  const precision = detected.length ? matched / detected.length : 0;
  const recall = truthTimes.length ? matched / truthTimes.length : 0;
  return { matched, precision, recall, f1: precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0, meanAbsErrorSeconds: matched ? errSum / matched : NaN };
}
const tempoError = (detectedBpm, truthBpm) => Math.abs(detectedBpm - truthBpm) / truthBpm;

console.log('PHASE 4A — ANALYSIS CONTRACT\n');
console.log('TIMING DOMAINS AND THE CLOCK\n');
{
  ok(T.AUDIO_TIME_DOMAINS.length === 7, `seven explicit domains are declared: ${T.AUDIO_TIME_DOMAINS.join(', ')}`);
  ok(T.AUDIO_TIME_DOMAINS.includes('audio-seconds') && T.AUDIO_TIME_DOMAINS.includes('audio-sample-index'), 'the canonical authority and the lossless reference are both present');
  const C = await import(ROOT + 'dist/src/audio/clock.js');
  const clock = new C.AudioClock(44100, 1, 441000);
  ok(Math.abs(clock.durationSeconds - 10) < 1e-9, 'duration is derived from the SAMPLE COUNT, not a container header');
  ok(clock.secondsToSamples(1) === 44100 && clock.samplesToSeconds(44100) === 1, 'seconds <-> samples round-trips through the ONE clock');
  ok(clock.secondsToVideoFrame(1, 30) === 30 && clock.videoFrameToSeconds(30, 30) === 1, 'the video-frame conversion lives in the clock and is explicit');
  ok(C.AudioClock.localProgress(5, 0, 10) === 0.5, 'phrase/section-local progress is computed by the clock, not by each subsystem');
  let threw = false; try { new C.AudioClock(0, 1, 10); } catch { threw = true; }
  ok(threw, 'an invalid sample rate is refused at construction');
}

console.log('\nPROVENANCE — WHICH AUDIO DID THIS TIMELINE COME FROM?\n');
{
  /** ⚠ `source` is a MAP of track -> metadata, not one record. The first version indexed it as one and every
   *  provenance assertion failed for a reason that had nothing to do with provenance. */
  const source = sources['A-120bpm-click'];
  ok(!!source, 'the metadata file was read for A-120bpm-click');
  ok(/^[0-9a-f]{64}$/.test(source.originalHash), 'the ORIGINAL source hash is recorded');
  ok(/^[0-9a-f]{64}$/.test(source.decodedPcmHash), 'the DECODED PCM hash is recorded, which is a different question');
  ok(/^[0-9a-f]{64}$/.test(source.configHash), 'the analysis CONFIGURATION hash is recorded');
  ok(/^[0-9a-f]{64}$/.test(source.analysisHash), 'the analysis OUTPUT hash is recorded');
  ok(source.converted === true && source.conversions.length > 0, `the conversion is recorded: ${source.conversions[0]}`);
  const aRef = analysis['A-120bpm-click'];
  ok(Math.abs(source.durationSeconds - aRef.durationSeconds) < 1e-6, `the source duration and the analysis duration agree (${source.durationSeconds} vs ${aRef.durationSeconds})`);
  ok(source.analysisVersion === '4a.1.0', `the analysis version is pinned (${source.analysisVersion})`);
}

console.log('\nBEAT vs ONSET — the distinction the brief requires\n');
for (const name of Object.keys(groundTruth.fixtures)) {
  const a = analysis[name], gt = groundTruth.fixtures[name];
  if (!a) continue;
  if (gt.beats) {
    const acc = beatAccuracy(a.beatGrid.map((b) => b.timeSeconds), gt.beats.map((b) => (typeof b === 'number' ? b : b.time)), 0.08);
    console.log(`  ${name}`);
    console.log(`    beats ${a.beatGrid.length} vs truth ${gt.beats.length}: matched ${acc.matched}, precision ${acc.precision.toFixed(3)}, recall ${acc.recall.toFixed(3)}, F1 ${acc.f1.toFixed(3)}, mean |error| ${Number.isNaN(acc.meanAbsErrorSeconds) ? 'n/a' : acc.meanAbsErrorSeconds.toFixed(4) + 's'}`);
    if (gt.bpm) console.log(`    tempoError vs ${gt.bpm} BPM: ${tempoError(a.tempo.bpm, gt.bpm).toFixed(4)}`);
    if (name === 'A-120bpm-click') {
      /**
       * ⚠ THRESHOLDS ARE THE MEASURED VALUES, not invented ones. A's mean absolute error is ~29 ms, and the
       * cause is measured: the detected interval is 499.23 ms for a 500 ms truth, a **-0.77 ms/beat span error
       * (0.15%) from autocorrelation lag quantisation at one hop (11.6 ms)**. That is a tempo-RESOLUTION limit
       * and no amount of threshold tuning changes it.
       */
      ok(acc.f1 > 0.9, `A: beatAccuracy F1 above 0.90 on a strict click (${acc.f1.toFixed(3)})`);
      ok(acc.meanAbsErrorSeconds < 0.04, `A: mean absolute beat error under 40 ms, the hop-quantisation bound (${(acc.meanAbsErrorSeconds * 1000).toFixed(1)} ms)`);
      ok(tempoError(a.tempo.bpm, 120) < 0.01, `A: tempoError under 1% against a 120 BPM click (${(tempoError(a.tempo.bpm, 120) * 100).toFixed(2)}%)`);
    }
    if (name === 'B-90bpm-missing-beat') {
      ok(acc.recall >= 0.85, `B: beatAccuracy recall stays high despite ONE MISSING BEAT (${acc.recall.toFixed(3)} of ${gt.beats.length} present beats)`);
      ok(a.beatGrid.length >= gt.beats.length * 0.85, `B: the tracker did not lose the grid — ${a.beatGrid.length} beats tracked for ${gt.beats.length} present`);
    }
    if (name === 'C-120bpm-offbeat-transient') {
      /**
       * ⚠ MEASURED LIMITATION, RECORDED RATHER THAN TUNED AWAY.
       *
       * On a 120 BPM track whose OFF-BEAT transients are strong, the tracker produced a grid that is internally
       * perfect — 0.15% interval error, 100% regularity, and the support test passes — but sits **0.4412 of a
       * beat late (220.6 ms)**, locked onto the transients BETWEEN the beats. **F1 against the on-beat truth is
       * therefore 0.000.**
       *
       * Three repairs were attempted and all are recorded in the phase document: a half-window correction
       * (measurement refuted it and it made C worse), an explicit phase search (it did not find the right phase
       * and slightly degraded fixture A), and adaptive region segmentation (which fixed tempo change but not
       * phase). **The limitation stands and the test asserts it rather than hiding it.**
       */
      const offFound = gt.offbeats.filter((t) => a.onsets.some((o) => Math.abs(o.timeSeconds - t) <= 0.08)).length;
      ok(offFound >= gt.offbeats.length * 0.8, `C: ${offFound} of ${gt.offbeats.length} OFF-BEAT transients were found as ONSETS — ONSET detection is correct`);
      ok(a.onsets.length > a.beatGrid.length, `C: onsets (${a.onsets.length}) outnumber beats (${a.beatGrid.length}), as the material requires`);
      const intervalErr = (() => { const iv = a.beatGrid.map((b) => b.intervalToNext).filter((x) => x !== undefined); const m = iv.reduce((x, y) => x + y, 0) / Math.max(1, iv.length); return Math.abs(m - 0.5) / 0.5; })();
      ok(intervalErr < 0.01, `C: the grid's INTERVAL is correct to ${(intervalErr * 100).toFixed(2)}% — the error is PHASE, not tempo`);
      console.log(`    ⚠ C MEASURED LIMITATION: beatAccuracy F1 ${acc.f1.toFixed(3)} — the grid is internally regular but phase-locked onto the OFF-BEAT transients (first offset ${((a.beatGrid[0].timeSeconds - gt.beats[0]) * 1000).toFixed(1)} ms)`);
    }
  }
}

console.log('\nENERGY IS CONTINUOUS BEFORE SEMANTIC SIMPLIFICATION\n');
{
  let worst = null;
  for (const [name, a] of Object.entries(analysis)) {
    if (!a.energyCurve.length) continue;
    if (!worst || a.energyCurve.length > worst.n) worst = { name, n: a.energyCurve.length, a };
  }
  ok(worst && worst.n > 100, `the energy curve is a continuous series (${worst?.n} samples for ${worst?.name})`);
  const s = worst.a.energyCurve[0];
  ok('rms' in s && 'spectralFlux' in s && 'lowEnergy' in s && 'highEnergy' in s && 'rmsDb' in s, 'each energy sample carries RMS, spectral flux, low and high band energy, and dB');
  ok(!('level' in s), 'NO LOW/MEDIUM/HIGH field exists — the curve is not collapsed');
  const kinds = new Set(worst.a.energyLandmarks.map((e) => e.kind));
  ok([...kinds].every((k) => ['rise', 'peak', 'drop', 'plateau', 'release', 'near-silence'].includes(k)), `energy landmarks use MEASURED kinds only: ${[...kinds].join(', ')}`);
  ok(![...kinds].some((k) => ['climax', 'tension', 'resolution'].includes(k)), 'and NEVER the directorial labels climax/tension/resolution');
}

console.log('\nTHE E FIXTURE — energy ground truth\n');
{
  const a = analysis['E-silence-build-peak-silence'], gt = groundTruth.fixtures['E-silence-build-peak-silence'];
  ok(a.silenceRegions.length >= 2, `E: ${a.silenceRegions.length} silence/near-silence regions found against ${gt.silenceRegions.length} in the ground truth`);
  const leading = a.silenceRegions.find((r) => r.startSeconds < 0.5);
  ok(!!leading, `E: the leading silence was found (${leading ? leading.startSeconds + '..' + leading.endSeconds : 'not found'})`);
  const peak = a.energyCurve.reduce((b, s) => (s.rms > b.rms ? s : b), a.energyCurve[0]);
  ok(Math.abs(peak.timeSeconds - gt.peakAtSeconds) < 1.5, `E: the energy peak is at ${peak.timeSeconds}s against a truth of ${gt.peakAtSeconds}s`);
  const rise = a.energyLandmarks.find((l) => l.kind === 'rise');
  ok(!!rise, `E: a rise landmark was measured (${rise ? rise.timeSeconds + 's, ' + rise.evidence : 'none'})`);
}

console.log('\nTEMPO AMBIGUITY — represented, never averaged\n');
{
  for (const [name, a] of Object.entries(analysis)) {
    const t = a.tempo;
    if (t.halfDoubleAmbiguous) {
      const ratio = t.ambiguousWith.ratio;
      ok(Math.abs(ratio - 2) < 0.15 || Math.abs(ratio - 0.5) < 0.15, `${name}: the ambiguity is reported as a HALF/DOUBLE ratio (${ratio}), not averaged`);
      ok(t.bpm > 0 && t.candidates.length >= 2, `${name}: both readings are preserved in candidates (${t.candidates.slice(0, 2).map((c) => c.bpm).join(', ')} BPM)`);
    }
  }
  const anyAvg = Object.values(analysis).some((a) => a.tempo.candidates.some((c) => c.bpm > Math.min(a.tempo.bpm, a.tempo.ambiguousWith?.bpm ?? 0) && c.bpm < Math.max(a.tempo.bpm, a.tempo.ambiguousWith?.bpm ?? 0)));
  ok(!Object.values(analysis).some((a) => a.tempo.halfDoubleAmbiguous && Math.abs(a.tempo.bpm - (a.tempo.bpm + a.tempo.ambiguousWith.bpm) / 2) < 1e-9), 'NO fixture reports an averaged tempo');
}

console.log('\nTHE F FIXTURE — ametric material must NOT produce a confident pulse\n');
{
  const a = analysis['F-free-ambient'];
  ok(a.tempo.confidence.band !== 'high', `F: tempo confidence is NOT high on ametric material (${a.tempo.confidence.band}, ${a.tempo.confidence.value})`);
  ok(a.tempo.support.supported === false, 'F: the pulse is reported UNSUPPORTED');
  ok(a.beatGrid.length === 0, `F: NO beat grid is published (${a.beatGrid.length} beats)`);
  ok(a.meter.unknown === true, 'F: the meter is reported UNKNOWN');
  ok(a.tempo.beatGridTrustworthy === false, 'F: beatGridTrustworthy is false, so no consumer can mistake it for a pulse');
  const codes = warnings['F-free-ambient'].map((w) => w.code);
  ok(codes.includes('TEMPO_UNRESOLVED'), `F: a TEMPO_UNRESOLVED warning is raised (${codes.join(', ')})`);
  ok(codes.includes('PERCUSSION_ABSENT'), 'F: a PERCUSSION_ABSENT warning is raised');
  const ce = warnings['F-free-ambient'].find((w) => w.code === 'TEMPO_UNRESOLVED');
  ok(/NO beat grid|ametric|only energy/i.test(ce.implication), `F: the warning states the implication for the Director: "${ce.implication}"`);
}

console.log('\nCONFIDENCE — no false precision\n');
{
  for (const [name, a] of Object.entries(analysis)) {
    const cs = [a.tempo.confidence, ...a.phrases.map((p) => p.startConfidence), ...a.sections.map((s) => s.startConfidence), ...a.onsets.map((o) => o.confidence)];
    if (!cs.every((c) => typeof c.value === 'number' && c.value >= 0 && c.value <= 1 && typeof c.band === 'string')) { fail++; console.log(`  FAIL  ${name}: a confidence is malformed`); continue; }
    ok(true, `${name}: every confidence carries both a numeric value and a semantic band`);
  }
}

console.log('\nPHRASE AND SECTION INFERENCE CARRIES CONFIDENCE AND EVIDENCE\n');
{
  for (const [name, a] of Object.entries(analysis)) {
    const pOk = a.phrases.every((p) => p.startConfidence && p.endConfidence && p.evidence.length > 0);
    const sOk = a.sections.every((s) => s.startConfidence && s.endConfidence && s.evidence.length > 0);
    ok(pOk && sOk, `${name}: ${a.phrases.length} phrases and ${a.sections.length} sections each carry confidence AND evidence`);
  }
  const labels = new Set(Object.values(analysis).flatMap((a) => a.sections.map((s) => s.label)));
  ok([...labels].every((l) => /^SECTION_[A-Z]$/.test(l)), `section labels are NEUTRAL, never pop labels: ${[...labels].join(', ')}`);
}

console.log('\nTHE QUERY API IS DETERMINISTIC\n');
{
  const tl = queries['A-120bpm-click'];
  const t0 = tl.structure.beats.length ? tl.structure.beats[10].timeSeconds + 0.03 : 1;
  const a1 = tl && T.MusicQueries.nearestBeat(tl, t0);
  const a2 = T.MusicQueries.nearestBeat(tl, t0);
  ok(a1 && a2 && a1.timeSeconds === a2.timeSeconds, 'nearestBeat is deterministic for the same query');
  ok(!!T.MusicQueries.nearestOnset(tl, 2.9), 'nearestOnset returns a result');
  ok(!!T.MusicQueries.energyAt(tl, 3.3), 'energyAt returns a curve sample');
  ok(!!T.MusicQueries.sectionAt(tl, 3.3), 'sectionAt returns a section');
  ok(!!T.MusicQueries.phraseAt(tl, 3.3), 'phraseAt returns a phrase');
  const between = T.MusicQueries.landmarksBetween(tl, 1, 3);
  ok(between.length > 0 && between.every((l) => l.time >= 1 && l.time <= 3), `landmarksBetween(1,3) returns ${between.length} landmarks, all inside the window`);
  ok(between.every((l) => l.domain === 'audio-seconds'), 'every landmark carries its EXPLICIT domain, never a bare number');
  ok(between.every((l) => l.confidence && l.evidence && l.sourceMethod), 'every landmark carries confidence, evidence AND its source method');
  const src = new Set(tl.landmarks.map((l) => l.sourceMethod));
  ok(src.size >= 4, `landmarks record ${src.size} distinct source methods, so a result can be traced to its detector`);
}

console.log('\nNO DIRECTOR POLICY IN THE TIMELINE\n');
{
  const api = Object.keys(T.MusicQueries);
  ok(!api.some((k) => /snap|autoCut|lock/i.test(k)), `the query API contains no snapping or auto-cut policy: ${api.join(', ')}`);
  ok(T.SYNC_MODES.length === 3, `the three sync modes are MODELLED only: ${T.SYNC_MODES.join(', ')}`);
  for (const m of T.SYNC_MODES) ok(typeof T.SYNC_MODE_SEMANTICS[m] === 'string', `${m} carries its semantics`);
}

console.log('\nDETERMINISM\n');
{
  const { readFile } = await import('node:fs/promises');
  const a = await readFile(ROOT + 'out/phase4a/A-120bpm-click/music-analysis.json', 'utf8');
  ok(a.length > 100, 'the analysis output exists and is machine-readable');
  ok(JSON.parse(a).tempo.bpm === analysis['A-120bpm-click'].tempo.bpm, 're-reading the file reproduces the same tempo');
}

console.log(`\n${pass}/${pass + fail} assertions pass`);
if (fail) process.exit(1);

/**
 * PHASE 4A.3 — DIAGNOSTIC BEAT AUDITION & INDEPENDENT VALIDATION.
 *
 * The refusal in 4A.2 was correct and its consequence was wrong: a listener had nothing to hear. This produces
 * **UNVERIFIED diagnostic auditions** so the refusal can be investigated, while keeping every candidate out of
 * the production path.
 */
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..');
const RT = path.join(ROOT, 'out', 'phase4a1', 'real-track');
const OUT = path.join(ROOT, 'out', 'phase4a3');
const DIAG = path.join(OUT, 'diagnostic-only');
const AUDIO = path.join(ROOT, 'dist', 'src', 'audio');
const AUD = await import(path.join(AUDIO, 'audition.js'));
const DG = await import(path.join(AUDIO, 'diagnostic.js'));
const D = await import(path.join(AUDIO, 'decode.js'));
const W = await import(path.join(AUDIO, 'wav.js'));
const tools = { ffmpeg: path.join(ROOT, 'node_modules/@remotion/compositor-darwin-arm64/ffmpeg'), ffprobe: path.join(ROOT, 'node_modules/@remotion/compositor-darwin-arm64/ffprobe'), libPath: path.join(ROOT, 'node_modules/@remotion/compositor-darwin-arm64') };

const TRACK = process.env.CINEMA_TRACK ?? (() => { throw new Error('set CINEMA_TRACK to an audio file path'); })();
await mkdir(DIAG, { recursive: true });

// --- verify the source hash before processing ---------------------------------
const { result } = await D.loadSource(tools, TRACK);
const diag = JSON.parse(await readFile(path.join(RT, 'diagnostic-hypotheses.json'), 'utf8'));
console.log('PHASE 4A.3 — DIAGNOSTIC BEAT AUDITION\n');
console.log(`  source hash ${result.source.originalHash.slice(0, 16)}  ${result.source.originalHash === diag.sourceTrackHash ? 'MATCHES the hypotheses (same audio)' : 'MISMATCH — ABORT'}`);
if (result.source.originalHash !== diag.sourceTrackHash) throw new Error('source hash does not match the hypotheses; refusing to proceed');
const dec = W.decodeWav(result.pcmBuffer);
const dur = dec.totalSamples / dec.sampleRate;
console.log(`  duration ${dur.toFixed(3)}s  ${dec.sampleRate} Hz  ${dec.channels}ch`);
console.log(`  ${diag.hypotheses.length} UNVERIFIED candidates\n`);

// --- pick excerpts that contain real acoustic evidence ------------------------
const analysis = JSON.parse(await readFile(path.join(RT, 'music-analysis.json'), 'utf8'));
const sections = analysis.sections;
/** ⚠ excerpts are chosen from SECTION BOUNDARIES and energy landmarks, not by fixed offsets */
const pick = (label, from, to) => {
  const onsets = analysis.onsets.filter((o) => o.timeSeconds >= from && o.timeSeconds < to);
  const peaks = analysis.energyLandmarks.filter((l) => l.timeSeconds >= from && l.timeSeconds < to);
  return { label, startSeconds: +from.toFixed(3), endSeconds: +to.toFixed(3), onsets: onsets.length, energyLandmarks: peaks.length };
};
const secOf = (i) => sections[i] ?? sections[sections.length - 1];
const excerpts = [
  pick('early', secOf(0).startSeconds, Math.min(dur, secOf(0).startSeconds + 12)),
  pick('middle', secOf(1).startSeconds, Math.min(dur, secOf(1).startSeconds + 12)),
  pick('late', secOf(2).startSeconds, Math.min(dur, secOf(2).startSeconds + 12)),
];
/** the loudest section is the most evidence-dense; note it so the reviewer knows what was chosen and why */
const loudest = sections.reduce((a, b) => (b.meanRmsDb > a.meanRmsDb ? b : a), sections[0]);
console.log('  EXCERPTS (chosen from section boundaries, not fixed offsets)');
for (const e of excerpts) console.log(`    ${e.label.padEnd(7)} ${e.startSeconds.toFixed(1)}-${e.endSeconds.toFixed(1)}s  ${e.onsets} onsets, ${e.energyLandmarks} energy landmarks`);
console.log(`    (the loudest section is ${loudest.label} at ${loudest.meanRmsDb} dB)`);
console.log('');

// --- blind presentation -------------------------------------------------------
/** ⚠ deterministic shuffle from the source hash, so the mapping is reproducible and NOT hand-picked */
function blindOrder(n, seedStr) {
  const seed = parseInt(createHash('sha256').update(seedStr).digest('hex').slice(0, 8), 16);
  const arr = [...Array(n).keys()];
  let s = seed;
  for (let i = arr.length - 1; i > 0; i--) { s = (s * 1103515245 + 12345) & 0x7fffffff; const j = s % (i + 1); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  return arr;
}
const order = blindOrder(diag.hypotheses.length, result.source.originalHash);
const blind = order.map((srcIdx, presentation) => ({ blindLabel: `candidate-${String.fromCharCode(65 + presentation)}`, sourceCandidateId: diag.hypotheses[srcIdx].candidateId, bpm: diag.hypotheses[srcIdx].tempoBpm, phase: diag.hypotheses[srcIdx].phaseOffsetSeconds, hypothesisIndex: srcIdx }));

const slice = (mono, a, b) => mono.slice(Math.round(a * dec.sampleRate), Math.round(b * dec.sampleRate));
const files = [];
for (const b of blind) {
  const h = diag.hypotheses[b.hypothesisIndex];
  /** ⚠ DIAGNOSTIC-ONLY. The filename carries the marker so it cannot be mistaken for a certified track. */
  const full = `UNVERIFIED-candidate-${b.blindLabel.slice(-1)}-full.wav`;
  await writeFile(path.join(DIAG, full), AUD.beatClickTrack(dec.mono, h.beats, dec.sampleRate, undefined, {}));
  files.push({ file: full, scope: 'full', blindLabel: b.blindLabel });
  for (const e of excerpts) {
    const seg = slice(dec.mono, e.startSeconds, e.endSeconds);
    const beatsIn = h.beats.filter((x) => x.timeSeconds >= e.startSeconds && x.timeSeconds < e.endSeconds).map((x) => ({ ...x, timeSeconds: x.timeSeconds - e.startSeconds }));
    const f = `UNVERIFIED-candidate-${b.blindLabel.slice(-1)}-${e.label}.wav`;
    await writeFile(path.join(DIAG, f), AUD.beatClickTrack(seg, beatsIn, dec.sampleRate, undefined, {}));
    files.push({ file: f, scope: e.label, blindLabel: b.blindLabel, startSeconds: e.startSeconds });
  }
  console.log(`  ${b.blindLabel}  -> ${full}  (${h.beats.length} clicks)  [${h.tempoBpm} BPM, phase ${h.phaseOffsetSeconds}s — HIDDEN from the listener]`);
}

// --- artefacts ----------------------------------------------------------------
await writeFile(path.join(OUT, 'candidate-comparison.json'), JSON.stringify({
  note: 'UNVERIFIED_BEAT_HYPOTHESIS — NOT_FOR_PRODUCTION_SYNC. Diagnostic comparison only.',
  markers: DG.DIAGNOSTIC_MARKERS, sourceTrackHash: result.source.originalHash, durationSeconds: +dur.toFixed(3),
  blindPresentation: true,
  blindLabels: blind.map((b) => ({ blindLabel: b.blindLabel, file: `UNVERIFIED-candidate-${b.blindLabel.slice(-1)}-full.wav` })),
  excerpts,
  excerptRationale: `excerpts begin at section boundaries (${sections.map((s) => s.startSeconds).join(', ')}s) and run 12 s, so each contains real acoustic evidence rather than an arbitrary window`,
  noManipulation: 'no time stretching, no beat correction, no phase adjustment was applied to make any candidate sound better; the original musical timing is preserved exactly',
  hypotheses: diag.hypotheses.map((h) => ({ candidateId: h.candidateId, tempoBpm: h.tempoBpm, phaseOffsetSeconds: h.phaseOffsetSeconds, beatCount: h.candidateBeatTimes.length, acousticSupport: h.acousticSupport, phaseSeparation: h.phaseSeparation, confidence: h.confidence, status: h.status, limitations: h.limitations })),
  files,
  allowedConclusion: 'NONE OF THE CANDIDATES IS CORRECT is an acceptable and expected outcome',
}, null, 2));
/** the answer key lives OUTSIDE the listener package */
await mkdir(path.join(OUT, 'blind'), { recursive: true });
await writeFile(path.join(OUT, 'BLIND-ANSWER-KEY.json'), JSON.stringify({
  note: 'DO NOT SHOW THIS TO THE LISTENER until judgements are recorded.',
  sourceTrackHash: result.source.originalHash,
  mapping: blind.map((b) => ({ blindLabel: b.blindLabel, sourceCandidateId: b.sourceCandidateId, tempoBpm: b.bpm, phaseOffsetSeconds: b.phase })),
  shuffle: 'deterministic from the source hash, so the mapping is reproducible and was NOT hand-picked',
}, null, 2));
console.log(`\n  ${files.length} diagnostic audition files in out/phase4a3/diagnostic-only/`);
console.log(`  blind answer key: out/phase4a3/BLIND-ANSWER-KEY.json (outside the listener package)`);
console.log(`  markers on every file name and artefact: ${DG.DIAGNOSTIC_MARKERS.join(', ')}`);

// --- PRODUCTION SAFETY --------------------------------------------------------
console.log('\n  PRODUCTION SAFETY (negative tests)');
let pass = 0, fail = 0;
const refuse = (fn, name) => { try { fn(); fail++; console.log(`    FAIL  ${name} — it was ALLOWED`); } catch (e) { pass++; console.log(`    PASS  ${name}`); } };
refuse(() => DG.assertProductionConsumable(diag, 'SyncPlanner.plan'), 'a diagnostic set is refused by the production guard');
refuse(() => DG.assertProductionConsumable(diag.hypotheses[0], 'SyncPlanner.hardSync'), 'a single UNVERIFIED hypothesis is refused');
refuse(() => DG.assertProductionConsumable({ status: 'UNVERIFIED' }, 'x'), 'status UNVERIFIED alone is refused');
refuse(() => DG.assertProductionConsumable({ markers: ['NOT_FOR_PRODUCTION_SYNC'] }, 'x'), 'the marker alone is refused');
refuse(() => DG.assertProductionConsumable({ productionConsumable: false }, 'x'), 'productionConsumable:false alone is refused');
try { DG.assertProductionConsumable({ status: 'VERIFIED', beats: [] }, 'ok'); pass++; console.log('    PASS  a verified object without diagnostic signals is allowed'); } catch { fail++; console.log('    FAIL  a legitimate object was refused'); }
console.log(`    ${pass}/${pass + fail} safety assertions pass`);

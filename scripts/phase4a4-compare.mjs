/**
 * §11 CONTROLLED ALGORITHM EXPERIMENT — BASELINE vs CANDIDATE, on fixtures AND the real track.
 *
 * BASELINE  : DP beat tracking (envelope-energy path) + strengthContrast certification
 * CANDIDATE : metrical density search (onset TIMES only) — peak-to-trough IOI density x beat coverage
 *
 * ⚠ Both are scored against GROUND TRUTH where it exists, and against each other's ABSTENTION behaviour on
 * material where no metre exists. Improvement AND regression are both reported.
 */
import { writeFile, readFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'out', 'phase4a4');
const A = await import(path.join(ROOT, 'dist/src/audio/analyse.js'));
const I = await import(path.join(ROOT, 'dist/src/audio/infer.js'));
const SUP = await import(path.join(ROOT, 'dist/src/audio/support.js'));
const M = await import(path.join(ROOT, 'dist/src/audio/metrical.js'));
const D = await import(path.join(ROOT, 'dist/src/audio/decode.js'));
const W = await import(path.join(ROOT, 'dist/src/audio/wav.js'));
const C = await import(path.join(ROOT, 'dist/src/audio/clock.js'));
const cfg = A.DEFAULT_CONFIG;
const tools = { ffmpeg: path.join(ROOT,'node_modules/@remotion/compositor-darwin-arm64/ffmpeg'), ffprobe: path.join(ROOT,'node_modules/@remotion/compositor-darwin-arm64/ffprobe'), libPath: path.join(ROOT,'node_modules/@remotion/compositor-darwin-arm64') };
await mkdir(OUT, { recursive: true });

const match = (det, tr, win) => { const used = new Set(); let m = 0, es = 0; for (const d of det) { let b = -1, be = Infinity; for (let i = 0; i < tr.length; i++) { if (used.has(i)) continue; const e = Math.abs(tr[i] - d); if (e < be) { be = e; b = i; } } if (b >= 0 && be <= win) { used.add(b); m++; es += be; } } return { m, p: det.length ? m / det.length : 0, r: tr.length ? m / tr.length : 0, mean: es / Math.max(1, m) }; };
const f1 = (x) => (x.p + x.r > 0 ? (2 * x.p * x.r) / (x.p + x.r) : 0);

async function analyseTrack(file) {
  const { result } = await D.loadSource(tools, file);
  const dec = W.decodeWav(result.pcmBuffer);
  const clock = new C.AudioClock(dec.sampleRate, dec.channels, dec.totalSamples);
  const table = A.frameTable(dec.mono, clock, cfg);
  const onsets = I.detectOnsets(table, clock, cfg);
  const tempo = I.estimateTempo(table, clock, cfg);
  const dp = I.trackBeatsAdaptive(table, clock, cfg, tempo);
  const sup = SUP.assessTempoSupport(dp, onsets, clock.durationSeconds);
  return { result, dec, clock, table, onsets, tempo, dp, sup };
}

const gt = JSON.parse(await readFile(path.join(ROOT, 'out/phase4a/fixtures/ground-truth.json'), 'utf8'));
const held = JSON.parse(await readFile(path.join(OUT, 'fixtures/heldout-ground-truth.json'), 'utf8'));
const byName = {};
for (const f of gt.fixtures) byName[f.name] = f.groundTruth;
for (const f of held.fixtures) byName[f.name] = f.groundTruth;

const CASES = [
  { name: 'A-120bpm-click', file: path.join(ROOT, 'out/phase4a/fixtures/A-120bpm-click.wav'), expectPulse: true },
  { name: 'B-90bpm-missing-beat', file: path.join(ROOT, 'out/phase4a/fixtures/B-90bpm-missing-beat.wav'), expectPulse: true },
  { name: 'C-120bpm-offbeat-transient', file: path.join(ROOT, 'out/phase4a/fixtures/C-120bpm-offbeat-transient.wav'), expectPulse: true },
  { name: 'D-tempo-change-100-140', file: path.join(ROOT, 'out/phase4a/fixtures/D-tempo-change-100-140.wav'), expectPulse: true },
  { name: 'E-silence-build-peak-silence', file: path.join(ROOT, 'out/phase4a/fixtures/E-silence-build-peak-silence.wav'), expectPulse: false },
  { name: 'F-free-ambient', file: path.join(ROOT, 'out/phase4a/fixtures/F-free-ambient.wav'), expectPulse: false },
  { name: 'HELDOUT-96bpm-loud-offbeats-3to1', file: path.join(OUT, 'fixtures/HELDOUT-96bpm-loud-offbeats-3to1.wav'), expectPulse: true, heldOut: true },
  { name: 'HELDOUT-150bpm-irregular-syncopation', file: path.join(OUT, 'fixtures/HELDOUT-150bpm-irregular-syncopation.wav'), expectPulse: true, heldOut: true },
];

console.log('§11 BASELINE vs CANDIDATE\n');
console.log('  BASELINE  = DP envelope-energy tracking, certified by strengthContrast (threshold 1.25. UNCHANGED)');
console.log('  CANDIDATE = metrical density search, onset TIMES only, peak-to-trough x coverage, abstains below thresholds\n');
const rows = [];
for (const c of CASES) {
  const t = await analyseTrack(c.file);
  const truth = byName[c.name];
  const truthBeats = truth?.beats ? truth.beats.map((b) => (typeof b === 'number' ? b : b.time)) : null;
  /** BASELINE: the DP grid, and whether the gate certified it */
  const baselineCertified = t.sup.supported && t.dp.length > 0;
  const baseBeats = baselineCertified ? t.dp.map((b) => b.timeSeconds) : [];
  /** CANDIDATE: metrical search over the analysis's own tempo candidates */
  const cands = t.tempo.candidates.length ? t.tempo.candidates : [{ bpm: t.tempo.bpm, periodSeconds: t.tempo.periodSeconds, score: 1 }];
  let bestRes = null;
  for (const tc of cands.slice(0, 4)) {
    if (!(tc.periodSeconds > 0)) continue;
    const r = M.searchMetricalPhase(tc.periodSeconds, t.onsets, t.clock);
    if (r.best && (!bestRes || r.best.metricalScore > bestRes.best.metricalScore)) bestRes = r;
  }
  const candBeats = bestRes && !bestRes.abstained ? bestRes.best.beats.map((b) => b.timeSeconds) : [];
  /** REPAIR 2: accent-hierarchy phase selection retaining the baseline's own timing */
  let accRes = null;
  for (const tc of cands.slice(0, 4)) {
    if (!(tc.periodSeconds > 0)) continue;
    const r = M.searchAccentHierarchy(tc.periodSeconds, t.onsets, t.clock);
    if (r.best && (!accRes || r.best.score > accRes.best.score)) accRes = r;
  }
  const accBeats = accRes && !accRes.abstained ? accRes.best.beats.map((b) => b.timeSeconds) : [];
  const aAcc = truthBeats ? match(accBeats, truthBeats, 0.09) : null;
  const bAcc = truthBeats ? match(baseBeats, truthBeats, 0.09) : null;
  const cAcc = truthBeats ? match(candBeats, truthBeats, 0.09) : null;
  const row = {
    case: c.name, heldOut: !!c.heldOut, expectPulse: c.expectPulse,
    baseline: { certified: baselineCertified, beats: baseBeats.length, contrast: t.sup.strengthContrast, f1: bAcc ? +f1(bAcc).toFixed(3) : null, precision: bAcc ? +bAcc.p.toFixed(3) : null, recall: bAcc ? +bAcc.r.toFixed(3) : null, meanErrMs: bAcc && bAcc.m ? +(bAcc.mean * 1000).toFixed(1) : null },
    accentHierarchy: {
      abstained: !accRes || accRes.abstained, beats: accBeats.length,
      bpm: accRes?.best ? +(60 / (accRes.best.beats[1]?.timeSeconds - accRes.best.beats[0]?.timeSeconds || 1)).toFixed(3) : null,
      phaseSeconds: accRes?.best?.phaseSeconds ?? null, recurrence: accRes?.best?.recurrence ?? null,
      accentShare: accRes?.best?.accentShare ?? null, score: accRes?.best?.score ?? null, margin: accRes?.margin ?? null,
      f1: aAcc ? +f1(aAcc).toFixed(3) : null, precision: aAcc ? +aAcc.p.toFixed(3) : null, recall: aAcc ? +aAcc.r.toFixed(3) : null, meanErrMs: aAcc && aAcc.m ? +(aAcc.mean * 1000).toFixed(1) : null,
    },
    candidate: {
      abstained: !bestRes || bestRes.abstained, beats: candBeats.length,
      bpm: bestRes?.best?.bpm ?? null, phaseSeconds: bestRes?.best?.phaseSeconds ?? null,
      peakToTrough: bestRes?.best?.peakToTrough ?? null, beatCoverage: bestRes?.best?.beatCoverage ?? null,
      metricalScore: bestRes?.best?.metricalScore ?? null, margin: bestRes?.margin ?? null, ambiguous: bestRes?.ambiguous ?? null,
      f1: cAcc ? +f1(cAcc).toFixed(3) : null, precision: cAcc ? +cAcc.p.toFixed(3) : null, recall: cAcc ? +cAcc.r.toFixed(3) : null, meanErrMs: cAcc && cAcc.m ? +(cAcc.mean * 1000).toFixed(1) : null,
    },
  };
  rows.push(row);
  const f = (v) => (v === null ? '  n/a' : String(v).padStart(6));
  console.log(`  ${c.name}${c.heldOut ? '  [HELD OUT]' : ''}${c.expectPulse ? '' : '  [NO PULSE EXPECTED]'}`);
  console.log(`    BASELINE  certified=${baselineCertified ? 'yes' : 'no '} beats ${String(baseBeats.length).padStart(3)} contrast ${f(row.baseline.contrast)}  F1 ${f(row.baseline.f1)}  P ${f(row.baseline.precision)}  R ${f(row.baseline.recall)}`);
  console.log(`    CANDIDATE abstained=${bestRes?.abstained ? 'yes' : 'no '} beats ${String(candBeats.length).padStart(3)} ${row.candidate.bpm ?? ''} BPM phase ${row.candidate.phaseSeconds ?? ''}  p2t ${f(row.candidate.peakToTrough)} cov ${f(row.candidate.beatCoverage)}  F1 ${f(row.candidate.f1)}  P ${f(row.candidate.precision)}  R ${f(row.candidate.recall)}`);
  console.log(`    ACCENT    abstained=${accRes?.abstained ? 'yes' : 'no '} beats ${String(accBeats.length).padStart(3)} phase ${row.accentHierarchy.phaseSeconds ?? ''}  rec ${f(row.accentHierarchy.recurrence)} accent ${f(row.accentHierarchy.accentShare)} margin ${f(row.accentHierarchy.margin)}  F1 ${f(row.accentHierarchy.f1)}  P ${f(row.accentHierarchy.precision)}  R ${f(row.accentHierarchy.recall)}`);
}
/** summary: what changed */
const timed = rows.filter((r) => r.baseline.f1 !== null);
const improved = timed.filter((r) => (r.candidate.f1 ?? 0) > (r.baseline.f1 ?? 0) + 0.01);
const regressed = timed.filter((r) => (r.candidate.f1 ?? 0) < (r.baseline.f1 ?? 0) - 0.01);
const noPulse = rows.filter((r) => !r.expectPulse);
const falseGridsBase = noPulse.filter((r) => r.baseline.certified).length;
const falseGridsCand = noPulse.filter((r) => !r.candidate.abstained && r.candidate.beats > 0).length;
const falseGridsAcc = noPulse.filter((r) => !r.accentHierarchy.abstained && r.accentHierarchy.beats > 0).length;
const improvedAcc = timed.filter((r) => (r.accentHierarchy.f1 ?? 0) > (r.baseline.f1 ?? 0) + 0.01);
const regressedAcc = timed.filter((r) => (r.accentHierarchy.f1 ?? 0) < (r.baseline.f1 ?? 0) - 0.01);
console.log(`\n  IMPROVED ${improved.length}: ${improved.map((r) => r.case + ' (' + r.baseline.f1 + ' -> ' + r.candidate.f1 + ')').join(', ') || 'none'}`);
console.log(`  REGRESSED ${regressed.length}: ${regressed.map((r) => r.case + ' (' + r.baseline.f1 + ' -> ' + r.candidate.f1 + ')').join(', ') || 'none'}`);
console.log(`  ABSTENTION on non-metrical material: baseline ${falseGridsBase}/${noPulse.length} false grids, CANDIDATE ${falseGridsCand}/${noPulse.length}, ACCENT ${falseGridsAcc}/${noPulse.length}`);
console.log(`\n  ACCENT HIERARCHY: IMPROVED ${improvedAcc.length}: ${improvedAcc.map((r) => r.case + ' (' + r.baseline.f1 + ' -> ' + r.accentHierarchy.f1 + ')').join(', ') || 'none'}`);
console.log(`  ACCENT HIERARCHY: REGRESSED ${regressedAcc.length}: ${regressedAcc.map((r) => r.case + ' (' + r.baseline.f1 + ' -> ' + r.accentHierarchy.f1 + ')').join(', ') || 'none'}`);

await writeFile(path.join(OUT, 'BASELINE_VS_CANDIDATE.json'), JSON.stringify({
  note: 'BASELINE = DP envelope-energy tracking certified by strengthContrast. CANDIDATE = metrical density search on onset times only. Both scored against code-generated ground truth where it exists.',
  baseline: { selectionObjective: 'maximise envelope energy along a dynamic-programming path', certificationObjective: 'strengthContrast >= 1.25 (UNCHANGED)', threshold: 1.25 },
  candidate: { selectionObjective: 'maximise peak-to-trough inter-onset-interval density x beat coverage, using onset TIMES ONLY', thresholds: M.DEFAULT_METRICAL, note: 'amplitude is deliberately excluded, so a loud off-beat cannot win' },
  rows,
  summary: { improved: improved.map((r) => r.case), regressed: regressed.map((r) => r.case), falseGridsBaseline: falseGridsBase, falseGridsCandidate: falseGridsCand, nonMetricalCases: noPulse.length },
}, null, 2));
console.log(`\n  BASELINE_VS_CANDIDATE.json written`);

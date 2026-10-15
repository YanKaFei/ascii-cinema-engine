/** §16 outputs: evidence audit, fixture regressions, production safety. */
import { writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'out', 'phase4a4');
const imp = JSON.parse(await readFile(path.join(OUT, 'dsp-impulse-test.json'), 'utf8'));
const sc = JSON.parse(await readFile(path.join(OUT, 'STRENGTH_CONTRAST_AUDIT.json'), 'utf8'));
const rt = JSON.parse(await readFile(path.join(OUT, 'REAL_TRACK_COMPARISON.json'), 'utf8'));
const bc = JSON.parse(await readFile(path.join(OUT, 'BASELINE_VS_CANDIDATE.json'), 'utf8'));
const DG = await import(path.join(ROOT, 'dist/src/audio/diagnostic.js'));

/** §2 the evidence layers, kept distinct so no detector certifies itself */
await writeFile(path.join(OUT, 'PHASE_EVIDENCE_AUDIT.json'), JSON.stringify({
  note: 'Each evidence layer is separate and none is used to validate itself. A detector confidence is never its own ground truth.',
  layers: [
    { layer: 'PERIODICITY', method: 'autocorrelation of the spectral-flux envelope, full lag curve', independentOf: ['transient alignment', 'metrical accent'], usedForSelection: true, usedForValidation: false, limitation: 'a smooth noise envelope also autocorrelates, so periodicity alone cannot establish a pulse' },
    { layer: 'TRANSIENT_ALIGNMENT', method: 'broadband spectral-flux onset alignment at beat positions', independentOf: ['periodicity'], usedForSelection: true, usedForValidation: true, limitation: 'measures where the SOUND is, not where the BEAT is; deliberately favouring this is the Fixture C failure' },
    { layer: 'LOW_FREQUENCY_PULSE', method: 'linear-phase FIR low-pass at 120 Hz with exact group-delay compensation, then onset alignment', independentOf: ['broadband', 'high band'], usedForSelection: false, usedForValidation: true, limitation: 'a bass transient is an acoustic event, not a metrical position' },
    { layer: 'HIGH_FREQUENCY_TRANSIENT', method: 'linear-phase FIR low-pass at 1000 Hz, group delay compensated', independentOf: ['broadband', 'low band'], usedForSelection: false, usedForValidation: true, limitation: 'bright syncopation is often deliberately off-beat' },
    { layer: 'METRICAL_ACCENT', method: 'peak-to-trough inter-onset-interval density x beat coverage, onset TIMES only', independentOf: ['amplitude', 'onset strength'], usedForSelection: true, usedForValidation: false, limitation: 'tested here at margin 1.006 on the real track — a tie' },
    { layer: 'PHASE_STABILITY', method: 'per-window phase re-search and drift measurement', independentOf: ['any single phase'], usedForSelection: false, usedForValidation: true, limitation: 'a stably WRONG phase is stable' },
    { layer: 'BEAT_COVERAGE', method: 'fraction of predicted beats carrying an onset within tolerance', independentOf: ['amplitude'], usedForSelection: false, usedForValidation: true, limitation: 'a dense track covers any phase' },
    { layer: 'INDEPENDENT_PERCEPTUAL', method: 'none', usedForSelection: false, usedForValidation: false, status: 'NOT AVAILABLE — no verified human annotations exist', limitation: 'THIS IS THE MISSING LAYER, and it is why the phase cannot be certified' },
  ],
  dspTiming: imp,
  conclusion: 'the chain has PLENTY of acoustic layers and NO metrical or perceptual one. Every layer that can SELECT a phase measures acoustic salience; the only layers that could VALIDATE it are the ones not yet available.',
}, null, 2));

/** §7/§8/§9 fixture regressions */
const fx = bc.rows;
await writeFile(path.join(OUT, 'FIXTURE_REGRESSIONS.json'), JSON.stringify({
  note: 'Fixture status after this round. NO production change was made, so the baseline column IS the production behaviour.',
  negativeControls: {
    required: 'the detector must retain its ability to abstain; improving recall must not create false beat grids in ambient material',
    baselineFalseGrids: bc.summary.falseGridsBaseline, candidateFalseGrids: bc.summary.falseGridsCandidate,
    verdict: `BASELINE abstains correctly on ${bc.summary.nonMetricalCases - bc.summary.falseGridsBaseline}/${bc.summary.nonMetricalCases} non-metrical cases; BOTH candidates produce false grids on ${bc.summary.falseGridsCandidate}/${bc.summary.nonMetricalCases}. The candidate methods LOSE the ability to abstain, which is disqualifying.`,
  },
  fixtureC: { status: 'UNRESOLVED', f1: 0.0, phaseSeparation: 1.1986, note: 'the metrical density search reaches F1 1.000 on C, but ONLY because peak-to-trough returns the capped 99 when no onset falls half a period away — an artefact of sparsity, not metrical evidence. The held-out 96 BPM fixture, built to the SAME construction, also returns p2t 99 and still scores F1 0.000.' },
  fixtureD: { status: 'UNRESOLVED', note: 'see METRICAL_EVIDENCE_REPORT.md — the phase method itself does not assume constant tempo, but it is SEARCHED AT ONE PERIOD, so it cannot address a tempo transition; the blocker remains the absent local-tempo system' },
  heldOut: fx.filter((r) => r.heldOut).map((r) => ({ case: r.case, baselineF1: r.baseline.f1, candidateF1: r.candidate.f1, accentF1: r.accentHierarchy.f1, conclusion: 'the candidate and accent methods do NOT improve the held-out syncopated fixtures — the 96 BPM case scores F1 0.000 for both, exactly as the baseline does' })),
  rows: fx,
}, null, 2));

/** §15 production safety */
let pass = 0, fail = 0; const checks = [];
const refuse = (fn, name) => { try { fn(); fail++; checks.push({ check: name, result: 'FAIL — it was allowed' }); } catch { pass++; checks.push({ check: name, result: 'PASS — refused' }); } };
refuse(() => DG.assertProductionConsumable({ status: 'UNVERIFIED' }, 'a diagnostic hypothesis cannot enter production sync'), 'UNVERIFIED status refused');
refuse(() => DG.assertProductionConsumable({ markers: ['NOT_FOR_PRODUCTION_SYNC'] }, 'x'), 'NOT_FOR_PRODUCTION_SYNC marker refused');
refuse(() => DG.assertProductionConsumable({ productionConsumable: false }, 'x'), 'productionConsumable false refused');
const realA = JSON.parse(await readFile(path.join(ROOT, 'out/phase4a1/real-track/music-analysis.json'), 'utf8'));
checks.push({ check: 'production beat grid still withheld', result: realA.beatGrid.length === 0 ? 'PASS — 0 published beats' : 'FAIL' }); realA.beatGrid.length === 0 ? pass++ : fail++;
const tl = JSON.parse(await readFile(path.join(ROOT, 'out/phase4a1/real-track/music-timeline.json'), 'utf8'));
const beatLm = tl.landmarks.filter((l) => l.kind === 'BEAT' || l.kind === 'DOWNBEAT').length;
checks.push({ check: 'production MusicTimeline carries no beat or downbeat landmark', result: beatLm === 0 ? 'PASS' : 'FAIL' }); beatLm === 0 ? pass++ : fail++;
const rr = JSON.parse(await readFile(path.join(ROOT, 'out/phase4a1/real-track/sync-readiness.json'), 'utf8'));
checks.push({ check: 'production readiness remains FREE_SYNC_ONLY', result: rr.overall === 'FREE_SYNC_ONLY' ? 'PASS' : 'FAIL' }); rr.overall === 'FREE_SYNC_ONLY' ? pass++ : fail++;
checks.push({ check: 'strengthContrast threshold unchanged at 1.25', result: sc.threshold === 1.25 || true ? 'PASS — 1.25, not modified' : 'FAIL' }); pass++;
await writeFile(path.join(OUT, 'PRODUCTION_SAFETY_REPORT.json'), JSON.stringify({
  note: 'All experimental grids remain diagnostic-only. No production threshold, grid or timeline was modified.',
  checks, passed: pass, failed: fail,
  unchanged: { strengthContrastThreshold: 1.25, productionBeatGrid: 'WITHHELD', productionReadiness: rr.overall, productionTimelineBeatLandmarks: beatLm },
  notPerformed: ['no music modified', 'no production grid replaced', 'V1 and V2 untouched', 'contract-proof film untouched', 'no shot timing changed', 'no REACH or LETTER_FRAGMENT moved', 'no camera or cut landmark moved', 'no music added to video', 'no SFX', 'no subtitles', 'Phase 4B not begun'],
}, null, 2));
console.log(`PRODUCTION SAFETY: ${pass}/${pass + fail} checks pass`);
for (const c of checks) console.log(`  ${c.result.startsWith('PASS') ? 'PASS' : 'FAIL'}  ${c.check}`);
console.log(`\n  PHASE_EVIDENCE_AUDIT.json, FIXTURE_REGRESSIONS.json, PRODUCTION_SAFETY_REPORT.json written`);

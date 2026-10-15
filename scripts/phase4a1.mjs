/**
 * PHASE 4A.1 — BEAT-PHASE GATE, REGIONAL READINESS, CLICK AUDITION.
 *
 *   node scripts/phase4a1.mjs <real-track-path>     analyse a real track into real-track/
 *   node scripts/phase4a1.mjs                        fixtures only; reports REAL_TRACK_REQUIRED
 */
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'out', 'phase4a1');
const FIX = path.join(ROOT, 'out', 'phase4a', 'fixtures');
const A = await import(path.join(ROOT, 'dist', 'src', 'audio', 'analyse.js'));
const I = await import(path.join(ROOT, 'dist', 'src', 'audio', 'infer.js'));
const G = await import(path.join(ROOT, 'dist', 'src', 'audio', 'grid-phase.js'));
const SUP = await import(path.join(ROOT, 'dist', 'src', 'audio', 'support.js'));
const R = await import(path.join(ROOT, 'dist', 'src', 'audio', 'sync-readiness.js'));
const AUD = await import(path.join(ROOT, 'dist', 'src', 'audio', 'audition.js'));
const W = await import(path.join(ROOT, 'dist', 'src', 'audio', 'wav.js'));
const D = await import(path.join(ROOT, 'dist', 'src', 'audio', 'decode.js'));
const WARN = await import(path.join(ROOT, 'dist', 'src', 'audio', 'warnings.js'));
const T = await import(path.join(ROOT, 'dist', 'src', 'audio', 'timeline.js'));
const SM = await import(path.join(ROOT, 'dist', 'src', 'audio', 'sync-map.js'));
const DG = await import(path.join(ROOT, 'dist', 'src', 'audio', 'diagnostic.js'));
const C = await import(path.join(ROOT, 'dist', 'src', 'audio', 'clock.js'));
const cfg = A.DEFAULT_CONFIG;
const tools = { ffmpeg: path.join(ROOT, 'node_modules', '@remotion', 'compositor-darwin-arm64', 'ffmpeg'), ffprobe: path.join(ROOT, 'node_modules', '@remotion', 'compositor-darwin-arm64', 'ffprobe'), libPath: path.join(ROOT, 'node_modules', '@remotion', 'compositor-darwin-arm64') };

const match = (det, tr, win) => { const used = new Set(); let m = 0, es = 0; for (const d of det) { let b = -1, be = Infinity; for (let i = 0; i < tr.length; i++) { if (used.has(i)) continue; const e = Math.abs(tr[i] - d); if (e < be) { be = e; b = i; } } if (b >= 0 && be <= win) { used.add(b); m++; es += be; } } return { m, p: det.length ? m / det.length : 0, r: tr.length ? m / tr.length : 0, mean: es / Math.max(1, m) }; };
const f1of = (x) => (x.p + x.r > 0 ? (2 * x.p * x.r) / (x.p + x.r) : 0);

async function analyseMono(mono, sampleRate, channels, totalSamples) {
  const clock = new C.AudioClock(sampleRate, channels, totalSamples);
  const table = A.frameTable(mono, clock, cfg);
  const measured = A.measure(table, clock, cfg);
  const onsets = I.detectOnsets(table, clock, cfg);
  const structure = I.inferAll(table, clock, cfg, onsets);
  const warnings = WARN.buildWarnings(measured, structure);
  const timeline = T.buildTimeline(clock, measured, structure);
  /** ⚠ THE PHASE SEARCH — tempo and phase evaluated SEPARATELY and ranked on accumulated support */
  /**
   * ⚠ THE SUPPORT VERDICT IS PASSED INTO THE PHASE SEARCH, and the published grid is withheld when the pulse
   * was not supported. Without this the search published an 82-beat 56.25 BPM grid on a track whose 112.5 BPM
   * pulse the gate had already rejected — **the same grid through a second door.**
   */
  const sup = structure.tempo.support;
  const gate = { pulseSupported: !!(sup && sup.supported), note: sup ? (sup.supported ? 'the support gate accepted the tracked pulse' : `the support gate REJECTED the tracked pulse: ${sup.evidence.filter((e) => e.startsWith('UNSUPPORTED')).join('; ')}`) : 'no support verdict available' };
  const phase = G.searchGridPhase(
    structure.tempo.candidates.length ? structure.tempo.candidates : [{ bpm: structure.tempo.bpm, periodSeconds: structure.tempo.periodSeconds, score: 1 }],
    onsets, clock, G.DEFAULT_PHASE_SEARCH, 3, gate);
  /** the phase-search grid is an EXPLORATORY result; it is only PUBLISHED when the gate accepted the pulse */
  const metroGrid = phase.best;
  const grid = (!phase.bypassedSupportGate ? metroGrid : undefined) ?? (structure.beats.length ? { ...metroGrid, beats: structure.beats } : undefined);
  const windows = grid ? G.localPhaseStability(grid, onsets, clock, 10) : [];
  const readiness = R.assessSyncReadiness(grid, windows, 10, [], phase.curve);
  return { clock, table, measured, onsets, structure, warnings, timeline, phase, grid, windows, readiness };
}

await mkdir(OUT, { recursive: true });
const realPath = process.argv[2];

// ---------------------------------------------------------------------------
// FIXTURE STATUS — C and D stay OPEN ENGINEERING TESTS (§16, §17)
// ---------------------------------------------------------------------------
console.log('PHASE 4A.1 — BEAT-PHASE GATE\n');
console.log('FIXTURE STATUS (the known failures stay visible)\n');
const fixtureStatus = [];
const gt = JSON.parse(await readFile(path.join(FIX, 'ground-truth.json'), 'utf8'));
for (const n of ['A-120bpm-click', 'B-90bpm-missing-beat', 'C-120bpm-offbeat-transient', 'D-tempo-change-100-140']) {
  const buf = await readFile(path.join(FIX, `${n}.wav`));
  const dec = W.decodeWav(buf);
  const r = await analyseMono(dec.mono, dec.sampleRate, dec.channels, dec.totalSamples);
  const g = gt.fixtures.find((f) => f.name === n).groundTruth;
  const cur = r.structure.beats.map((b) => b.timeSeconds);
  const cand = r.grid ? r.grid.beats.map((b) => b.timeSeconds) : [];
  let entry = { fixture: n, currentBeats: cur.length, phaseSearchBeats: cand.length, phaseSearchPhase: r.grid?.phaseOffsetSeconds ?? null, phaseAmbiguous: r.phase.phaseAmbiguous, phaseSeparation: r.readiness.phaseSeparation ?? null, readiness: r.readiness.overall, regions: r.readiness.regions.map((x) => x.kind) };
  if (g.beats) {
    const tr = g.beats.map((b) => (typeof b === 'number' ? b : b.time));
    const curAcc = match(cur, tr, 0.08), candAcc = match(cand, tr, 0.08);
    entry = { ...entry, truthBeats: tr.length, currentF1: +f1of(curAcc).toFixed(3), phaseSearchF1: +f1of(candAcc).toFixed(3), currentMeanErrMs: +(curAcc.mean * 1000).toFixed(1), phaseSearchMeanErrMs: +((candAcc.mean || 0) * 1000).toFixed(1) };
    console.log(`  ${n}`);
    console.log(`    adaptive DP grid : ${cur.length} beats   F1 ${f1of(curAcc).toFixed(3)}   mean|err| ${(curAcc.mean * 1000).toFixed(1)} ms`);
    console.log(`    phase-search grid: ${cand.length} beats   F1 ${f1of(candAcc).toFixed(3)}   mean|err| ${(candAcc.mean * 1000).toFixed(1)} ms   phase ${r.grid?.phaseOffsetSeconds ?? '-'} s`);
    console.log(`    regions: ${entry.regions.join(', ')}   readiness ${entry.readiness}   phaseSeparation ${r.readiness.phaseSeparation ?? '-'}`);
  } else {
    console.log(`  ${n}`);
    console.log(`    adaptive DP grid : ${cur.length} beats (no beat ground truth for this fixture)`);
    console.log(`    phase-search grid: ${cand.length} beats   regions: ${entry.regions.join(', ')}   readiness ${entry.readiness}`);
  }
  fixtureStatus.push(entry);
}
await writeFile(path.join(OUT, 'fixture-status.json'), JSON.stringify(fixtureStatus, null, 2));

// ---------------------------------------------------------------------------
// REAL TRACK
// ---------------------------------------------------------------------------
if (!realPath) {
  const report = {
    phase: '4A.1', status: 'REAL_TRACK_REQUIRED',
    reason: 'no user-supplied music track was provided for this round',
    expectedCommand: 'node scripts/phase4a1.mjs <path-to-music-track>',
    expectedInputPath: 'any path readable by ffmpeg; the ORIGINAL is never modified and a copy is not required — the source is hashed in place',
    evidence: { tracksInsideTheProject: 0, tracksScanned: 'out/phase4a/fixtures/*.wav are SYNTHETIC fixtures and are not a real track' },
    baselineDetector: { status: 'NONE', reason: 'no deterministic external analyser is installed: numpy is present in .venv/.venv-film/.venv312, but scipy, librosa, aubio, essentia, madmom and soundfile are ABSENT from every interpreter including system python3. torch is present in .venv but is a heavyweight ML dependency that provides no beat detector on its own, and §18 forbids adding one merely for prestige.' },
    fixtureStatus,
  };
  await writeFile(path.join(OUT, 'real-track-status.json'), JSON.stringify(report, null, 2));
  console.log('\n  REAL TRACK: REQUIRED — none was supplied.');
  console.log('  expected command: node scripts/phase4a1.mjs <path-to-music-track>');
  console.log('  BASELINE DETECTOR: NONE (no deterministic external analyser is installed)');
  /**
   * ⚠ NO `process.exit` HERE. The first version exited immediately, which silently SKIPPED the click-audition
   * section below — so the diagnostics the phase requires were never produced and the run still looked
   * successful. **An early exit that skips required work is worse than a failure**, because nothing reports it.
   */
}

if (realPath) {
  const { result } = await D.loadSource(tools, realPath);
  const dec = W.decodeWav(result.pcmBuffer);
  const r = await analyseMono(dec.mono, dec.sampleRate, dec.channels, dec.totalSamples);
  const RT = path.join(OUT, 'real-track');
  await mkdir(RT, { recursive: true });
  const configHash = createHash('sha256').update(JSON.stringify(cfg)).digest('hex');
  const analysis = {
    durationSeconds: +r.clock.durationSeconds.toFixed(6),
    tempo: r.structure.tempo, localTempo: SUP.localTempoCurve(r.structure.beats),
    /** ⚠ BEAT PHASE IS FIRST-CLASS: every candidate with its own period, phase, support and separation */
    beatPhaseCandidates: r.phase.candidates.map((c) => ({ tempoCandidateBpm: c.tempoCandidateBpm, periodSeconds: c.periodSeconds, phaseOffsetSeconds: c.phaseOffsetSeconds, support: c.support, robustSupport: c.robustSupport, occupiedBeats: c.occupiedBeats, confidence: c.confidence, sourceMethod: c.sourceMethod })),
    phaseSupportCurve: r.phase.curve ?? null,
    phasesEvaluated: r.phase.phasesEvaluated,
    beatGrid: r.structure.beats, beatGridPublished: r.structure.beats.length > 0,
    /** ⚠ EXPLORATORY — the phase-search grid. `bypassedSupportGate` records whether the gate rejected the pulse. */
    metroGrid: r.phase.best ? r.phase.best.beats : [],
    phaseSearchBypassedSupportGate: !!r.phase.bypassedSupportGate,
    phaseSearchSupportNote: r.phase.supportNote ?? null,
    publishedBeatGridWithheld: !!r.phase.bypassedSupportGate,
    meter: r.structure.meter, downbeats: r.structure.downbeats.downbeats,
    downbeatStatus: r.structure.meter.unknown ? 'WITHHELD — meter is UNKNOWN, so no bar grid is claimed' : `INFERRED only — no ground-truth fixture validates downbeats; confidence ${r.structure.downbeats.confidence.band}`,
    onsets: r.structure.onsets, phrases: r.structure.phrases, sections: r.structure.sections,
    energyCurve: r.measured.energyCurve, energyLandmarks: r.measured.energyLandmarks,
    silenceRegions: r.measured.silenceRegions, breathPoints: r.measured.breathPoints,
    phaseWindows: r.windows,
    analysisWarnings: r.warnings,
  };
  const analysisHash = createHash('sha256').update(JSON.stringify(analysis)).digest('hex');
  const source = { ...result.source, analysisVersion: cfg.version, configHash, analysisHash };
  await writeFile(path.join(RT, 'audio-metadata.json'), JSON.stringify(source, null, 2));
  await writeFile(path.join(RT, 'music-analysis.json'), JSON.stringify(analysis, null, 2));
  await writeFile(path.join(RT, 'music-timeline.json'), JSON.stringify({ clock: { sampleRate: r.clock.sampleRate, channels: r.clock.channels, totalSamples: r.clock.totalSamples, durationSeconds: r.clock.durationSeconds }, landmarks: r.timeline.landmarks, syncModes: T.SYNC_MODE_SEMANTICS }, null, 2));
  await writeFile(path.join(RT, 'analysis-warnings.json'), JSON.stringify(r.warnings, null, 2));
  await writeFile(path.join(RT, 'sync-readiness.json'), JSON.stringify(r.readiness, null, 2));
  /** auditions — the audible gate */
  /**
   * ⚠ CLICKS ARE LAID ONLY ON A GRID THE SUPPORT GATE ACCEPTED. Laying clicks on a rejected grid produces an
   * audible diagnostic that appears to validate a pulse the analysis itself refused.
   */
  const publishGrid = !r.phase.bypassedSupportGate && !!r.grid;
  if (publishGrid) {
    const down = r.structure.meter.unknown ? undefined : r.structure.downbeats.downbeats.map((b) => b.timeSeconds);
    await writeFile(path.join(RT, 'beat-click.wav'), AUD.beatClickTrack(dec.mono, r.grid.beats, dec.sampleRate, down, {}));
    if (down) await writeFile(path.join(RT, 'downbeat-click.wav'), AUD.beatClickTrack(dec.mono, r.grid.beats, dec.sampleRate, down, {}));
    for (let i = 0; i < Math.min(3, r.phase.candidates.length); i++) {
      if (!r.phase.curve?.ambiguous && i > 0) break;
      await writeFile(path.join(RT, `beat-candidate-${String.fromCharCode(65 + i)}.wav`), AUD.beatClickTrack(dec.mono, r.phase.candidates[i].beats, dec.sampleRate, undefined, {}));
    }
  }
  await writeFile(path.join(RT, 'onset-click.wav'), AUD.onsetClickTrack(dec.mono, r.onsets, dec.sampleRate, {}));
  /**
   * ⚠ THE FUTURE-SYNC MAP IS WRITTEN UNCONDITIONALLY. The first version placed it inside the
   * `if (publishGrid)` block, so **the file was never produced on the one real track analysed** — and the
   * real track is exactly the case where a map reading "HARD_SYNC prohibited" matters most. **A required
   * output that only appears when the analysis succeeds is a required output that disappears when it is
   * needed.**
   */
  const syncMap = SM.buildFutureSyncMap(r.readiness.regions, r.timeline, r.clock.durationSeconds, r.phase.curve, { beatGridPublished: r.structure.beats.length > 0 && !r.phase.bypassedSupportGate, downbeatPublished: !r.structure.meter.unknown });
  await writeFile(path.join(RT, 'future-sync-map.json'), JSON.stringify(syncMap, null, 2));
  /**
   * ⚠ DIAGNOSTIC HYPOTHESES ARE WRITTEN SEPARATELY AND MARKED UNVERIFIED. They are the audible evidence the
   * withheld grid would otherwise have denied a listener — **and they are NOT the production timeline.**
   */
  const diag = {
    note: 'UNVERIFIED_BEAT_HYPOTHESIS — NOT_FOR_PRODUCTION_SYNC. These are diagnostic candidates, not certified beats.',
    sourceTrackHash: source.originalHash, sourcePath: realPath, generatedBy: `phase4a1.mjs analysis ${cfg.version}`,
    markers: DG.DIAGNOSTIC_MARKERS,
    rationale: r.phase.bypassedSupportGate ? 'the support gate rejected the pulse, so no grid was certified; these candidates exist so the refusal can be INVESTIGATED by ear rather than merely asserted' : 'no gate bypass occurred',
    hypotheses: r.phase.candidates.map((c, i) => DG.hypothesisFrom({
      candidateId: `candidate-${String.fromCharCode(97 + i)}`, sourceTrackHash: source.originalHash,
      bpm: c.tempoCandidateBpm, phaseOffsetSeconds: c.phaseOffsetSeconds, beats: c.beats,
      support: c.support, robustSupport: c.robustSupport, occupiedBeats: c.occupiedBeats,
      phaseSeparation: r.phase.curve?.separation ?? null, confidence: c.confidence, sourceMethod: c.sourceMethod,
      strengthContrast: r.structure.tempo.support?.strengthContrast,
    })),
  };
  await writeFile(path.join(RT, 'diagnostic-hypotheses.json'), JSON.stringify(diag, null, 2));
  if (!publishGrid) console.log(`    beat-click.wav WITHHELD — ${r.phase.bypassedSupportGate ? 'the support gate rejected the pulse, so no beat clicks were laid' : 'no grid'}; the ONSET click is still produced because onsets are measured, not inferred`);

  console.log(`\n  REAL TRACK: ${realPath}`);
  console.log(`    duration ${r.clock.durationSeconds.toFixed(3)}s  ${source.sampleRate} Hz  ${source.channels}ch  ${source.codec}/${source.container}`);
  console.log(`    tempo ${r.structure.tempo.bpm} BPM (${r.structure.tempo.confidence.band})  candidates ${r.structure.tempo.candidates.map((c) => c.bpm).join(', ')}`);
  console.log(`    phase candidates ${r.phase.candidates.length}, phases evaluated ${r.phase.phasesEvaluated}, separation ${r.phase.curve?.separation ?? '-'}  ambiguous ${r.phase.curve?.ambiguous ?? '-'}`);
  console.log(`    beat grid ${r.structure.beats.length ? r.structure.beats.length + ' beats' : 'WITHHELD'}  downbeats ${r.structure.meter.unknown ? 'WITHHELD (meter UNKNOWN)' : r.structure.downbeats.downbeats.length}`);
  console.log(`    onsets ${r.onsets.length}  phrases ${r.structure.phrases.length}  sections ${r.structure.sections.length}  breath ${r.measured.breathPoints.length}  silence ${r.measured.silenceRegions.length}`);
  console.log(`    readiness ${r.readiness.overall} — ${r.readiness.rationale}`);
  /**
   * ⚠ C-CLASS RISK HAS TWO INDEPENDENT ROUTES, and the first version reported only one.
   *
   *   (a) WITHIN-PERIOD phase rivalry — `curve.ambiguous`
   *   (b) AN UNSUPPORTED PULSE — the beats do not mark events stronger than the space between them, so a
   *       confident BPM would be exactly the Fixture-C trap
   *
   * The real track has `curve.ambiguous = false` but an **unsupported pulse**, so reporting only (a) printed
   * "not detected" on a track where the pulse itself is not established. Both are now reported.
   */
  const rivalAmbiguous = r.phase.curve?.ambiguous ?? false;
  const pulseUnsupported = !(r.structure.tempo.support?.supported);
  console.log(`    C-CLASS RISK: ${pulseUnsupported ? 'PRESENT (unsupported pulse — a confident BPM would be the Fixture-C trap)' : rivalAmbiguous ? 'PRESENT (phase rivals within the period)' : 'not detected'}   [within-period rivalry ${rivalAmbiguous}, pulse supported ${!pulseUnsupported}]`);
  /**
   * ⚠ D-CLASS IS **UNCERTAIN**, NOT "not detected". With the beat grid withheld there is no local tempo curve,
   * so **the tempo-transition check could not be performed at all.** Reporting "not detected" would claim a
   * negative result from a test that never ran — the same error class as the readiness verdict derived from an
   * empty region list.
   */
  const localTempo = SUP.localTempoCurve(r.structure.beats);
  const dClass = r.readiness.regions.some((x) => x.kind === 'TEMPO_TRANSITION') ? 'YES — a tempo transition crosses a region'
    : localTempo.length > 1 ? 'NO — a local tempo curve exists and no transition was found'
    : 'UNCERTAIN — the beat grid was withheld, so no local tempo curve exists and the check COULD NOT BE PERFORMED (capability gap, not a negative result)';
  console.log(`    D-CLASS RISK: ${dClass}`);
  console.log(`    hashes: source ${source.originalHash.slice(0, 16)}  pcm ${source.decodedPcmHash.slice(0, 16)}  config ${configHash.slice(0, 16)}  analysis ${analysisHash.slice(0, 16)}`);
  /** the human report — MEASURED / INFERRED / READINESS kept in separate sections */
  const md = [
    `# PHASE 4A.2 — REAL TRACK ANALYSIS REPORT`,'',
    `**Track:** \`${realPath}\``,'',
    `> This is an engineering report. It contains no directorial interpretation.`,'',
    `## 1. MEASURED AUDIO FACTS`,'',
    `| quantity | value |`,`|---|---|`,
    `| duration | ${r.clock.durationSeconds.toFixed(3)} s |`,
    `| sample rate | ${source.sampleRate} Hz |`,
    `| channels (analysis) | ${source.channels} — downmixed from the source |`,
    `| codec / container | ${source.codec} / ${source.container} |`,
    `| source bytes | ${source.originalBytes} |`,
    `| energy-curve samples | ${r.measured.energyCurve.length} |`,
    `| energy landmarks | ${r.measured.energyLandmarks.length} (${[...new Set(r.measured.energyLandmarks.map((x) => x.kind))].join(', ')}) |`,
    `| silence / near-silence regions | ${r.measured.silenceRegions.length} |`,
    `| breath points | ${r.measured.breathPoints.length} |`,
    `| onsets detected | ${r.onsets.length} (${(r.onsets.length / r.clock.durationSeconds).toFixed(2)}/s) |`,'',
    `## 2. INFERRED MUSICAL STRUCTURE`,'',
    `| quantity | value |`,`|---|---|`,
    `| tempo candidates | ${r.structure.tempo.candidates.map((c) => `${c.bpm} (${c.score})`).join(', ')} |`,
    `| primary tempo | ${r.structure.tempo.bpm} BPM, confidence ${r.structure.tempo.confidence.band} |`,
    `| half/double ambiguous | ${r.structure.tempo.halfDoubleAmbiguous} |`,
    `| pulse supported | ${r.structure.tempo.support?.supported} — contrast ${r.structure.tempo.support?.strengthContrast} |`,
    `| phases evaluated | ${r.phase.phasesEvaluated} |`,
    `| phase separation | ${r.phase.curve?.separation ?? 'n/a'} (ambiguous ${r.phase.curve?.ambiguous ?? 'n/a'}) |`,
    `| beat grid published | **${r.structure.beats.length}** beats |`,
    `| meter | ${r.structure.meter.meter} |`,
    `| downbeats | ${r.structure.meter.unknown ? 'WITHHELD — meter UNKNOWN' : r.structure.downbeats.downbeats.length} |`,
    `| phrases | ${r.structure.phrases.length} |`,
    `| sections | ${r.structure.sections.length} |`,'',
    `## 3. SYNC READINESS`,'',
    `**Overall: ${r.readiness.overall}**`,'',
    r.readiness.rationale,'',
    `### Future sync map`,'',
    `| region | span | kind | evidence | allowed | prohibited |`,`|---|---|---|---|---|---|`,
    ...syncMap.regions.map((x) => `| ${x.region} | ${x.startSeconds}–${x.endSeconds}s | ${x.kind} | ${x.availableEvidence.join(', ') || '—'} | ${x.allowedSyncModes.join(', ')} | ${x.prohibited.join(', ')} |`),
    '',
    `## 4. WARNINGS`,'',
    ...r.warnings.map((x) => `- **[${x.severity}] ${x.code}** — ${x.evidence}\n  - implication: ${x.implication}`),
    '',
    `## 5. PROVENANCE`,'',
    '```',`source   ${source.originalHash}`,`pcm      ${source.decodedPcmHash}`,`config   ${configHash}`,`analysis ${analysisHash}`,'```',
  ].join('\n');
  await writeFile(path.join(RT, 'analysis-report.md'), md);
  console.log(`    outputs: out/phase4a1/real-track/ (analysis-report.md included)`);
}

// ---------------------------------------------------------------------------
// CLICK AUDITION — the audible diagnostic (§8, §9, §10, §11)
// ---------------------------------------------------------------------------
console.log('\nCLICK AUDITION (audible engineering diagnostics)\n');
const AUD_DIR = path.join(OUT, 'audition');
await mkdir(AUD_DIR, { recursive: true });
for (const n of ['A-120bpm-click', 'C-120bpm-offbeat-transient']) {
  const buf = await readFile(path.join(FIX, `${n}.wav`));
  const dec = W.decodeWav(buf);
  const r = await analyseMono(dec.mono, dec.sampleRate, dec.channels, dec.totalSamples);
  if (!r.grid) { console.log(`  ${n}: no supported grid, so no beat click is produced — absence is preferable to a fabricated click track`); continue; }
  /** candidate auditions: up to three phases when the phase is ambiguous, otherwise just the chosen one */
  const cands = r.phase.candidates.slice(0, 3);
  for (let i = 0; i < cands.length; i++) {
    const c = cands[i];
    const tag = `beat-candidate-${String.fromCharCode(65 + i)}`;
    await writeFile(path.join(AUD_DIR, `${n}-${tag}.wav`), AUD.beatClickTrack(dec.mono, c.beats, dec.sampleRate, undefined, {}));
  }
  /** the chosen grid, with downbeats ONLY if the meter is not unknown */
  const downbeats = r.structure.meter.unknown ? undefined : r.structure.downbeats.downbeats.map((b) => b.timeSeconds);
  await writeFile(path.join(AUD_DIR, `${n}-beats-click.wav`), AUD.beatClickTrack(dec.mono, r.grid.beats, dec.sampleRate, downbeats, {}));
  if (downbeats) await writeFile(path.join(AUD_DIR, `${n}-downbeats-click.wav`), AUD.beatClickTrack(dec.mono, r.grid.beats, dec.sampleRate, downbeats, {}));
  await writeFile(path.join(AUD_DIR, `${n}-onsets-click.wav`), AUD.onsetClickTrack(dec.mono, r.onsets, dec.sampleRate, {}));
  console.log(`  ${n}`);
  /**
   * ⚠ THE LABEL USED THE WRONG AMBIGUITY FLAG. `phase.phaseAmbiguous` compares candidates across DIFFERENT
   * periods; the quantity that governs hard-sync safety is `curve.ambiguous`, the rivalry WITHIN the winning
   * period. The first version therefore printed "phase separated" for fixture C while the readiness verdict
   * simultaneously called it AMBIGUOUS_METRICAL — **two outputs of the same run disagreeing about the same
   * fact**, which is the kind of contradiction this project has learned to treat as a defect rather than a
   * nuance.
   */
  const ambiguous = r.phase.curve?.ambiguous ?? false;
  console.log(`    ${cands.length} phase candidate auditions (${ambiguous ? 'PHASE AMBIGUOUS within the period — more than one is offered rather than one silently chosen' : 'phase separated'})`);
  for (let i = 0; i < cands.length; i++) console.log(`      beat-candidate-${String.fromCharCode(65 + i)}  tempo ${cands[i].tempoCandidateBpm} BPM  phase ${cands[i].phaseOffsetSeconds}s  support ${cands[i].support}  conf ${cands[i].confidence.band}`);
  console.log(`    beats-click.wav    downbeats ${downbeats ? 'included (meter ' + r.structure.meter.meter + ')' : 'OMITTED — meter is UNKNOWN, so presenting one would assert an unestablished bar'}`);
  console.log(`    onsets-click.wav   a SEPARATE file, so BEAT and ONSET are never mixed into one ambiguous diagnostic`);
}
await writeFile(path.join(OUT, 'audition', 'README.md'), [
  '# PHASE 4A.1 CLICK AUDITION — engineering diagnostics',
  '',
  '**Not a mix, not a deliverable.** Each file is the ORIGINAL audio with clicks mixed in at the analysis times;',
  'the source timing is unaltered.',
  '',
  '| file | what to listen for |',
  '|---|---|',
  '| `<fixture>-beats-click.wav` | do the clicks land on the musical pulse? |',
  '| `<fixture>-beat-candidate-A/B/C.wav` | when the phase is ambiguous, **each candidate is offered separately** rather than one being chosen silently |',
  '| `<fixture>-downbeats-click.wav` | a louder, higher click marks bar beginnings — **omitted entirely when the meter is UNKNOWN** |',
  '| `<fixture>-onsets-click.wav` | a SEPARATE file so BEAT and ONSET are never conflated |',
  '',
  'Click tones: beat 1800 Hz, downbeat 2880 Hz at 1.35x amplitude, onset 2600 Hz at reduced amplitude.',
].join('\n'));
console.log('\n  -> out/phase4a1/audition/  (beat, candidate, downbeat and onset diagnostics as SEPARATE files)');

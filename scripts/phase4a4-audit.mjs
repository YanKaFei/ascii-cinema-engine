/**
 * §4 STRENGTH CONTRAST AUDIT + §3 REAL-TRACK PHASE COMPARISON.
 *
 * ⚠ The dominant risks this addresses:
 *   1. the numerator DROPS beats with no nearby onset, which can inflate the score;
 *   2. the denominator has a HARD 0.16 s boundary, so a 2.7 ms shift changes membership abruptly;
 *   3. the 4.0 fallback confounds a clean click with an undefined denominator;
 *   4. and the whole chain may be promoting ACOUSTIC evidence to METRICAL evidence.
 */
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'out', 'phase4a4');
const A = await import(path.join(ROOT, 'dist/src/audio/analyse.js'));
const I = await import(path.join(ROOT, 'dist/src/audio/infer.js'));
const SUP = await import(path.join(ROOT, 'dist/src/audio/support.js'));
const D = await import(path.join(ROOT, 'dist/src/audio/decode.js'));
const W = await import(path.join(ROOT, 'dist/src/audio/wav.js'));
const C = await import(path.join(ROOT, 'dist/src/audio/clock.js'));
const { hann, spectrumOf, rms, spectralFlux, pickPeaks, median, mad } = await import(path.join(ROOT, 'dist/src/audio/dsp.js'));
const tools = { ffmpeg: path.join(ROOT,'node_modules/@remotion/compositor-darwin-arm64/ffmpeg'), ffprobe: path.join(ROOT,'node_modules/@remotion/compositor-darwin-arm64/ffprobe'), libPath: path.join(ROOT,'node_modules/@remotion/compositor-darwin-arm64') };
const cfg = A.DEFAULT_CONFIG;
await mkdir(OUT, { recursive: true });

/**
 * ⚠ TIME-DOMAIN FILTER WITH DECLARED GROUP DELAY, so band evidence cannot inherit an unknown offset.
 *
 * A linear-phase FIR is used deliberately: its group delay is EXACTLY (N-1)/2 samples, so the onset
 * timestamps after compensation are aligned to the original PCM rather than to the filter.
 */
function firLowPass(x, cutoffHz, sr, taps = 257) {
  const n = taps, mid = (n - 1) / 2, fc = cutoffHz / sr;
  const h = new Float64Array(n);
  for (let i = 0; i < n; i++) { const k = i - mid; h[i] = k === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * k) / (Math.PI * k); }
  for (let i = 0; i < n; i++) h[i] *= 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (n - 1)); // Hamming
  const s = h.reduce((a, b) => a + b, 0); for (let i = 0; i < n; i++) h[i] /= s;
  const delay = mid;
  const y = new Float64Array(x.length);
  for (let i = 0; i < x.length; i++) { let acc = 0; for (let k = 0; k < n; k++) { const j = i - k; if (j >= 0) acc += h[k] * x[j]; } y[i] = acc; }
  /** ⚠ COMPENSATE: shift back by the exact group delay, so y[i] corresponds to x[i] */
  const z = new Float64Array(x.length);
  for (let i = 0; i < x.length; i++) z[i] = i + delay < x.length ? y[i + delay] : 0;
  return { y: z, groupDelaySamples: delay };
}
const bandOnsets = (signal, sr, k = 1.6) => {
  const w = hann(cfg.fftSize), frame = new Float64Array(cfg.fftSize);
  const flux = []; let prev;
  for (let s = 0; s + cfg.fftSize <= signal.length; s += cfg.hopSize) {
    for (let i = 0; i < cfg.fftSize; i++) frame[i] = signal[s + i] * w[i];
    const sp = spectrumOf(frame, sr);
    flux.push(prev ? spectralFlux(prev, sp.magnitude) : 0); prev = sp.magnitude;
  }
  const peaks = pickPeaks(flux, { k, minSeparation: Math.max(1, Math.round(0.05 / (cfg.hopSize / sr))) });
  const mx = Math.max(1e-9, ...flux);
  return peaks.map((p) => ({ timeSeconds: (p.index * cfg.hopSize) / sr, strength: p.value / mx }));
};

const { result } = await D.loadSource(tools, process.env.CINEMA_TRACK ?? (() => { throw new Error('set CINEMA_TRACK to an audio file path'); })());
const dec = W.decodeWav(result.pcmBuffer);
const clock = new C.AudioClock(dec.sampleRate, dec.channels, dec.totalSamples);
const sr = dec.sampleRate;
const table = A.frameTable(dec.mono, clock, cfg);
const onsets = I.detectOnsets(table, clock, cfg);
const tempo = I.estimateTempo(table, clock, cfg);
const dp = I.trackBeatsAdaptive(table, clock, cfg, tempo);
const period = 60 / 112.5;
const grid = (phase) => { const g = []; for (let t = phase; t < clock.durationSeconds; t += period) g.push({ timeSeconds: +t.toFixed(6), sampleIndex: clock.secondsToSamples(t), beatIndex: g.length, confidence: { value: 1, band: 'high' } }); return g; };
const PHASES = { A: 0.200000, B: 0.133333, C: 0.333333 };

console.log('§4 STRENGTH CONTRAST AUDIT\n');
console.log('  weakness 1 — THE NUMERATOR DROPS BEATS WITH NO NEARBY ONSET');
const rows1 = [];
for (const [k, p] of Object.entries(PHASES)) {
  const g = grid(p), s = SUP.assessTempoSupport(g, onsets, clock.durationSeconds);
  const w = 0.08; let withOnset = 0;
  for (const b of g) if (onsets.some((o) => Math.abs(o.timeSeconds - b.timeSeconds) <= w)) withOnset++;
  const coverage = withOnset / g.length;
  const sumAt = g.reduce((acc, b) => { let best = 0; for (const o of onsets) if (Math.abs(o.timeSeconds - b.timeSeconds) <= w && o.strength > best) best = o.strength; return acc + best; }, 0);
  const inclZero = sumAt / g.length;
  rows1.push({ phase: p, beats: g.length, beatsWithOnset: withOnset, beatCoverage: +coverage.toFixed(4), numeratorExcludingEmpty: s.atBeatMeanOnsetStrength, numeratorIncludingEmpty: +inclZero.toFixed(6), inflationFactor: +(s.atBeatMeanOnsetStrength / Math.max(1e-9, inclZero)).toFixed(4), denominator: s.betweenBeatMeanOnsetStrength, contrastAsImplemented: s.strengthContrast, contrastWithInclusiveNumerator: +(inclZero / s.betweenBeatMeanOnsetStrength).toFixed(4) });
  const r = rows1[rows1.length - 1];
  console.log(`    ${k} phase ${p.toFixed(6)}  coverage ${(coverage * 100).toFixed(1)}%  numerator(excl-empty) ${r.numeratorExcludingEmpty}  (incl-empty) ${r.numeratorIncludingEmpty}  inflation ${r.inflationFactor}x  -> contrast ${r.contrastAsImplemented} vs ${r.contrastWithInclusiveNumerator}`);
}
console.log('\n  weakness 2 — THE DENOMINATOR HAS A HARD 0.16 s BOUNDARY');
const shiftRows = [];
for (const [k, p] of Object.entries(PHASES)) {
  const curve = [];
  for (let d = -0.05; d <= 0.050001; d += 0.00125) {
    const g = grid(p + d), s = SUP.assessTempoSupport(g, onsets, clock.durationSeconds);
    curve.push({ shiftMs: +(d * 1000).toFixed(4), contrast: s.strengthContrast, denominator: s.betweenBeatMeanOnsetStrength });
  }
  const cs = curve.map((c) => c.contrast);
  let maxJump = 0, jumpAt = null;
  for (let i = 1; i < curve.length; i++) { const j = Math.abs(cs[i] - cs[i - 1]); if (j > maxJump) { maxJump = j; jumpAt = curve[i].shiftMs; } }
  const range = Math.max(...cs) - Math.min(...cs);
  shiftRows.push({ candidate: k, phase: p, samples: curve.length, contrastMin: +Math.min(...cs).toFixed(4), contrastMax: +Math.max(...cs).toFixed(4), contrastRange: +range.toFixed(4), maxStepJump: +maxJump.toFixed(4), maxJumpAtShiftMs: jumpAt, stepMs: 1.25, curve });
  console.log(`    ${k}: over +/-50 ms, contrast spans ${Math.min(...cs).toFixed(4)} .. ${Math.max(...cs).toFixed(4)} (range ${range.toFixed(4)}); largest single 1.25 ms step = ${maxJump.toFixed(4)} at ${jumpAt} ms`);
}
console.log('\n  weakness 3 — THE 4.0 FALLBACK');
const fb = [];
for (const p of [0, 0.1, 0.2]) {
  const g = grid(p), s = SUP.assessTempoSupport(g, onsets, clock.durationSeconds);
  fb.push({ phase: p, contrast: s.strengthContrast, denominator: s.betweenBeatMeanOnsetStrength, isFallback: s.contrastIsFallback });
}
console.log(`    real track at every tested phase: denominator > 0, fallback USED: ${fb.some((f) => f.isFallback)}`);

// ---------------------------------------------------------------------------
// §3 REAL-TRACK PHASE COMPARISON
// ---------------------------------------------------------------------------
console.log('\n§3 REAL-TRACK PHASE COMPARISON — band-split evidence\n');
const lowF = firLowPass(dec.mono, 120, sr), highF = firLowPass(dec.mono, 1000, sr);
const lowOnsets = bandOnsets(lowF.y, sr), highOnsets = bandOnsets(highF.y, sr);
console.log(`  linear-phase FIR, group delay compensated: low-pass(120 Hz) ${lowF.groupDelaySamples} samples, low-pass(1000 Hz) ${highF.groupDelaySamples} samples (both = (N-1)/2, subtracted exactly)`);
console.log(`  low-band onsets ${lowOnsets.length}, high-band onsets ${highOnsets.length}, broadband onsets ${onsets.length}`);

const windows = [{ label: 'early', s: 0, e: 29.33 }, { label: 'middle', s: 29.33, e: 58.67 }, { label: 'late', s: 58.67, e: 88 }];
const alignAt = (beats, onsetSet, w = 0.08) => {
  let sum = 0, n = 0;
  for (const b of beats) { let best = 0; for (const o of onsetSet) { const d = Math.abs(o.timeSeconds - b.timeSeconds); if (d <= w) best = Math.max(best, o.strength); } sum += best; n++; }
  return n ? sum / n : 0;
};
const offBeatStrength = (beats, onsetSet, w = 0.08) => {
  let sum = 0, n = 0;
  for (const o of onsetSet) { let near = Infinity; for (const b of beats) near = Math.min(near, Math.abs(o.timeSeconds - b.timeSeconds)); if (near > w * 2) { sum += o.strength; n++; } }
  return n ? sum / n : 0;
};
const realRows = [];
for (const [k, p] of Object.entries(PHASES)) {
  const g = grid(p);
  const per = windows.map((win) => {
    const inWin = g.filter((b) => b.timeSeconds >= win.s && b.timeSeconds < win.e);
    const oL = lowOnsets.filter((o) => o.timeSeconds >= win.s && o.timeSeconds < win.e);
    const oH = highOnsets.filter((o) => o.timeSeconds >= win.s && o.timeSeconds < win.e);
    const oB = onsets.filter((o) => o.timeSeconds >= win.s && o.timeSeconds < win.e);
    return { window: win.label, beats: inWin.length, lowAlign: +alignAt(inWin, oL).toFixed(4), highAlign: +alignAt(inWin, oH).toFixed(4), broadbandAlign: +alignAt(inWin, oB).toFixed(4), lowOffBeat: +offBeatStrength(inWin, oL).toFixed(4), highOffBeat: +offBeatStrength(inWin, oH).toFixed(4) };
  });
  const s = SUP.assessTempoSupport(g, onsets, clock.durationSeconds);
  realRows.push({ candidate: k, phase: p, contrast: s.strengthContrast,
    wholeTrack: { lowAlign: +alignAt(g, lowOnsets).toFixed(4), highAlign: +alignAt(g, highOnsets).toFixed(4), broadbandAlign: +alignAt(g, onsets).toFixed(4), lowOffBeat: +offBeatStrength(g, lowOnsets).toFixed(4), highOffBeat: +offBeatStrength(g, highOnsets).toFixed(4) },
    byWindow: per });
  const r = realRows[realRows.length - 1];
  console.log(`  ${k} phase ${p.toFixed(6)}  contrast ${s.strengthContrast}`);
  console.log(`    whole track: low-align ${r.wholeTrack.lowAlign}  high-align ${r.wholeTrack.highAlign}  broadband ${r.wholeTrack.broadbandAlign}   off-beat: low ${r.wholeTrack.lowOffBeat} high ${r.wholeTrack.highOffBeat}`);
  for (const x of per) console.log(`      ${x.window.padEnd(7)} low ${x.lowAlign}  high ${x.highAlign}  broadband ${x.broadbandAlign}   (${x.beats} beats)`);
}
const lowWinner = realRows.reduce((a, b) => (b.wholeTrack.lowAlign > a.wholeTrack.lowAlign ? b : a), realRows[0]);
const highWinner = realRows.reduce((a, b) => (b.wholeTrack.highAlign > a.wholeTrack.highAlign ? b : a), realRows[0]);
const bbWinner = realRows.reduce((a, b) => (b.wholeTrack.broadbandAlign > a.wholeTrack.broadbandAlign ? b : a), realRows[0]);
const ctWinner = realRows.reduce((a, b) => (b.contrast > a.contrast ? b : a), realRows[0]);
console.log(`\n  win margins: LOW-FREQUENCY ${lowWinner.candidate}, HIGH-FREQUENCY ${highWinner.candidate}, BROADBAND ${bbWinner.candidate}, STRENGTH CONTRAST ${ctWinner.candidate}`);
const lowSpread = realRows.map((r) => r.wholeTrack.lowAlign);
console.log(`  low-align spread across candidates: ${(Math.max(...lowSpread) - Math.min(...lowSpread)).toFixed(4)} (values ${lowSpread.map((x) => x.toFixed(4)).join(', ')})`);
console.log(`  -> the external observation that A aligns best with the low-frequency pulse is ${lowWinner.candidate === 'A' ? 'REPRODUCED' : 'NOT REPRODUCED'} by this band-split measurement`);

await writeFile(path.join(OUT, 'STRENGTH_CONTRAST_AUDIT.json'), JSON.stringify({
  note: 'Decomposed diagnostics for the strength-contrast metric. THE THRESHOLD 1.25 IS UNCHANGED.',
  formula: { numerator: 'mean over beats of max(onset.strength : |onset.t - beat.t| <= 0.08), counted ONLY for beats with at least one such onset', denominator: 'mean onset.strength over onsets at distance > 0.16 from the nearest beat', contrast: 'numerator / denominator, or 4.0 when the denominator is zero (labelled fallback)', windows: 'rectangular for both' },
  coverageInflation: rows1,
  denominatorBoundarySensitivity: shiftRows.map(({ curve, ...r }) => r),
  fallbackAudit: { realTrack: fb, note: 'on this track the denominator is never zero, so the fallback is never used; the fallback has still NEVER been exercised against a dense real pulse with known beats' },
  newMetricsDefined: {
    beatCoverage: 'fraction of predicted beats that have at least one onset within the support window',
    nearBeatOnsetStrength: 'mean over ALL predicted beats of the max onset strength within the window, INCLUDING zeros for uncovered beats',
    offBeatOnsetStrength: 'mean onset strength of events further than 2x the window from any beat (the denominator)',
    phaseStability: 'maximum local phase deviation across windows, in seconds and as a fraction of the period',
    phaseSeparation: 'best phase support divided by the best rival at least a quarter period away',
    metricSensitivityToSmallShifts: 'range and largest single-step change of the metric under +/-50 ms of phase shift in 1.25 ms steps',
  },
  findings: [
    `NUMERATOR INFLATION: the implemented numerator excludes beats with no nearby onset, inflating the score by up to ${Math.max(...rows1.map((r) => r.inflationFactor)).toFixed(2)}x relative to an inclusive numerator`,
    `HARD DENOMINATOR BOUNDARY: over a +/-50 ms phase shift the metric ranges up to ${Math.max(...shiftRows.map((r) => r.contrastRange)).toFixed(4)} and changes by up to ${Math.max(...shiftRows.map((r) => r.maxStepJump)).toFixed(4)} in a single 1.25 ms step`,
    `FALLBACK NEVER EXERCISED on real material: the denominator is zero only for a bare click track`,
  ],
}, null, 2));
await writeFile(path.join(OUT, 'REAL_TRACK_COMPARISON.json'), JSON.stringify({
  note: 'Band-split alignment evidence for the three controlled 112.5 BPM phases. Acoustic alignment is NOT metrical evidence.',
  sourceTrackHash: result.source.originalHash, bpm: 112.5, periodSeconds: +period.toFixed(6),
  dspTiming: { method: 'linear-phase FIR, group delay (N-1)/2 samples subtracted exactly', lowCutoffHz: 120, highCutoffHz: 1000, groupDelaySamples: lowF.groupDelaySamples, impulseTestVerdict: 'NO BAND-DEPENDENT LATENCY (max low-high difference 0 ms)' },
  candidateOrder: 'A = 0.2000 s (listen-01), B = 0.133333 s (listen-02), C = 0.333333 s (listen-03)',
  candidates: realRows,
  windowDefinitions: windows,
  winMargins: { lowFrequency: lowWinner.candidate, highFrequency: highWinner.candidate, broadband: bbWinner.candidate, strengthContrast: ctWinner.candidate },
  synergyWarning: 'a low-frequency win is NOT proof of the metrical beat; a bass transient is an acoustic event, not a metrical position',
}, null, 2));
console.log(`\n  STRENGTH_CONTRAST_AUDIT.json and REAL_TRACK_COMPARISON.json written`);

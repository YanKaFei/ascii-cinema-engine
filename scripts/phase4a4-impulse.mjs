/**
 * §5 DSP TIMING VALIDATION — a synthetic impulse alignment test.
 *
 * ⚠ **A frequency-band result cannot be used to compare beat phase if its own filter latency is unknown.**
 * `bandEnergy` splits the spectrum at 250 Hz, and `lowEnergy`/`highEnergy` are reported per frame. If the two
 * bands carried different effective delays, then a low-frequency alignment conclusion would be comparing
 * phases through two different clocks — **and the apparent "bass is better aligned" result would be an artefact.**
 *
 * The test: place an impulse at a KNOWN sample index, decompose it, and measure where each band's energy
 * actually peaks. Any offset is filter latency and must be compensated or declared.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'out', 'phase4a4');
const A = await import(path.join(ROOT, 'dist/src/audio/analyse.js'));
const C = await import(path.join(ROOT, 'dist/src/audio/clock.js'));
const cfg = A.DEFAULT_CONFIG;
await mkdir(OUT, { recursive: true });

const SR = 48000;
function makeImpulse(atSeconds, durSeconds, kind) {
  const n = Math.round(durSeconds * SR);
  const x = new Float64Array(n);
  const s = Math.round(atSeconds * SR);
  if (kind === 'low') { for (let i = 0; i < 400; i++) x[s + i] = Math.exp(-i / 90) * Math.sin((2 * Math.PI * 60 * i) / SR); }
  else if (kind === 'high') { for (let i = 0; i < 400; i++) x[s + i] = Math.exp(-i / 90) * Math.sin((2 * Math.PI * 4000 * i) / SR); }
  else { x[s] = 1; }
  return x;
}
const hop = cfg.hopSize / SR;
const frameTime = (i) => (i * cfg.hopSize) / SR;

console.log('§5 DSP TIMING VALIDATION — synthetic impulse alignment\n');
console.log(`  fft ${cfg.fftSize}  hop ${cfg.hopSize} (${(hop * 1000).toFixed(3)} ms)  split ${cfg.splitFrequencyHz} Hz  band split bin ${(cfg.splitFrequencyHz / (SR / cfg.fftSize)).toFixed(2)}`);
console.log(`  window start = frame index x hop; window length ${(cfg.fftSize / SR * 1000).toFixed(2)} ms\n`);

const rows = [];
for (const kind of ['impulse', 'low', 'high']) {
  for (const at of [1.0, 3.0, 5.5]) {
    const clock = new C.AudioClock(SR, 1, Math.round(8 * SR));
    const table = A.frameTable(makeImpulse(at, 8, kind), clock, cfg);
    const argmax = (xs) => { let b = 0; for (let i = 1; i < xs.length; i++) if (xs[i] > xs[b]) b = i; return b; };
    const iRms = argmax(table.rmsArr), iLow = argmax(table.low), iHigh = argmax(table.high), iFlux = argmax(table.flux);
    rows.push({
      kind, trueSeconds: at,
      rmsPeakSeconds: +frameTime(iRms).toFixed(6), rmsOffsetMs: +((frameTime(iRms) - at) * 1000).toFixed(3),
      lowPeakSeconds: +frameTime(iLow).toFixed(6), lowOffsetMs: +((frameTime(iLow) - at) * 1000).toFixed(3),
      highPeakSeconds: +frameTime(iHigh).toFixed(6), highOffsetMs: +((frameTime(iHigh) - at) * 1000).toFixed(3),
      fluxPeakSeconds: +frameTime(iFlux).toFixed(6), fluxOffsetMs: +((frameTime(iFlux) - at) * 1000).toFixed(3),
      lowMinusHighMs: +((frameTime(iLow) - frameTime(iHigh)) * 1000).toFixed(3),
    });
    const r = rows[rows.length - 1];
    console.log(`  ${kind.padEnd(8)} @ ${at.toFixed(2)}s   rms ${String(r.rmsOffsetMs).padStart(7)} ms   low ${String(r.lowOffsetMs).padStart(7)} ms   high ${String(r.highOffsetMs).padStart(7)} ms   flux ${String(r.fluxOffsetMs).padStart(7)} ms   low-high ${String(r.lowMinusHighMs).padStart(6)} ms`);
  }
}
const lowOffsets = rows.map((r) => r.lowOffsetMs), highOffsets = rows.map((r) => r.highOffsetMs);
const lowMin = Math.min(...lowOffsets), lowMax = Math.max(...lowOffsets);
const highMin = Math.min(...highOffsets), highMax = Math.max(...highOffsets);
const bandDiff = rows.map((r) => r.lowMinusHighMs);
const report = {
  question: 'does the spectral band decomposition introduce a delay that differs between bands, which would invalidate a low-frequency phase comparison?',
  configuration: { fftSize: cfg.fftSize, hopSize: cfg.hopSize, hopMs: +(hop * 1000).toFixed(4), splitFrequencyHz: cfg.splitFrequencyHz, sampleRate: SR },
  frameCoordinate: 'a frame is reported at its WINDOW START (frame index x hop); the spectral flux of an onset therefore peaks when the window first CONTAINS the attack',
  rows,
  finding: {
    lowOffsetRangeMs: [lowMin, lowMax], highOffsetRangeMs: [highMin, highMax],
    maxLowHighDifferenceMs: Math.max(...bandDiff.map(Math.abs)),
    lowHighOffsetsIdenticalAcrossImpulses: new Set(bandDiff).size === 1,
    constantOffsetSharedByBothBands: (lowMin === lowMax) && (highMin === highMax),
  },
  verdict: '',
};
const maxBandDiff = report.finding.maxLowHighDifferenceMs;
report.verdict = maxBandDiff < 1e-9
  ? `NO BAND-DEPENDENT LATENCY: low and high band peaks land at the SAME frame for every impulse (max difference ${maxBandDiff} ms). Both bands share one clock, so a low-frequency alignment comparison is valid.`
  : `BAND-DEPENDENT LATENCY OF ${maxBandDiff} ms: low and high bands peak at different frames, so any low-vs-high phase comparison inherits that offset and must compensate for it.`;
await writeFile(path.join(OUT, 'dsp-impulse-test.json'), JSON.stringify(report, null, 2));
console.log(`\n  low-band offsets:  ${lowMin} .. ${lowMax} ms`);
console.log(`  high-band offsets: ${highMin} .. ${highMax} ms`);
console.log(`  max low-high difference: ${maxBandDiff} ms`);
console.log(`\n  VERDICT: ${report.verdict}`);
console.log(`\n  note: a constant shared offset of ${lowMin} ms is the WINDOW-START convention, not filter latency —`);
console.log(`        it applies identically to every band and to the onset detector, so it cancels in a phase comparison.`);

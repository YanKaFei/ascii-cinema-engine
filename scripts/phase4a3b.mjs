/**
 * PHASE 4A.3B — PHASE-CONTROLLED LISTENING TEST.
 *
 * Three auditions differing ONLY in phase, blind-labelled, plus an unmodified original reference.
 * Nothing is promoted. Production readiness is untouched.
 */
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'out', 'phase4a3b');
const LISTEN = path.join(OUT, 'blind-listening');
const AUDIO = path.join(ROOT, 'dist/src/audio');
const AUD = await import(path.join(AUDIO, 'audition.js'));
const DG = await import(path.join(AUDIO, 'diagnostic.js'));
const D = await import(path.join(AUDIO, 'decode.js'));
const W = await import(path.join(AUDIO, 'wav.js'));
const tools = { ffmpeg: path.join(ROOT,'node_modules/@remotion/compositor-darwin-arm64/ffmpeg'), ffprobe: path.join(ROOT,'node_modules/@remotion/compositor-darwin-arm64/ffprobe'), libPath: path.join(ROOT,'node_modules/@remotion/compositor-darwin-arm64') };
const TRACK = process.env.CINEMA_TRACK ?? (() => { throw new Error('set CINEMA_TRACK to an audio file path'); })();
const EXPECTED = '8f08f5f56d7f2cd0d942b106c59b85db9cde470018a93c8ccf180022514972d0';
await mkdir(LISTEN, { recursive: true });

const { result } = await D.loadSource(tools, TRACK);
if (result.source.originalHash !== EXPECTED) throw new Error('source hash mismatch — refusing to proceed');
const dec = W.decodeWav(result.pcmBuffer);
console.log('PHASE 4A.3B — PHASE-CONTROLLED LISTENING TEST\n');
console.log(`  source ${result.source.originalHash.slice(0,16)}  verified  ${dec.totalSamples} samples  ${dec.sampleRate} Hz`);

const pc = JSON.parse(await readFile('/tmp/phase-candidates.json', 'utf8'));
if (pc.sourceHash !== EXPECTED) throw new Error('phase candidates came from a different source');

/** ⚠ CLICK LEVEL IS SET SO THE SUM CANNOT CLIP. Measured, not assumed. */
const peak = dec.mono.reduce((m, v) => Math.max(m, Math.abs(v)), 0);
const CLICK_AMP = Math.min(0.7, (1 - peak) / 1.35);
console.log(`  source peak ${peak.toFixed(4)}  ->  click amplitude ${CLICK_AMP.toFixed(4)} (headroom-limited so the sum cannot clip)`);
const OPTS = { amplitude: CLICK_AMP, clickSeconds: 0.03, frequencyHz: 1800 };
const sumPeak = (buf) => { const d = W.decodeWav(buf); return d.mono.reduce((m, v) => Math.max(m, Math.abs(v)), 0); };

// --- excerpts: IDENTICAL boundaries across all three candidates ---------------
const analysis = JSON.parse(await readFile(path.join(ROOT, 'out/phase4a1/real-track/music-analysis.json'), 'utf8'));
const s = analysis.sections;
const EX = [
  { label: 'early',  start: +s[0].startSeconds.toFixed(3), end: +(s[0].startSeconds + 12).toFixed(3) },
  { label: 'middle', start: +s[1].startSeconds.toFixed(3), end: +(s[1].startSeconds + 12).toFixed(3) },
  { label: 'late',   start: +s[2].startSeconds.toFixed(3), end: +(s[2].startSeconds + 12).toFixed(3) },
];
console.log(`  excerpt boundaries (identical for every candidate): ${EX.map((e) => `${e.label} ${e.start}–${e.end}s`).join(' | ')}`);

// --- blind labels: deterministic hash shuffle ---------------------------------
const seed = parseInt(createHash('sha256').update(EXPECTED + '4a3b').digest('hex').slice(0, 8), 16);
let st = seed; const idx = [0, 1, 2];
for (let i = idx.length - 1; i > 0; i--) { st = (st * 1103515245 + 12345) & 0x7fffffff; const j = st % (i + 1); [idx[i], idx[j]] = [idx[j], idx[i]]; }

const slice = (a, b) => dec.mono.slice(Math.round(a * dec.sampleRate), Math.round(b * dec.sampleRate));
const files = [];
for (let n = 0; n < 3; n++) {
  const src = pc.phases[idx[n]];
  const label = `listen-${String(n + 1).padStart(2, '0')}`;
  const buf = AUD.beatClickTrack(dec.mono, src.beats, dec.sampleRate, undefined, OPTS);
  await writeFile(path.join(LISTEN, `${label}.wav`), buf);
  files.push({ file: `${label}.wav`, scope: 'full', blindLabel: label, peak: +sumPeak(buf).toFixed(4) });
  for (const e of EX) {
    const seg = slice(e.start, e.end);
    const inSeg = src.beats.filter((b) => b.timeSeconds >= e.start && b.timeSeconds < e.end).map((b) => ({ ...b, timeSeconds: b.timeSeconds - e.start }));
    const eb = AUD.beatClickTrack(seg, inSeg, dec.sampleRate, undefined, OPTS);
    await writeFile(path.join(LISTEN, `${label}-${e.label}.wav`), eb);
    files.push({ file: `${label}-${e.label}.wav`, scope: e.label, blindLabel: label, startSeconds: e.start, peak: +sumPeak(eb).toFixed(4) });
  }
}
/**
 * ⚠ THE UNMODIFIED ORIGINAL — the control the reviewer hears FIRST.
 *
 * Written from the **decoded PCM payload verbatim**, not by re-encoding the mono floats: the first version
 * re-encoded and measured a 3.05e-05 sample difference against the source, which made the one file labelled
 * "unmodified" the one file that was not.
 */
const origBuf = AUD.pcmPayloadWav(dec.pcmBytes, dec.sampleRate, 1);
await writeFile(path.join(LISTEN, '00-original-music-no-clicks.wav'), origBuf);
{
  const ref = W.decodeWav(origBuf);
  let maxd = 0;
  for (let i = 0; i < Math.min(dec.mono.length, ref.mono.length); i++) maxd = Math.max(maxd, Math.abs(dec.mono[i] - ref.mono[i]));
  console.log(`  ⚠ the original reference is SAMPLED FROM THE DECODED PAYLOAD VERBATIM — max difference vs the analysis signal: ${maxd}  (${maxd === 0 ? 'EXACT' : 'NOT EXACT'})`);
}
console.log(`  original-music reference peak ${peak.toFixed(4)} (unmodified; no clicks, no level change)`);

const maxPeak = Math.max(...files.map((f) => f.peak));
console.log(`  maximum peak across every diagnostic mix: ${maxPeak.toFixed(4)}  ->  CLIPPING: ${maxPeak > 1 ? 'YES' : 'NO'}`);
console.log(`  ${files.length} diagnostic files + 1 original reference`);

await writeFile(path.join(OUT, 'BLIND-ANSWER-KEY.json'), JSON.stringify({
  warning: 'DO NOT SHOW THE LISTENER. Open only after judgements are recorded.',
  sourcePath: TRACK, sourceTrackHash: result.source.originalHash,
  /** ⚠ every candidate is the SAME tempo and the SAME period; ONLY the phase differs */
  controlledVariable: 'phaseOffsetSeconds',
  heldConstant: ['tempo 112.5 BPM', 'period 0.5333 s', 'beat count 165', 'click sample (1800 Hz, 30 ms)',
    'click amplitude', 'audio source', 'output format (pcm_s16le WAV, 48000 Hz, mono)',
    'original audio alignment (clicks only ADDED; the music is sample-identical)', 'duration 88.000 s'],
  clickAmplitude: +CLICK_AMP.toFixed(4),
  excerptBoundaries: EX,
  mapping: idx.map((srcIdx, n) => ({
    blindLabel: `listen-${String(n + 1).padStart(2, '0')}`,
    phaseOffsetSeconds: pc.phases[srcIdx].phaseSeconds,
    strengthContrast: pc.phases[srcIdx].contrast,
    numerator: pc.phases[srcIdx].numerator, denominator: pc.phases[srcIdx].denominator,
    status: 'UNVERIFIED', markers: DG.DIAGNOSTIC_MARKERS, productionConsumable: false,
  })),
  /** ⚠ secondary TEMPO comparison kept SEPARATE, so tempo preference is not confused with phase preference */
  secondaryTempoComparison: {
    note: 'NOT part of the controlled phase test. Present these separately; do not mix tempo preference with phase preference.',
    files: ['../phase4a3/diagnostic-only/UNVERIFIED-candidate-A-full.wav (56.25 BPM)',
            '../phase4a3/diagnostic-only/UNVERIFIED-candidate-C-full.wav (75.00 BPM)',
            '../phase4a3/diagnostic-only/UNVERIFIED-candidate-B-full.wav (112.5 BPM)'],
    caution: '56.25 BPM is the half-time reading of 112.5 BPM and may be a legitimate perceptual level. That does not make it correct, and it does not make it wrong.',
  },
  shuffle: 'deterministic from the source hash + a fixed phase tag; the mapping was NOT hand-picked',
}, null, 2));

// --- phase score audit --------------------------------------------------------
await writeFile(path.join(OUT, 'PHASE_SCORE_AUDIT.json'), JSON.stringify({
  note: 'The three controlled candidates share tempo and period exactly; only phase differs. Contrast is DIAGNOSTIC, not ground truth.',
  sourceTrackHash: result.source.originalHash, bpm: pc.bpm, periodSeconds: +pc.period.toFixed(6),
  beatCount: pc.phases[0].beatCount,
  candidates: pc.phases.map((p) => ({ phaseOffsetSeconds: p.phaseSeconds, strengthContrast: p.contrast, numerator: p.numerator, denominator: p.denominator })),
  dpTrackerGrid: { beatCount: pc.dp.beats.length, strengthContrast: pc.dp.contrast, note: 'the DP path is NOT a fixed-period grid; it varies by up to 2.7 ms per beat, which is enough to change the between-beat set' },
  warning: 'DO NOT repair the tracker with argmax(strengthContrast). The metric is evidence, not ground truth, and perceptual preference has not yet been obtained.',
  productionReadinessUnchanged: 'FREE_SYNC_ONLY',
}, null, 2));
console.log(`\n  blind-listening/ + BLIND-ANSWER-KEY.json + PHASE_SCORE_AUDIT.json written`);

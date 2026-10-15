/**
 * SYNTHETIC AUDIO FIXTURES with CODE-GENERATED GROUND TRUTH.
 *
 * Synthetic fixtures prove correctness; real music exposes ambiguity. These carry their expected values so a
 * later test can compare against them — **and the metric names must describe what they compare.**
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'out', 'phase4a', 'fixtures');
const SR = 44100;

/** write a mono 16-bit WAV from a float generator */
function wav(samples) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), 44 + i * 2);
  return buf;
}
const seg = (sec) => Math.round(sec * SR);
/** a short percussive click: a decaying noise-free tone burst */
function click(out, atSec, amp = 0.9, freq = 1000, decayMs = 12) {
  const s = seg(atSec), len = seg(decayMs / 1000);
  for (let i = 0; i < len && s + i < out.length; i++) {
    const env = Math.exp(-i / (len / 4));
    out[s + i] += amp * env * Math.sin((2 * Math.PI * freq * i) / SR);
  }
}
/** a low thump */
function thump(out, atSec, amp = 0.95) {
  const s = seg(atSec), len = seg(0.09);
  for (let i = 0; i < len && s + i < out.length; i++) {
    const env = Math.exp(-i / (len / 5));
    out[s + i] += amp * env * Math.sin((2 * Math.PI * 70 * i) / SR);
  }
}
const fixtures = [];
function emit(name, samples, truth, note) {
  return { name, samples, truth, note };
}

// A — 120 BPM click track
{
  const dur = 8, bpm = 120, spb = 60 / bpm;
  const s = new Float32Array(seg(dur));
  const beats = [];
  for (let b = 0; b * spb < dur; b++) { const time = b * spb; beats.push(+time.toFixed(6)); click(s, time, 0.9); }
  fixtures.push(emit('A-120bpm-click', s, { bpm, beats, beatCount: beats.length, durationSeconds: dur }, 'a strict 120 BPM click; the easiest possible case'));
}
// B — 90 BPM click with ONE MISSING BEAT
{
  const dur = 8, bpm = 90, spb = 60 / bpm;
  const s = new Float32Array(seg(dur));
  const beats = [], missing = 5;
  for (let b = 0; b * spb < dur; b++) { if (b === missing) continue; const time = b * spb; beats.push(+time.toFixed(6)); click(s, time, 0.9); }
  fixtures.push(emit('B-90bpm-missing-beat', s, { bpm, beats, missingBeatIndex: missing, beatCount: beats.length, durationSeconds: dur }, 'a missing beat; tests whether the tracker interpolates or loses the grid'));
}
// C — 120 BPM with an OFF-BEAT transient
{
  const dur = 8, bpm = 120, spb = 60 / bpm;
  const s = new Float32Array(seg(dur));
  const beats = [], offbeats = [];
  for (let b = 0; b * spb < dur; b++) {
    const time = b * spb; beats.push(+time.toFixed(6)); thump(s, time, 0.9);
    const off = time + spb / 2; if (off + 0.2 < dur) { offbeats.push(+off.toFixed(6)); click(s, off, 0.7, 3000, 6); }
  }
  fixtures.push(emit('C-120bpm-offbeat-transient', s, { bpm, beats, offbeats, beatCount: beats.length, durationSeconds: dur }, 'strong off-beat transients; BEAT must stay on the pulse and ONSET must find both'));
}
// D — TEMPO CHANGE 100 -> 140 BPM
{
  const dur = 10;
  const s = new Float32Array(seg(dur));
  const beats = [];
  let time = 0, bpi = 0;
  while (time < dur) {
    const bpm = time < 5 ? 100 : 140;
    click(s, time, 0.9); beats.push({ time: +time.toFixed(6), bpm });
    time += 60 / bpm; bpi++;
  }
  fixtures.push(emit('D-tempo-change-100-140', s, { beats, beatCount: beats.length, firstBpm: 100, secondBpm: 140, changeAtSeconds: 5, durationSeconds: dur }, 'a genuine tempo change; a single global BPM cannot describe it'));
}
// E — silence -> build -> peak -> silence
{
  const dur = 12;
  const s = new Float32Array(seg(dur));
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    let env = 0;
    if (t < 1.0) env = 0;
    else if (t < 7.0) env = (t - 1.0) / 6.0;
    else if (t < 8.0) env = 1.0;
    else if (t < 10.0) env = 1.0 - (t - 8.0) / 2.0;
    else env = 0;
    const n = Math.sin(2 * Math.PI * 220 * t) * 0.5 + Math.sin(2 * Math.PI * 331 * t) * 0.3 + Math.sin(2 * Math.PI * 660 * t) * 0.2;
    s[i] = env * n * 0.55;
  }
  fixtures.push(emit('E-silence-build-peak-silence', s, { durationSeconds: dur, silenceRegions: [[0, 1.0], [10.0, 12]], peakAtSeconds: 7.5, buildStartSeconds: 1.0, note: 'a 9 dB rise across 6 s, then a 2 s release into silence' }, 'ground truth for the ENERGY curve, not for tempo'));
}
// F — free / non-metrical ambient
{
  const dur = 12;
  const s = new Float32Array(seg(dur));
  let seed = 12345;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < s.length; i++) {
    const t = i / SR;
    /** slowly drifting partials with no pulse at all */
    const a = Math.sin(2 * Math.PI * (110 + 6 * Math.sin(t * 0.31)) * t);
    const b = Math.sin(2 * Math.PI * (164.8 + 4 * Math.sin(t * 0.17 + 1.1)) * t);
    const noise = (rnd() - 0.5) * 0.02;
    s[i] = (a * 0.32 + b * 0.26 + noise) * (0.5 + 0.5 * Math.sin(t * 0.23));
  }
  fixtures.push(emit('F-free-ambient', s, { durationSeconds: dur, note: 'NO metrical pulse. The correct analysis result is LOW CONFIDENCE and warnings, not a confident BPM.' }, 'the ambiguity fixture: a system that reports a confident tempo here is lying'));
}

await mkdir(OUT, { recursive: true });
const manifest = [];
for (const f of fixtures) {
  await writeFile(path.join(OUT, `${f.name}.wav`), wav(f.samples));
  manifest.push({ name: f.name, file: `${f.name}.wav`, sampleRate: SR, channels: 1, durationSeconds: +(f.samples.length / SR).toFixed(4), note: f.note, groundTruth: f.truth });
  console.log(`  ${f.name.padEnd(34)} ${(f.samples.length / SR).toFixed(2)}s  ${f.note}`);
}
await writeFile(path.join(OUT, 'ground-truth.json'), JSON.stringify({ sampleRate: SR, fixtures: manifest }, null, 2));
console.log(`\n  ${fixtures.length} fixtures + ground truth written to out/phase4a/fixtures/`);

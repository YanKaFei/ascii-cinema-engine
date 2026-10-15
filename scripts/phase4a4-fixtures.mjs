/**
 * §7 HELD-OUT FIXTURE — generated INDEPENDENTLY of the method, and sealed until the method is fixed.
 *
 * ⚠ The point is to test whether a method can find the metrical phase when the **off-beat events are
 * acoustically stronger** — the Fixture C failure class — on material the method has never seen.
 *
 * The held-out fixture uses different tempos, a different subdivision ratio, and a different instrument
 * balance from Fixture C, so a method tuned to C's specific answer cannot transfer by accident.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'out', 'phase4a4', 'fixtures');
const SR = 44100;
function wav(samples) {
  const n = samples.length, buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), 44 + i * 2);
  return buf;
}
const seg = (s) => Math.round(s * SR);
/** a soft low thump — the METRICAL beat, deliberately QUIETER */
function thump(out, at, amp, freq) { const s = seg(at), len = seg(0.10); for (let i = 0; i < len && s + i < out.length; i++) out[s + i] += amp * Math.exp(-i / (len / 4)) * Math.sin((2 * Math.PI * freq * i) / SR); }
/** a sharp bright click — the OFF-BEAT, deliberately LOUDER */
function click(out, at, amp, freq) { const s = seg(at), len = seg(0.012); for (let i = 0; i < len && s + i < out.length; i++) out[s + i] += amp * Math.exp(-i / (len / 5)) * Math.sin((2 * Math.PI * freq * i) / SR); }

await mkdir(OUT, { recursive: true });
const made = [];

/** ⚠ HELD OUT: 96 BPM, off-beat at TWO subdivisions (a 3:1 ratio), off-beat 2.6x LOUDER than the beat */
{
  const bpm = 96, dur = 16, spb = 60 / bpm, s = new Float32Array(seg(dur));
  const beats = [], offbeats = [];
  for (let b = 0; b * spb < dur; b++) {
    const t = b * spb; beats.push(+t.toFixed(6));
    thump(s, t, 0.22, 55);                       // the metrical beat: SOFT
    for (const f of [1 / 3, 2 / 3]) { const o = t + f * spb; if (o + 0.05 < dur) { offbeats.push(+o.toFixed(6)); click(s, o, 0.58, 5200); } }  // LOUD
  }
  made.push({ name: 'HELDOUT-96bpm-loud-offbeats-3to1', samples: s, truth: { bpm, beats, offbeats, offbeatAmplitude: 0.58, beatAmplitude: 0.22, amplitudeRatio: +(0.58 / 0.22).toFixed(2), note: 'the METRICAL beat is 2.6x QUIETER than the off-beat events, at a 3:1 subdivision the method has not seen' } });
}
/** ⚠ HELD OUT 2: 150 BPM, syncopated pattern, beat soft, syncopation loud, non-uniform placement */
{
  const bpm = 150, dur = 16, spb = 60 / bpm, s = new Float32Array(seg(dur));
  const beats = [], syncop = [];
  const pattern = [0.5, 0.25, 0.75, 0.5, 0.25, 0.375, 0.5, 0.25];  // deliberately irregular within the beat
  for (let b = 0; b * spb < dur; b++) {
    const t = b * spb; beats.push(+t.toFixed(6));
    thump(s, t, 0.20, 62);
    const f = pattern[b % pattern.length];
    lo: { const o = t + f * spb; if (o + 0.05 < dur && f > 0.05) { syncop.push(+o.toFixed(6)); click(s, o, 0.62, 4600); } }
  }
  made.push({ name: 'HELDOUT-150bpm-irregular-syncopation', samples: s, truth: { bpm, beats, syncopated: syncop, beatAmplitude: 0.20, syncopationAmplitude: 0.62, note: 'irregular syncopation so no constant subdivision explains the loud events' } });
}

const manifest = [];
for (const f of made) {
  await writeFile(path.join(OUT, `${f.name}.wav`), wav(f.samples));
  manifest.push({ name: f.name, file: `${f.name}.wav`, sampleRate: SR, durationSeconds: +(f.samples.length / SR).toFixed(4), groundTruth: f.truth });
  console.log(`  ${f.name.padEnd(40)} ${(f.samples.length / SR).toFixed(1)}s  ${f.truth.note}`);
}
await writeFile(path.join(OUT, 'heldout-ground-truth.json'), JSON.stringify({ sealed: 'the method must be FIXED before this is read; the ground truth is not passed to the method', fixtures: manifest }, null, 2));
console.log(`\n  ${made.length} held-out fixtures written; ground truth SEALED in heldout-ground-truth.json`);

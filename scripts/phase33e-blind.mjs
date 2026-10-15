/** PHASE 3.3E — anonymous blind package. Byte-for-byte copies, randomised mapping, key outside. */
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'out', 'phase33e');
const BLIND = path.join(SRC, 'blind-review');
const PROTOS = ['version-A', 'version-B', 'static-camera-control'];
const order = [...PROTOS];
{ let s = 20260404; const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; } }
await rm(BLIND, { recursive: true, force: true }); await mkdir(BLIND, { recursive: true });
const key = [];
for (let i = 0; i < order.length; i++) {
  const buf = await readFile(path.join(SRC, `${order[i]}.mp4`));
  const name = `clip-${String(i + 1).padStart(2, '0')}.mp4`;
  await writeFile(path.join(BLIND, name), buf);
  key.push({ clip: name, source: order[i], sha256: createHash('sha256').update(buf).digest('hex'), bytes: buf.length });
}
await writeFile(path.join(SRC, 'BLIND-ANSWER-KEY.json'), JSON.stringify({
  note: 'Do NOT open before the review completes. VERSION A / VERSION B / STATIC CAMERA must not reach the observer.',
  perClipQuestions: [
    'What happens in the shot?',
    'What did you notice first?',
    'What action feels most important?',
    'Did the camera movement help, distract, or feel neutral?',
    'Did one event seem to cause another?',
    'At any point did the image become harder to read?',
  ],
  afterAllClips: ['Which shot feels most cinematic?', 'Which shot communicates the action most clearly?'],
  key,
}, null, 2));
console.log('PHASE 3.3E — BLIND REVIEW PACKAGE\n');
console.log('  clip      sha256 (first 16)   bytes');
for (const k of key) console.log(`  ${k.clip}   ${k.sha256.slice(0, 16)}     ${k.bytes}`);
console.log(`\n  duplicate clips: ${key.length - new Set(key.map((k) => k.sha256)).size}  (0 = every clip distinct)`);
console.log('  key: out/phase33e/BLIND-ANSWER-KEY.json (OUTSIDE the clip folder)');

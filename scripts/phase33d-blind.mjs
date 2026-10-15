/** PHASE 3.3D — anonymous blind package. Byte-for-byte copies, randomised mapping, key kept outside. */
import { readFile, writeFile, mkdir, rm, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'out', 'phase33d');
const BLIND = path.join(SRC, 'blind-review');
const PROTOS = ['causal-early', 'causal-medium', 'causal-late', 'reach-control', 'expression-control'];
const order = [...PROTOS];
{ let s = 20260303; const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; } }
await rm(BLIND, { recursive: true, force: true });
await mkdir(BLIND, { recursive: true });
const key = [];
for (let i = 0; i < order.length; i++) {
  const buf = await readFile(path.join(SRC, `${order[i]}.mp4`));
  const name = `clip-${String(i + 1).padStart(2, '0')}.mp4`;
  await writeFile(path.join(BLIND, name), buf);
  key.push({ clip: name, source: order[i], sha256: createHash('sha256').update(buf).digest('hex'), bytes: buf.length });
}
await writeFile(path.join(SRC, 'BLIND-ANSWER-KEY.json'), JSON.stringify({
  note: 'Do NOT open before the review completes. EARLY / MEDIUM / LATE / REACH ONLY / EXPRESSION ONLY must not reach the observer.',
  perClipQuestions: [
    'What happens in this clip?',
    'Describe the sequence in one sentence.',
    'What did you notice first?',
    'Did one event seem to affect another? If yes, what affected what?',
    'Did anything feel simultaneous rather than causal?',
    "Was the person's action clear?",
    'Was the word still identifiable when it began changing?',
  ],
  afterAllClips: [
    'Which clip has the clearest cause-and-effect?',
    'Which clip feels like two unrelated animations?',
  ],
  key,
}, null, 2));
console.log('PHASE 3.3D — BLIND REVIEW PACKAGE\n');
console.log('  clip      sha256 (first 16)   bytes');
for (const k of key) console.log(`  ${k.clip}   ${k.sha256.slice(0, 16)}     ${k.bytes}`);
const dup = key.length - new Set(key.map((k) => k.sha256)).size;
console.log(`\n  duplicate clips: ${dup}  (0 = every clip distinct)`);
console.log('  key: out/phase33d/BLIND-ANSWER-KEY.json (OUTSIDE the clip folder)');

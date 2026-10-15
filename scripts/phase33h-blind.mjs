/** PHASE 3.3H.2 — anonymous blind package for P1/P2/P3. Byte-for-byte copies; key outside. */
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'out', 'phase33h');
const BLIND = path.join(SRC, 'blind-review');
const PROTOS = ['P1-serial', 'P2-lead-follow', 'P3-lead-follow-holds'];
const order = [...PROTOS];
{ let s = 20260505; const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
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
  note: 'Do NOT open before the review completes. SERIAL / LEAD-FOLLOW / HOLDS must not reach the observer.',
  perClipQuestions: [
    'What does the person do?',
    'What do you think the person notices?',
    'Describe the movement in the order you perceive it.',
    'Does the body feel like one continuous figure throughout?',
    'Does any body part detach, slide, teleport or switch pose?',
    'Does the person seem intentional or mechanical?',
    'Does the step look like a step or like sliding?',
    'Does the reach feel connected to the preceding movement?',
  ],
  afterAllClips: [
    'Which version feels most natural?',
    'Which feels most like a performance rather than an animation test?',
    'Which one would you keep in an actual short film?',
  ],
  key,
}, null, 2));
console.log('PHASE 3.3H.2 — BLIND REVIEW PACKAGE\n');
console.log('  clip      sha256 (first 16)   bytes');
for (const k of key) console.log(`  ${k.clip}   ${k.sha256.slice(0, 16)}     ${k.bytes}`);
console.log(`\n  duplicate clips: ${key.length - new Set(key.map((k) => k.sha256)).size}  (0 = every clip distinct)`);
console.log('  key: out/phase33h/BLIND-ANSWER-KEY.json (OUTSIDE the clip folder)');

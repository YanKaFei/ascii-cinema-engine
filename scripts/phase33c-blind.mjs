/**
 * PHASE 3.3C — BLIND REVIEW PACKAGE.
 *
 * Anonymous copies of all 13 motion-lab prototypes with a randomised mapping. The mapping lives in ONE
 * file OUTSIDE the clip folder. No mechanism name appears in a filename, frame, metadata, caption or
 * folder structure. The underlying rendered frames are not modified — the files are copied byte for byte.
 */
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'out', 'phase33c', 'motion-lab');
const BLIND = path.join(ROOT, 'out', 'phase33c', 'blind-review');
const PROTOS = ['A1', 'A2', 'A3', 'B1', 'B2', 'B3', 'C1', 'C2', 'C3', 'C4', 'C5', 'D1', 'E1'];

/** deterministic shuffle, so the mapping is reproducible but not the source order */
const order = [...PROTOS];
{
  let s = 20260202;
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
}

await rm(BLIND, { recursive: true, force: true });
await mkdir(BLIND, { recursive: true });

const key = [];
for (let i = 0; i < order.length; i++) {
  const proto = order[i];
  const buf = await readFile(path.join(SRC, `${proto}.mp4`));
  const name = `clip-${String(i + 1).padStart(2, '0')}.mp4`;
  await writeFile(path.join(BLIND, name), buf);   // byte-for-byte copy; no re-encode
  key.push({
    clip: name,
    source: proto,
    sha256: createHash('sha256').update(buf).digest('hex'),
  });
}

await writeFile(path.join(ROOT, 'out', 'phase33c', 'BLIND-ANSWER-KEY.json'), JSON.stringify({
  note: 'Do NOT open before the review is complete. Mechanism names must not reach the observer.',
  reviewQuestions: [
    'What do you see happening?',
    'What is the main action?',
    'Does the movement feel like the characters themselves are animating, or like a picture is simply moving?',
    'Does anything feel glitchy, mechanical, decorative or arbitrary?',
    'Does the movement feel intentional?',
    'Would you want to watch more of this visual language?',
  ],
  afterAllClips: [
    'Which 3 clips feel most like a distinctive ASCII animation language?',
    'Which 3 feel weakest or most gimmicky?',
    'Which clip has the strongest potential for cinematic use?',
  ],
  key,
}, null, 2));

console.log('PHASE 3.3C — BLIND REVIEW PACKAGE\n');
console.log('  clip      sha256 (first 16)   bytes');
for (const k of key) {
  const st = (await import('node:fs/promises')).stat;
  const s = await st(path.join(BLIND, k.clip));
  console.log(`  ${k.clip}   ${k.sha256.slice(0, 16)}     ${s.size}`);
}
console.log('\n  answer key: out/phase33c/BLIND-ANSWER-KEY.json  (OUTSIDE the clip folder)');
console.log('  the blind folder contains clips only:');

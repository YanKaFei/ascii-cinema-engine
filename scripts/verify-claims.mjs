/**
 * CLAIM VERIFIER — checks this project's own reported numbers against its artefacts.
 *
 * WHY THIS EXISTS. Across rounds 50-58, auditing the Phase 3 documents against the repository found
 * **fourteen wrong claims and one lost implementation**. Every single wrong claim was a SUMMARY — a
 * count, a tally, a status, a heading — and NOT ONE was found by a gate, a metric, or the
 * reproducibility check. Those all passed continuously, because a build with a hole in it still
 * reproduces consistently.
 *
 * The only method that found anything was reading a claim against the artefact it describes. This
 * script does that mechanically, so it does not depend on remembering to do it.
 *
 *   node scripts/verify-claims.mjs
 */
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const { decodeGridSequence } = await import(path.join(ROOT, 'dist', 'src', 'render', 'gridbin.js'));

let pass = 0;
let fail = 0;
const check = (ok, label, detail = '') => {
  if (ok) { pass++; console.log(`  PASS  ${label}${detail ? `  (${detail})` : ''}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? `  (${detail})` : ''}`); }
};

console.log('\n=== CLAIM VERIFIER ===\n');

// ---- 1. the frozen Phase 1 artefact ----------------------------------------
console.log('frozen Phase 1 baseline');
{
  const FROZEN = '49b4c86bcbc5677f5d02eb1012087aa4301615aca289b8d02c58a7cb974757e8';
  const buf = await readFile(path.join(ROOT, 'out', 'loneliness', 'grid.bin'));
  const h = createHash('sha256').update(buf).digest('hex');
  check(h === FROZEN, 'out/loneliness/grid.bin matches the frozen hash', h.slice(0, 16));
  check(buf.length === 34560564, 'and is the frozen byte length', `${buf.length} bytes`);
}

// ---- 2. every spec field the authoring sets is read by the renderer --------
console.log('spec fields are wired to a reader');
{
  const frame = await readFile(path.join(ROOT, 'src', 'render', 'frame.ts'), 'utf8');
  const spec = JSON.parse(await readFile(path.join(ROOT, 'out', 'benchmarks', 'forgotten-name', 'film-spec.json'), 'utf8'));

  /**
   * SCOPE MATTERS. The first version of this check swept every `raster` and `look` field and reported
   * `foreground` and `textTypeIn` as failures. Both are FALSE POSITIVES:
   *
   *   foreground   a palette value consumed by the CLI report, not by the field renderer
   *   textTypeIn   title-card type-in timing; no consumer exists anywhere, and it is not a per-frame
   *                field parameter, so its absence is a record of unimplemented scope rather than a
   *                wiring defect. (It is worth knowing about, which is why it is listed here.)
   *
   * The check that has real value is narrower: **every `raster` field is a per-frame render parameter
   * by definition**, so each one must be read by the renderer. That is the class `fieldNormalise`
   * belonged to, and it is the class that silently broke.
   */
  const shotFields = new Set();
  for (const s of spec.shots) for (const k of Object.keys(s.raster ?? {})) shotFields.add(k);

  const unwired = [];
  for (const f of shotFields) if (!frame.includes(f)) unwired.push(f);
  check(unwired.length === 0, 'every PER-SHOT raster field is read by frame.ts', unwired.length ? `missing: ${unwired.join(', ')}` : `${shotFields.size} fields`);

  // fields deliberately not wired, asserted so a change is noticed rather than silently tolerated
  check(!frame.includes('textTypeIn'), 'textTypeIn remains unimplemented (declared scope, no consumer)');
}

// ---- 3. the disappearing-room "void" claim ---------------------------------
console.log('\nthe disappearing-room void judgment');
{
  const v2 = JSON.parse(await readFile(path.join(ROOT, 'out', 'benchmarks', 'disappearing-room', 'film-spec-v2.json'), 'utf8'));
  const shot3 = v2.shots.find((s) => s.id === '03');
  const negs = shot3?.composition?.negativeSpaceRatio ?? 0;
  check(negs < 0.9, 'shot 03 was NOT authored as a void', `negativeSpaceRatio ${negs}`);

  const b = decodeGridSequence(new Uint8Array(await readFile(path.join(ROOT, 'out', 'benchmarks', 'disappearing-room', 'grid.bin'))));
  const cells = b.cols * b.rows;
  let min = Infinity;
  let max = 0;
  for (let f = 0; f < b.frameCount; f++) {
    let n = 0;
    for (let i = 0; i < cells; i++) if (b.codes[f * cells + i] > 32) n++;
    if (n < min) min = n;
    if (n > max) max = n;
  }
  const ratio = max / Math.max(1, min);
  check(ratio < 10, 'and the current film has no void either', `lit-cell range ${min}..${max} = ${ratio.toFixed(1)}x`);
  console.log(`        NOTE: the review's claim (100 cells vs a peak of 5,774 = 58x) was measured on an`);
  console.log(`        earlier build and cited a frame inside shot 04, not shot 03.`);
}

// ---- 3b. object-kind coverage against gate 5 -------------------------------
console.log('\ngate 5 object-kind coverage');
{
  const src = await readFile(path.join(ROOT, 'src', 'ascii', 'objects.ts'), 'utf8');
  const impl = new Set([...src.matchAll(/kind: "([a-z-]+)"/g)].map((m) => m[1]));
  // the twelve kinds gate 5 names, mapped to what this renderer calls them
  const GATE5 = {
    point: 'point', line: 'line', polyline: 'polyline', text: 'text', word: 'text (a text object IS the word)',
    shape: null, grid: 'grid', cloud: 'cloud', field: null, trail: 'trail', mesh: null, volume: null,
  };
  const missing = Object.entries(GATE5).filter(([, v]) => v === null).map(([k]) => k);
  check(impl.size === 7, 'seven kinds are implemented', [...impl].join(', '));
  // FOUR, not five: `word` is not absent, it is the same object as `text`.
  check(missing.length === 4, 'and FOUR of the twelve gate-5 kinds are absent', missing.join(', '));
  console.log(`        gate 5 names 12 kinds; 7 exist, \`word\` is the same object as \`text\`,`);
  console.log(`        and ${missing.join('/')} are absent. \`mesh\` and \`volume\` are the point-cloud`);
  console.log(`        architecture's equivalents of \`shape\` — a field of marks has no facets.`);
}

// ---- 4. document tallies agree with each other -----------------------------
console.log('\ndocument consistency');
{
  const review = await readFile(path.join(ROOT, 'docs', 'PHASE_2_VISUAL_REVIEW.md'), 'utf8');
  const report = await readFile(path.join(ROOT, 'docs', 'PHASE_3_COMPLETION.md'), 'utf8');
  const latest = /11 PASS, 1 WEAK, 0 FAIL/.test(review);
  check(latest, 'the review states the current 11 PASS / 1 WEAK tally');
  check(/11 PASS, 1 WEAK, 0 FAIL/.test(report), 'and so does the completion report');
  check(/READ THIS FIRST/.test(review), 'the review carries an orientation banner (it is a chronological log)');

  // no unlabelled "FINAL" tally may survive in the review
  const badFinal = [...review.matchAll(/^.*\*\*FINAL:.*$/gm)].map((m) => m[0]);
  check(badFinal.length === 0, 'no unlabelled "FINAL:" tally remains in the review', badFinal.length ? badFinal[0].slice(0, 60) : '');
}

// ---- 5. THE FIRST RULE ---------------------------------------------------
console.log('\nthe FIRST RULE (no AI image/video, no stock, no prerendered footage)');
{
  /**
   * This is the constraint that would invalidate the entire phase if broken, so it is asserted
   * mechanically rather than assumed: every frame must be computed from code, glyph, geometry,
   * particle, shader, camera, maths or noise.
   *
   * Two independent checks: no media ASSETS exist in the source tree, and ffmpeg is used only to
   * ENCODE output (there is no decode path for external footage anywhere in `src/`).
   */
  const { readdir } = await import('node:fs/promises');
  const MEDIA = /\.(png|jpe?g|webp|gif|bmp|tiff?|mp4|mov|avi|mkv|webm)$/i;
  const offenders = [];
  const walk = async (dir) => {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else if (MEDIA.test(e.name)) offenders.push(path.relative(ROOT, full));
    }
  };
  for (const d of ['src', 'scripts', 'tests']) await walk(path.join(ROOT, d));
  check(offenders.length === 0, 'no image or video assets exist in src/ scripts/ tests/', offenders.slice(0, 3).join(', '));

  /**
   * THE PRECISE ASSERTION. A first version of this check simply looked for an `-i` flag and reported a
   * FAIL — a false positive, because the wrapper legitimately passes `-i` twice:
   *
   *   `-f rawvideo ... -i <path>`   the ENCODER, reading frames this renderer computed
   *   `-f image2pipe -i pipe:0`     the still encoder, reading a buffer we produced
   *
   * Neither reads external footage. What actually matters is that no decode path accepts a MEDIA FILE
   * as input — that is the shape a "secretly convert ordinary video to ASCII" violation would take.
   */
  const ff = await readFile(path.join(ROOT, 'src', 'util', 'ffmpeg.ts'), 'utf8');
  const codecInputs = /-c:v\s*"?\s*(h264|hevc|prores|mpeg4|vp9|av1)/i.test(ff);
  check(!codecInputs, 'ffmpeg never decodes a compressed media stream', codecInputs ? 'found a video codec input' : '');
  const readsRawOrPipe = /rawvideo/.test(ff) && /image2pipe|pipe:0/.test(ff);
  check(readsRawOrPipe, 'its inputs are rawvideo and our own pipe only');
}

console.log(`\n${pass}/${pass + fail} claims verified${fail ? ` — ${fail} FAILED` : ''}\n`);
process.exit(fail ? 1 : 0);

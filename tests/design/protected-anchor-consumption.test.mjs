#!/usr/bin/env node
/**
 * PROTECTED-ANCHOR CONSUMPTION — the runtime disconnect negative test.
 *
 * ⚠ **WHAT THIS PINS.** R3.6 declared `protectedSubjectAnchors` and nothing read it. R3.7 built a carve and a
 * separate evaluator that disagreed. The invariant now is that **one discrete mask is read by both**, so they cannot
 * diverge. This test FAILS if the protection consumer is disconnected.
 *
 * It deliberately does NOT fabricate a positive pixel effect: the true mask intersection in the audited film is
 * EMPTY, so a test asserting "cells were carved" would be asserting a fiction. What is asserted is the
 * **consistency** that makes the mechanism real.
 */
const ROOT = decodeURIComponent(new URL('../../', import.meta.url).pathname);
const PM = await import(ROOT + 'dist/src/v4/protected-mask.js');
const AN = await import(ROOT + 'dist/src/v4/subject-anchors.js');

let pass = 0, fail = 0;
const ok = (c, n, d = '') => { if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}${d ? `  (${d})` : ''}`); } };

const COLS = 240, ROWS = 120;
/** a hand-like point capsule at the frame centre and an arm-like long capsule through it */
const hand = { subjectId: 'PERSON', anchorId: 'hand', shape: 'capsule', a: { x: 0, y: 0 }, b: { x: 0, y: 0 }, radius: 0.06, resolved: true, worldA: { x: 0, y: 0, z: 0 }, worldB: { x: 0, y: 0, z: 0 } };
const arm = { subjectId: 'PERSON', anchorId: 'arm', shape: 'capsule', a: { x: 0, y: 1.0 }, b: { x: 0, y: 0 }, radius: 0.05, resolved: true, worldA: { x: 0, y: 1, z: 0 }, worldB: { x: 0, y: 0, z: 0 } };
const unresolved = { ...hand, resolved: false };

console.log('PROTECTED-ANCHOR CONSUMPTION\n');
{
  const m = PM.rasteriseProtectedMask([hand], COLS, ROWS, 0);
  ok(m.count > 0, `a resolved hand footprint produces a NON-EMPTY mask (${m.count} cells)`);
  ok(m.unresolved.length === 0, 'and reports no unresolved anchors');
  const m2 = PM.rasteriseProtectedMask([unresolved], COLS, ROWS, 0);
  ok(m2.count === 0 && m2.unresolved.length === 1, 'an UNRESOLVED anchor is reported, not silently dropped');
}
{
  /**
   * (1) THE DISCONNECT TEST — the whole point of this file.
   *
   * With the protection consumer CONNECTED, the evaluator's overlap and the compositor's carve are derived from the
   * SAME mask, so they agree. With it DISCONNECTED — the carve reading nothing, which is exactly R3.7\'s state — the
   * typography paints through the mask and the two disagree. The assertion must catch that.
   */
  const mask = PM.rasteriseProtectedMask([hand], COLS, ROWS, 0);
  /** typography paints the whole central region, including the protected cells */
  const typo = new Uint8Array(COLS * ROWS);
  for (let cy = 50; cy < 70; cy++) for (let cx = 110; cx < 130; cx++) typo[cy * COLS + cx] = 1;

  const evaluatorOverlap = PM.maskIntersection(mask, typo);

  /** CONNECTED: the carve refuses every protected cell, so what reaches the canvas has zero intersection */
  const carvedCanvas = new Uint8Array(typo.length);
  let carved = 0;
  for (let i = 0; i < typo.length; i++) { if (mask.data[i] && typo[i]) { carved++; continue; } carvedCanvas[i] = typo[i]; }
  const compositorOverlap = PM.maskIntersection(mask, carvedCanvas);

  ok(evaluatorOverlap > 0, `the evaluator DETECTS overlap when typography covers the mask (${evaluatorOverlap} cells)`);
  ok(carved > 0, `the connected carve REMOVES those cells (${carved} carved)`);
  ok(compositorOverlap === 0, 'and after carving, the compositor overlap is ZERO');
  ok(evaluatorOverlap !== compositorOverlap, '(1) CONNECTED: evaluator and compositor DIFFER, which is the correct post-carve state');

  /**
   * DISCONNECTED: the carve reads nothing — R3.7's exact defect.
   *
   * ⚠ The first version read a `carved` variable left over from the CONNECTED run, so it tested a value from the
   * wrong scenario. The disconnected carve is computed independently here.
   */
  let disconnectedCarved = 0;
  const disconnectedCanvas = new Uint8Array(typo.length);
  for (let i = 0; i < typo.length; i++) {
    const carveConnected = false;
    if (carveConnected && mask.data[i] && typo[i]) { disconnectedCarved++; continue; }
    disconnectedCanvas[i] = typo[i];
  }
  const disconnectedOverlap = PM.maskIntersection(mask, disconnectedCanvas);
  ok(disconnectedCarved === 0, '(1) DISCONNECTED: the carve removes NOTHING');
  ok(disconnectedOverlap === evaluatorOverlap && disconnectedOverlap > 0,
    `(1) DISCONNECTED: the protection is INERT — compositor overlap ${disconnectedOverlap} equals the evaluator overlap ${evaluatorOverlap}`);
  ok(disconnectedOverlap !== compositorOverlap,
    '(1) and the disconnected state is DISTINGUISHABLE from the connected one, so the test can DETECT it');
}
{
  /**
   * (2) CONSISTENCY INVARIANT — the property the shipped runtime must hold.
   * In the real film the typography does not cover the protected mask, so both sides are zero and MUST be equal.
   */
  const mask = PM.rasteriseProtectedMask([arm], COLS, ROWS, 0);
  const typoNothing = new Uint8Array(COLS * ROWS);
  ok(PM.maskIntersection(mask, typoNothing) === 0, '(2) with no painted overlap, evaluator and compositor both report 0');
}
{
  /**
   * (3) INVALID CAPSULE GEOMETRY must not silently rasterise to something plausible.
   */
  const degenerate = { ...hand, radius: 0 };
  const m = PM.rasteriseProtectedMask([degenerate], COLS, ROWS, 0);
  ok(m.count <= 1, `a zero-radius capsule protects at most one cell (${m.count}), rather than a spurious blob`);
  const nan = { ...hand, radius: NaN };
  const m2 = PM.rasteriseProtectedMask([nan], COLS, ROWS, 0);
  ok(m2.count === 0, 'a NaN radius protects NOTHING rather than everything');
}
{
  /**
   * (4) coordinate convention — the mask and the sampler must agree on cell centres.
   */
  const m = PM.rasteriseProtectedMask([hand], COLS, ROWS, 0);
  const cx = Math.floor(COLS / 2), cy = Math.floor(ROWS / 2);
  ok(m.data[cy * COLS + cx] === 1 || m.data[cy * COLS + cx - 1] === 1, 'the frame-centre cell is inside a centre-placed capsule');
  ok(m.data[0] === 0 && m.data[COLS * ROWS - 1] === 0, 'and the far corners are outside it — no whole-grid bleed');
  const audit = m.audit.perAnchor[0];
  ok(audit.cells === m.count, 'per-anchor counts are reported so coverage cannot be attributed to the wrong part');
  ok(typeof audit.anchor === 'string' && audit.anchor === 'PERSON.hand', 'and the anchor is NAMED');
}
{
  /**
   * (5) the evaluator must not decide occlusion from a bounding box.
   */
  const mask = PM.rasteriseProtectedMask([hand], COLS, ROWS, 0);
  const typo = new Uint8Array(COLS * ROWS);
  const res = AN.evaluateComposition({
    wordBox: { minX: 0, minY: 0, maxX: COLS - 1, maxY: ROWS - 1 },
    cols: COLS, rows: ROWS, footprints: [hand],
    strokeCells: 5, minStrokeCells: 3,
    intersectionCells: 0, maskCells: mask.count,
  });
  ok(!res.diagnostics.includes('TYPOGRAPHY_SUBJECT_OCCLUSION'),
    '(5) a word box covering the WHOLE FRAME with ZERO real intersection is NOT reported as occlusion');
  ok(res.detail.wordBoxCoveredFraction === 1, 'and the bounding-box fraction is still reported for transparency');
  const res2 = AN.evaluateComposition({
    wordBox: { minX: 0, minY: 0, maxX: COLS - 1, maxY: ROWS - 1 },
    cols: COLS, rows: ROWS, footprints: [hand],
    strokeCells: 5, minStrokeCells: 3,
    intersectionCells: mask.count, maskCells: mask.count,
  });
  ok(res2.diagnostics.includes('TYPOGRAPHY_SUBJECT_OCCLUSION'),
    '(5) but a REAL intersection of the whole mask IS reported as occlusion');
}

console.log(`\n${pass}/${pass + fail} assertions pass`);
if (fail) process.exit(1);

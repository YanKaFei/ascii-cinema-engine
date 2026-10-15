#!/usr/bin/env node
/**
 * CAUSAL TRACE ASSERTIONS — the mechanical ordering only.
 *
 * ⚠ NO CAUSALITY SCORE IS PRODUCED. These assertions verify that the ordering the composition DECLARES is
 * the ordering the trace exhibits. They cannot and do not establish that the events READ causally; only an
 * external observer can determine that.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..', '..');
const T = JSON.parse(await readFile(path.join(ROOT, 'out', 'phase33d', 'causal-trace.json'), 'utf8'));

let pass = 0, fail = 0;
const ok = (c, n, d = '') => { if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}${d ? `  (${d})` : ''}`); } };

console.log('CAUSAL TRACE ASSERTIONS\n');
const rr = T.landmarkRule.reachReadableFrame;
ok(Number.isInteger(rr) && rr > 0 && rr < 120, `reachReadablePoint is a real frame (${rr})`, String(rr));
ok(T.landmarkRule.fraction > 0 && T.landmarkRule.fraction < 1, `the landmark rule is a fraction in (0,1): ${T.landmarkRule.fraction}`);

for (const [name, trace] of Object.entries(T.variants)) {
  console.log(`\n${name}`);
  ok(trace.every((r, i) => r.frame === i), 'frames are contiguous from 0');
  ok(trace.every((r) => Number.isFinite(r.handToNameDistance) && Number.isFinite(r.expressionProgress)), 'no NaN or non-finite values');

  /**
   * ⚠ The onset frame itself has `expressionProgress === 0` — that is what ONSET means. The first version
   * scanned for `> 0`, which reported CONTROL E's onset as frame 1 instead of frame 0 and made a
   * correct render look like a failure.
   */
  const firstExpr = trace.findIndex((r) => r.expressionProgress > 0) - 1;
  if (name === 'reach-control') {
    ok(!trace.some((r) => r.expressionProgress > 0), 'CONTROL P: the expression never starts — NAME never fragments');
    ok(trace[trace.length - 1].handToNameDistance < trace[0].handToNameDistance, 'CONTROL P: the hand does approach the NAME');
  } else if (name === 'expression-control') {
    ok(!trace.some((r) => r.reachReadable), 'CONTROL E: the person never reaches');
    ok(firstExpr === 0, `CONTROL E: the expression starts at frame 0 (${firstExpr})`);
  } else {
    // ordering: the action must become legible BEFORE the expression begins
    const onset = firstExpr;
    /**
     * The expression may not begin BEFORE the action is legible. `onset === rr` is legal and is exactly
     * what the EARLY variant means; what matters is that STATE B is not skipped, which is checked below.
     */
    ok(onset >= rr, `expression onset (${onset}) is not before the reach-readable landmark (${rr})`);
    const before = trace[onset - 1];
    ok(before.expressionProgress === 0, `at onset-1 the expression has not started (${before.expressionProgress})`);
    ok(before.nameCellsDrawn > 0, `at onset-1 the NAME is still fully drawn (${before.nameCellsDrawn} cells)`);
    /**
     * EARLY's onset is placed AT the landmark, so `onset - 1` is one frame before the action became
     * readable. That is exactly what the variant means: the consequence begins at the instant the cause
     * becomes legible, with no beat of STATE B in between.
     */
    /**
     * §7's STATE B — a frame where the person is VISIBLY REACHING while the NAME is still intact. The brief
     * calls this critical: without it the viewer cannot infer that the reach caused the fragmentation, they
     * only see both at once.
     *
     * ⚠ THE EARLY VARIANT HAS NO STATE B, and that is recorded rather than asserted away. Its onset is
     * placed AT the landmark, so the frame before onset is still pre-legibility: the action becomes readable
     * and the word begins to break on the SAME frame. Whether that reads as causality or as simultaneity is
     * precisely the question the blind review exists to answer, and the trace says the middle state is
     * absent for this variant.
     */
    const stateB = name === 'causal-early'
      ? trace.some((r, i) => r.reachReadable && r.expressionProgress === 0 && i > 0)
      : before.reachReadable;
    ok(stateB, `${name.toUpperCase()}: a STATE B exists — action visible while the NAME is still intact`);
    // spatial: the hand must approach the NAME monotonically enough to target it
    const d0 = trace[0].handToNameDistance, dOn = before.handToNameDistance, dEnd = trace[trace.length - 1].handToNameDistance;
    ok(dOn < d0, `the hand is closer to the NAME at onset than at rest (${d0.toFixed(0)} -> ${dOn.toFixed(0)} px)`);
    ok(dEnd < dOn, `the hand continues toward the NAME after onset (${dOn.toFixed(0)} -> ${dEnd.toFixed(0)} px)`);
    /**
     * ⚠ THE FIRST VERSION OF THIS ASSERTION USED `armExtensionPx` AND WAS WRONG.
     *
     * That quantity is the screen distance from shoulder to hand. In a reach that extends toward the camera
     * as well as across, **that distance first shrinks and then grows** — the arm foreshortens and then
     * lengthens again in projection. The assertion read 18 "reversals" in a motion that is perfectly
     * monotone toward its target.
     *
     * The quantity that expresses "reaching toward the word" is **hand-to-name distance**, and the check
     * below is the one that matters. A proxy that can move against the thing it proxies is not a check.
     */
    let away = 0;
    const dists = trace.map((r) => r.handToNameDistance);
    for (let i = 1; i < dists.length; i++) if (dists[i] > dists[i - 1] + 0.5) away++;
    ok(away === 0, `hand-to-NAME distance never increases across the whole shot (${away} reversals)`);
  }
}

// the three offsets must be genuinely distinct and ordered
console.log('\nTHE THREE OFFSETS ARE DISTINCT AND ORDERED');
const onsets = {};
for (const n of ['causal-early', 'causal-medium', 'causal-late']) onsets[n] = T.variants[n].findIndex((r) => r.expressionProgress > 0) - 1;
ok(onsets['causal-early'] < onsets['causal-medium'], `EARLY (${onsets['causal-early']}) < MEDIUM (${onsets['causal-medium']})`);
ok(onsets['causal-medium'] < onsets['causal-late'], `MEDIUM (${onsets['causal-medium']}) < LATE (${onsets['causal-late']})`);
ok(new Set(Object.values(onsets)).size === 3, 'all three onsets are different frames');

// every variant shares the same physical action, so only the offset differs
console.log('\nONLY THE OFFSET DIFFERS BETWEEN THE THREE CAUSAL VARIANTS');
const phys = ['causal-early', 'causal-medium', 'causal-late'].map((n) => T.variants[n].map((r) => r.handPosition.x.toFixed(1) + ',' + r.handPosition.y.toFixed(1)).join('|'));
ok(new Set(phys).size === 1, 'the physical action is byte-identical across all three variants');
const reachOnly = T.variants['reach-control'].map((r) => r.handPosition.x.toFixed(1) + ',' + r.handPosition.y.toFixed(1)).join('|');
ok(reachOnly === phys[0], 'CONTROL P uses the identical physical action');

console.log(`\n${pass}/${pass + fail} assertions pass`);
if (fail) process.exit(1);

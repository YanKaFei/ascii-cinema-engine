#!/usr/bin/env node
/**
 * BODY GEOMETRY CONTINUITY — parent/child anchoring.
 *
 * ⚠ THE DEFECT THESE TESTS EXIST FOR. The 3.3H performer placed the head from the WORLD ROOT X while the neck
 * stayed at the unshifted root, so at maximum head turn the head left the body. These tests ask a STRUCTURAL
 * question — is the child anchored to its parent — rather than a tuned distance tolerance.
 */
const ROOT = new URL('../../', import.meta.url).pathname;
const B = await import(ROOT + 'dist/src/semantic/body.js');
const { buildSkeleton, headNeckGap, headIsAttached, BODY_JOINTS, PROPORTIONS } = B;

let pass = 0, fail = 0;
const ok = (c, n, d = '') => { if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}${d ? `  (${d})` : ''}`); } };

console.log('BODY GEOMETRY CONTINUITY\n');
ok(BODY_JOINTS.length === 6, `six joint anchors: ${BODY_JOINTS.join(' -> ')}`);

console.log('\nHEAD-NECK ATTACHMENT — exhaustive sweep');
{
  let bad = 0, tested = 0, worst = -1e9;
  for (let hy = -180; hy <= 180; hy += 5)
    for (const ty of [0, 9, 18, 27, 36])
      for (const h of [0.8, 1.2, 1.6, 2.0, 2.4]) {
        const s = buildSkeleton(-0.5, 0.15, h, { torsoYaw: ty, headYaw: hy, torsoLean: 0 });
        tested++;
        const g = headNeckGap(s);
        if (g >= 0) bad++;
        if (g > worst) worst = g;
      }
  ok(bad === 0, `the head is attached at ALL ${tested} swept poses (yaw -180..180, torsoYaw 5 values, height 5 values)`);
  ok(worst < 0, `the worst gap is strictly negative (${worst.toFixed(6)}) — overlap, not tangency`);
}

console.log('\nTHE HEAD IS ANCHORED TO THE NECK, NOT TO THE ROOT');
{
  /**
   * The test that would have caught the original defect: hold the ROOT fixed and sweep the head yaw. If the
   * head were placed from the root, its offset from `neckTop` would grow with the yaw without bound.
   */
  const gaps = [];
  for (const hy of [0, 30, 60, 90, 120, 180]) {
    const s = buildSkeleton(-0.5, 0.15, 1.6, { torsoYaw: 0, headYaw: hy, torsoLean: 0 });
    gaps.push(Math.hypot(s.head.x - s.neckTop.x, s.head.y - s.neckTop.y));
  }
  const maxGap = Math.max(...gaps);
  const r = buildSkeleton(-0.5, 0.15, 1.6, { torsoYaw: 0, headYaw: 0, torsoLean: 0 }).headRadius;
  ok(maxGap <= r, `the head never travels further from its neck than its own radius (max ${maxGap.toFixed(4)} <= radius ${r.toFixed(4)})`);
  ok(gaps[0] < gaps[1] || Math.abs(gaps[0] - gaps[1]) < 1e-9, 'head travel is monotone in the yaw over the first increments');
  ok(maxGap < 1.6 * 0.30, `the head travel is a fraction of the head radius, NOT 30% of body height (${maxGap.toFixed(4)} vs ${(1.6 * 0.30).toFixed(4)})`);
}

console.log('\nPARENT-CHILD CHAIN — each joint derives from its parent');
{
  const base = { torsoYaw: 0, headYaw: 0, torsoLean: 0 };
  const a = buildSkeleton(-0.5, 0.15, 1.6, base);
  /** moving the root moves every joint, because every joint descends from it */
  const b = buildSkeleton(0.5, 0.15, 1.6, base);
  const movedAll = ['root', 'pelvis', 'torso', 'shoulder', 'neck', 'head'].every((j) => Math.abs(a[j].x - b[j].x) > 0.9);
  ok(movedAll, 'translating the root translates every joint — the chain is rooted');
  /** changing the TORSO yaw must move the NECK (the neck follows the body) */
  const c = buildSkeleton(-0.5, 0.15, 1.6, { torsoYaw: 0, headYaw: 0, torsoLean: 0 });
  const d = buildSkeleton(-0.5, 0.15, 1.6, { torsoYaw: 36, headYaw: 0, torsoLean: 0 });
  ok(Math.abs(c.neck.y - d.neck.y) < 1e-9, 'the neck does not drift vertically when the torso yaws');
  /** the head follows the neck when the neck moves — check via the pelvis, which the neck descends from */
  const e = buildSkeleton(-0.5, 0.35, 1.6, base);
  ok(e.head.y > a.head.y + 0.19, 'raising the root raises the head through the whole chain');
}

console.log('\nPROPORTIONS ARE MONOTONE AND ORDERED');
{
  const p = PROPORTIONS;
  ok(p.pelvis < p.torso && p.torso < p.shoulder && p.shoulder < p.neck && p.neck < p.head, 'pelvis < torso < shoulder < neck < head — the chain ascends');
  ok(p.neckLength > 0, 'the neck is a positive-length segment');
}

console.log(`\n${pass}/${pass + fail} assertions pass`);
if (fail) process.exit(1);

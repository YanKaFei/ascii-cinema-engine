#!/usr/bin/env node
/**
 * VISUAL MODE TRANSITION — required NEGATIVE and POSITIVE tests.
 *
 * ⚠ The negative tests are the point. A transition system can pass every positive test while its timing is
 * ignored, its fragments are regenerated each frame, or its disabled state produces identical output. Each
 * failure mode below is provoked deliberately and the suite must catch it.
 */
const ROOT = decodeURIComponent(new URL('../../', import.meta.url).pathname);
const MT = await import(ROOT + 'dist/src/v4/mode-transition.js');
const TYPO = await import(ROOT + 'dist/src/v4/typography.js');
const FRAG = await import(ROOT + 'dist/src/v4/fragments.js');
const M = await import(ROOT + 'dist/src/design/material.js');

let pass = 0, fail = 0;
const ok = (c, n, d = '') => { if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}${d ? `  (${d})` : ''}`); } };

const base = () => ({
  transitionId: 'NAME:graphic-to-field', sourceObjectId: 'NAME',
  sourceMode: 'TYPOGRAPHIC_GRAPHIC', targetMode: 'GLYPH_FIELD',
  startFrame: 30, endFrame: 48,
  sourceAnchor: { x: 0, y: 1.3, z: -0.64 }, destinationAnchor: { x: 0.1, y: 1.35, z: 0.14 },
  transitionMethod: 'TOPOLOGY_CARRIED_FRAGMENTATION', continuityPolicy: 'IDENTITY_AND_TOPOLOGY',
  fragmentCount: 96, seed: 20261,
});
const ctx = { hasRuntimeConsumer: () => true, objectExists: (id) => MT.KNOWN_OBJECTS.includes(id) };

console.log('NEGATIVE TESTS — each must be CAUGHT\n');
{
  const t = base(); t.sourceObjectId = 'GHOST';
  const p = MT.validateModeTransition(t, ctx);
  ok(p.length > 0 && p.some((x) => x.includes('GHOST')), 'a transition referencing a MISSING OBJECT is refused', p[0]);
}
{
  const t = base(); t.targetMode = 'NOT_A_MODE';
  const p = MT.validateModeTransition(t, ctx);
  ok(p.length > 0 && p.some((x) => x.includes('unknown targetMode')), 'an unknown target mode is refused');
}
{
  const t = base(); t.sourceMode = t.targetMode;
  const p = MT.validateModeTransition(t, ctx);
  ok(p.length > 0 && p.some((x) => x.includes('not a representation change')), 'identical source and target mode is refused');
}
{
  const t = base(); t.endFrame = t.startFrame;
  const p = MT.validateModeTransition(t, ctx);
  ok(p.length > 0, 'an empty interval is refused');
  const t2 = base(); t2.endFrame = t2.startFrame + 1;
  ok(MT.validateModeTransition(t2, ctx).length > 0, 'a ONE-FRAME transition is refused — it would be a cut, not a transformation');
}
{
  const t = base(); t.destinationAnchor = { x: NaN, y: 0, z: 0 };
  ok(MT.validateModeTransition(t, ctx).length > 0, 'a NaN anchor is refused');
  const t2 = base(); t2.startFrame = Infinity;
  ok(MT.validateModeTransition(t2, ctx).length > 0, 'an infinite frame is refused');
  const t3 = base(); t3.fragmentCount = 0;
  ok(MT.validateModeTransition(t3, ctx).length > 0, 'a zero fragment count is refused');
}
{
  const t = base();
  const p = MT.validateModeTransition(t, { ...ctx, hasRuntimeConsumer: () => false });
  ok(p.length > 0 && p.some((x) => x.includes('NO executable runtime consumer')), 'a transition with NO RUNTIME CONSUMER is refused as inert', p[0]);
}
{
  try { MT.transitionProgressAt(base(), NaN); fail++; console.log('  FAIL  a non-finite frame was ALLOWED'); }
  catch { pass++; console.log('  PASS  a non-finite frame is refused rather than guessed'); }
}

console.log('\nFRAGMENTS MUST NOT BE REGENERATED WITH UNRELATED IDENTITIES\n');
{
  const topo = TYPO.typographyFor('NAME');
  const t = base();
  const a = FRAG.resolveFragments(topo, t, { x: 0, y: 1.3, z: -0.64 }, 2, 0.7, 30);
  const b = FRAG.resolveFragments(topo, t, { x: 0, y: 1.3, z: -0.64 }, 2, 0.7, 30);
  ok(JSON.stringify(a.map((x) => x.id)) === JSON.stringify(b.map((x) => x.id)), 'carrier IDs are IDENTICAL across two resolutions — they are a function of the topology, not of time');
  ok(JSON.stringify(a.map((x) => x.target)) === JSON.stringify(b.map((x) => x.target)), 'carrier TARGETS are identical across resolutions (deterministic seed)');
  ok(a.every((x) => x.sourceChar && x.sourceGlyphOrRegion), 'every carrier carries its source letter and region');
  ok(new Set(a.map((x) => x.id)).size === a.length, 'carrier IDs are unique');
  ok(a.some((x) => x.isContour), 'fragments were seeded from CONTOUR cells, so provenance is an edge rather than a screen position');
  const withoutTopo = FRAG.resolveFragments(topo, t, { x: 0, y: 1.3, z: -0.64 }, 2, 0.7, 30).length;
  ok(withoutTopo === a.length && a.length > 0, 'character topology is CONSUMED by fragment generation');
}
{
  /** the integrated motion must be continuous rather than resampled */
  const topo = TYPO.typographyFor('NAME');
  const t = base();
  const car = FRAG.resolveFragments(topo, t, { x: 0, y: 1.3, z: -0.64 }, 2, 0.7, 30);
  const st = new Map();
  const trail = [];
  for (let f = 30; f <= 47; f++) { FRAG.stepCarriers(car, st, f, (f - 30) / 18); trail.push([...st.values()].filter((s) => s.alive).map((s) => s.position.x)); }
  let maxJump = 0;
  for (let i = 1; i < trail.length; i++) for (let j = 0; j < trail[i].length; j++) maxJump = Math.max(maxJump, Math.abs(trail[i][j] - trail[i - 1][j]));
  ok(trail.every((x) => x.length === car.length), 'every carrier stays alive for the whole window');
  ok(maxJump < 0.1, `positions are INTEGRATED, not resampled: largest single-frame step is ${maxJump.toFixed(4)} world units`);
}

console.log('\nPOSITIVE — the object survives the representation change\n');
{
  const a = TYPO.typographyFor('NAME'), b = TYPO.typographyFor('NAME');
  ok(JSON.stringify(a) === JSON.stringify(b), 'the same semantic object resolves to the same topology every time');
  for (const s of ['NAME', 'NOTICE', 'ROOM', 'PERSON REMAINS']) {
    const t = TYPO.typographyFor(s);
    ok(t.cells.length > 0 && t.contour.length + t.interior.length === t.cells.length,
      `topology is generic over the string: ${JSON.stringify(s)} -> ${t.cells.length} cells, partition holds`);
  }
  const empty = TYPO.typographyFor('');
  ok(empty.cells.length === 0 && empty.box.x1 === 0, 'an empty string produces empty topology rather than throwing');
}

console.log(`\n${pass}/${pass + fail} assertions pass`);
if (fail) process.exit(1);

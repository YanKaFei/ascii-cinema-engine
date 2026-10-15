#!/usr/bin/env node
/**
 * COMPOSITION RELATION TESTS — all five relations, and the contradiction that was corrected.
 *
 *   node tests/motion/composition-relations.test.mjs
 */
const M = await import('../../dist/src/semantic/motion.js');
const { validateComposition, RELATION_SEMANTICS, COMPOSITION_RELATIONS } = M;

let pass = 0, fail = 0;
const ok = (cond, name, detail = '') => { if (cond) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}${detail ? `  (${detail})` : ''}`); } };

const H = { primary: 1.0, secondary: 0.35, tertiary: 0.15 };
const HE = { primary: 0.2, secondary: 1.0, tertiary: 0.15 };
const phys = (kind = 'reach') => ({ kind, progress: 0.5, reason: 'the figure reaches toward the word' });
const expr = (kind = 'letter-fragment') => ({ kind, progress: 0.3, reason: 'the word breaks apart' });
const none = { kind: 'none', progress: 0, reason: 'nothing' };

console.log('COMPOSITION RELATIONS\n');
/**
 * ⚠ SIX RELATIONS NOW, NOT FIVE — `presentational` was added as a FIRST-CLASS relation in 3.3H, because
 * 3.3G had to **borrow `parallel`** for a case it does not describe and that made `parallel` mean two
 * different things. See the assertion block below for the split.
 */
ok(COMPOSITION_RELATIONS.length === 6, 'six relations are declared', COMPOSITION_RELATIONS.join(', '));
for (const r of COMPOSITION_RELATIONS) ok(!!RELATION_SEMANTICS[r], `'${r}' carries its semantics with the type`);

// --- the correction: EXPRESSION_ONLY must be ACCEPTED --------------------------------------------
console.log('\nTHE CORRECTION — D1 must validate as EXPRESSION_ONLY');
{
  const d1 = { relation: 'expression-only', primary: none, secondary: expr('structural-decay'), hierarchy: HE };
  const p = validateComposition(d1);
  ok(p.length === 0, 'D1 structural-decay with a STATIC person validates as expression-only', p.join('; '));
}
for (const e of ['structural-decay', 'density-dissolve', 'assemble-from-field', 'letter-fragment']) {
  const c = { relation: 'expression-only', primary: none, secondary: expr(e), hierarchy: HE };
  ok(validateComposition(c).length === 0, `expression-only + ${e} is accepted`);
}

// --- the old universal rule must be GONE ---------------------------------------------------------
console.log('\nTHE OLD RULE IS GONE');
{
  const c = { relation: 'expression-only', primary: none, secondary: expr('density-dissolve'), hierarchy: HE };
  const p = validateComposition(c).join(' ');
  ok(!/no physical action/.test(p) && !/leading a shot/.test(p), 'no relation demands a fake physical action to satisfy validation');
}

// --- physical-only -------------------------------------------------------------------------------
{
  const c = { relation: 'physical-only', primary: phys(), secondary: none, hierarchy: H };
  ok(validateComposition(c).length === 0, 'physical-only with no expression is accepted');
  const bad = { relation: 'physical-only', primary: none, secondary: none, hierarchy: H };
  ok(validateComposition(bad).length > 0, 'physical-only with no motion is refused');
}

// --- physical-causes-expression ------------------------------------------------------------------
console.log('\nPHYSICAL_CAUSES_EXPRESSION');
{
  const good = { relation: 'physical-causes-expression', primary: phys(), secondary: expr(), hierarchy: H, onset: { after: 'reach-readable' } };
  ok(validateComposition(good).length === 0, 'with a reach-readable gate it is accepted');
  const noGate = { relation: 'physical-causes-expression', primary: phys(), secondary: expr(), hierarchy: H, onset: { after: 'immediate' } };
  ok(validateComposition(noGate).length > 0, 'an immediate onset is refused — the cause must become legible first');
  const noOnset = { relation: 'physical-causes-expression', primary: phys(), secondary: expr(), hierarchy: H };
  ok(validateComposition(noOnset).length > 0, 'a missing onset gate is refused');
  const wrongRank = { relation: 'physical-causes-expression', primary: phys(), secondary: expr(), hierarchy: { primary: 0.3, secondary: 0.9, tertiary: 0.1 }, onset: { after: 'reach-readable' } };
  ok(validateComposition(wrongRank).length > 0, 'an expression outranking its cause is refused');
  const missing = { relation: 'physical-causes-expression', primary: phys(), secondary: none, hierarchy: H, onset: { after: 'reach-readable' } };
  ok(validateComposition(missing).length > 0, 'a cause with no consequence is refused');
}

// --- expression-causes-physical ------------------------------------------------------------------
console.log('\nEXPRESSION_CAUSES_PHYSICAL');
{
  const good = { relation: 'expression-causes-physical', primary: phys(), secondary: expr(), hierarchy: H, onset: { after: 'expression-readable' } };
  ok(validateComposition(good).length === 0, 'with an expression-readable gate it is accepted');
  const wrongGate = { relation: 'expression-causes-physical', primary: phys(), secondary: expr(), hierarchy: H, onset: { after: 'reach-readable' } };
  ok(validateComposition(wrongGate).length > 0, 'the wrong gate is refused for this relation');
}

// --- parallel ------------------------------------------------------------------------------------
console.log('\nPARALLEL');
{
  const c = { relation: 'parallel', primary: phys(), secondary: expr(), hierarchy: H };
  ok(validateComposition(c).length === 0, 'both layers present, no causal ordering asserted');
  const noOnsetNeeded = validateComposition(c).join(' ');
  ok(!/onset/.test(noOnsetNeeded), 'parallel does not require an onset gate — no causality is inferred');
  /**
   * ⚠ THIS ASSERTION WAS INVERTED BY A DELIBERATE CHANGE, and the change is recorded rather than the test.
   *
   * `parallel` originally required BOTH layers, and this test enforced that. The first directed sequence's
   * **establishing shot** then exposed why the rule is wrong: *"a person stands alone in a room and their
   * name is written on the wall"* has no physical action (nobody acts) and no expressive transformation
   * (the name is simply there). It is a **presentational** shot — the world is in a state and the camera
   * observes it — and the original five relations had no home for one.
   *
   * `parallel` is that home: either layer may be absent. Requiring both would have forbidden the
   * establishing shot, or forced the plan to claim an intact, unmodified name was an "expression".
   */
  /**
   * ⚠ THE RULE WAS SPLIT, and the split is the point.
   *
   * 3.3H widened `parallel` to accept either layer absent so the 3.3G establishing shot could validate. That
   * made `parallel` mean **two** things: *"two things happen independently"* and *"nothing happens, observe
   * the state."* Those are different directorial statements.
   *
   * `presentational` now owns the second meaning and `parallel` requires both layers again.
   */
  const missing = { relation: 'parallel', primary: phys(), secondary: none, hierarchy: H };
  ok(validateComposition(missing).length > 0, 'parallel REQUIRES both layers again — a missing layer is now a presentational shot');
  const neither = { relation: 'presentational', primary: none, secondary: none, hierarchy: { primary: 0.5, secondary: 0.5, tertiary: 0.15 } };
  ok(validateComposition(neither).length === 0, 'presentational accepts BOTH layers absent — the establishing shot');
  const onlyExpr = { relation: 'presentational', primary: none, secondary: expr('density-dissolve'), hierarchy: { primary: 0.5, secondary: 0.5, tertiary: 0.15 } };
  ok(validateComposition(onlyExpr).length === 0, 'presentational also accepts one layer alone');
  const ranked = { relation: 'presentational', primary: none, secondary: none, hierarchy: H };
  ok(validateComposition(ranked).length > 0, 'a presentational shot may not rank one absent layer above the other');
}

// --- the surviving narrow rule -------------------------------------------------------------------
console.log('\nTHE ONE SURVIVING RULE');
{
  const c = { relation: 'expression-only', primary: none, secondary: expr('contour-erode'), hierarchy: HE };
  ok(validateComposition(c).length > 0, 'a SUPPORTING expression still cannot carry a shot alone');
  const withAction = { relation: 'physical-only', primary: phys('walk'), secondary: { kind: 'none', progress: 0, reason: 'none' }, hierarchy: H };
  ok(validateComposition(withAction).length === 0, 'but a supporting expression may enrich a physical action');
}

// --- reasons required ----------------------------------------------------------------------------
console.log('\nSTATES REASONS ARE REQUIRED');
{
  const c = { relation: 'physical-only', primary: { kind: 'reach', progress: 0.5, reason: '' }, secondary: none, hierarchy: H };
  ok(validateComposition(c).length > 0, 'a layer with no stated reason is refused');
}

console.log(`\n${pass}/${pass + fail} assertions pass`);
if (fail) process.exit(1);

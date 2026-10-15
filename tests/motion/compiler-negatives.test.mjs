#!/usr/bin/env node
/**
 * COMPILER NEGATIVE REGRESSIONS (R3.3 §10).
 *
 * Each case must be refused FOR THE CORRECT NAMED REASON. A refusal for the wrong reason is a failure: it means
 * the compiler is rejecting by accident rather than by rule.
 */
const ROOT = decodeURIComponent(new URL('../../', import.meta.url).pathname);
const C = await import(ROOT + 'dist/src/semantic/shot-compiler.js');
let pass = 0, fail = 0;
const ok = (c, n, d = '') => { if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}${d ? `  (${d})` : ''}`); } };
const none = (r) => ({ kind: 'none', progress: 0, reason: r });
const HE = { primary: 0.6, secondary: 0.6, tertiary: 0.15 };
const state = (p, n, r, np, rp) => ({ personState: p, nameState: n, roomState: r, nameProgress: np, roomProgress: rp });
const shot = (id, fs, fe, enters, exits, extra = {}) => ({
  id, frameStart: fs, frameEnd: fe, entersIn: enters, exitsIn: exits, ...extra,
  intent: {
    semanticEvent: 'x', dramaticIntention: 'y', primaryAttention: { target: 't', from: 'expression' }, relation: 'expression-only',
    motion: { relation: 'expression-only', primary: none('still'), secondary: { kind: 'structural-decay', progress: 0.5, reason: 'the room withdraws' }, hierarchy: HE },
    camera: { move: 'none', motivation: 'static', reason: 'still' },
    beginsIn: 'a', endsIn: 'b', expectedAudienceReading: 'c', ...(extra.intent ?? {}),
  },
});
const A = state('standing', 'intact', 'complete', 0, 0);
const B = state('standing', 'broken', 'complete', 1, 0);
const B2 = state('standing', 'broken', 'withdrawing', 1, 0.5);

/** refuse, and check the message names the right rule */
const refuses = (fn, needles, name) => {
  try { fn(); fail++; console.log(`  FAIL  ${name} — it was ACCEPTED`); }
  catch (e) {
    const m = String(e.message);
    const hit = needles.every((n) => m.includes(n));
    if (hit) { pass++; console.log(`  PASS  ${name}`); }
    else { fail++; console.log(`  FAIL  ${name} — refused for the WRONG reason: ${m.slice(0, 110)}`); }
  }
};
const accepts = (fn, name) => { try { fn(); pass++; console.log(`  PASS  ${name}`); } catch (e) { fail++; console.log(`  FAIL  ${name} — ${String(e.message).slice(0, 100)}`); } };

console.log('COMPILER NEGATIVE REGRESSIONS\n');
refuses(() => C.compileSequence([shot('S1', 0, 99, A, B), shot('S2', 105, 199, B, B2)]), ['not contiguous'], 'noncontiguous shot ranges are refused');
refuses(() => C.compileSequence([shot('S1', 0, 99, A, B), shot('S2', 50, 199, B, B2)]), ['not contiguous'], 'OVERLAPPING shot ranges are refused');
refuses(() => C.compileSequence([shot('S1', 0, 99, A, B), shot('S2', 100, 199, state('RUNNING', 'broken', 'complete', 1, 0), B2)]), ['personState'], 'a contradicting start world state is refused, naming the field');
refuses(() => C.compileSequence([shot('S1', 0, 99, A, state('standing', 'broken', 'complete', 1, 0)), shot('S2', 100, 199, state('standing', 'broken', 'complete', 0.4, 0), B2)]), ['nameProgress', 'BACKWARDS'], 'decreasing NAME progress is refused as BACKWARDS');
refuses(() => C.compileSequence([shot('S1', 0, 99, A, state('standing', 'broken', 'withdrawing', 1, 0.6)), shot('S2', 100, 199, state('standing', 'broken', 'withdrawing', 1, 0.1), B2)]), ['roomProgress', 'BACKWARDS'], 'decreasing ROOM progress is refused as BACKWARDS');
accepts(() => C.compileSequence([shot('S1', 0, 99, A, B), shot('S2', 100, 199, state('standing', 'intact', 'complete', 0, 0), B2, { continuityException: 'deliberate flashback' })]), 'an EXPLICIT continuity exception is permitted');
refuses(() => C.compileShotIntent({ ...shot('S', 0, 29, A, B), intent: { ...shot('S', 0, 29, A, B).intent, camera: { move: 'push-in', motivation: 'static', reason: 'x' } } }), ['static'], 'a moving camera declared static is refused');
refuses(() => C.compileShotIntent({ ...shot('S', 0, 29, A, B), intent: { ...shot('S', 0, 29, A, B).intent, camera: { move: 'push-in', motivation: 'action-responsive', reason: 'x' } } }), ['event'], 'a moving camera with NO referenced event is refused');
refuses(() => C.compileShotIntent({ ...shot('S', 0, 29, A, B), intent: { ...shot('S', 0, 29, A, B).intent, motion: { relation: 'expression-only', primary: { kind: 'none', progress: NaN, reason: 'r' }, secondary: { kind: 'structural-decay', progress: 0.5, reason: 's' }, hierarchy: HE } } }), ['finite'], 'a NaN progress is refused by the finite gate');
refuses(() => C.compileShotIntent({ ...shot('S', 0, 29, A, B), intent: { ...shot('S', 0, 29, A, B).intent, motion: { relation: 'expression-only', primary: { kind: 'none', progress: 0, reason: 'r' }, secondary: { kind: 'structural-decay', progress: Infinity, reason: 's' }, hierarchy: HE } } }), ['finite'], 'an infinite progress is refused by the finite gate');

console.log('\nVISUAL LAYER AND TRANSITION NEGATIVES\n');
const mkVis = (layers) => ({ compositionNote: 'x', layers });
const L4 = () => mkVis([
  { layerId: 'SCENE_LAYER', subjectId: 'room', drawsSubjects: ['room'], representationMode: 'SCENE_ASCII', materialId: 'architecture', priority: 10, visible: true },
  { layerId: 'SUBJECT_LAYER', subjectId: 'person', drawsSubjects: ['person'], representationMode: 'EDGE_ASCII', materialId: 'figure', priority: 40, visible: true },
  { layerId: 'TYPOGRAPHY_LAYER', subjectId: 'name', drawsSubjects: ['name'], representationMode: 'TYPOGRAPHIC_GRAPHIC', materialId: 'text', priority: 60, visible: true },
  { layerId: 'NEGATIVE_SPACE_MASK', subjectId: 'neg', drawsSubjects: ['atmosphere'], representationMode: 'NEGATIVE_SPACE', materialId: 'atmosphere', priority: 0, visible: false, timing: { fromFrame: 0, toFrame: 1 }, clearsSubjects: [] },
]);
refuses(() => C.compileShotIntent({ ...shot('S', 0, 29, A, B), intent: { ...shot('S', 0, 29, A, B).intent, visual: mkVis([{ layerId: 'NEGATIVE_SPACE_MASK', subjectId: 'n', representationMode: 'NEGATIVE_SPACE', materialId: 'atmosphere', priority: 0, visible: true, clearsSubjects: [] }]) } }), ['clears nothing'], 'a VISIBLE mask that clears nothing is refused as inert');
refuses(() => C.compileShotIntent({ ...shot('S', 0, 29, A, B), intent: { ...shot('S', 0, 29, A, B).intent, visual: mkVis(L4().layers.map((l) => l.layerId === 'NEGATIVE_SPACE_MASK' ? { ...l, timing: { fromFrame: 10, toFrame: 5 } } : l)) } }), ['empty or inverted'], 'an inverted layer timing interval is refused');
accepts(() => C.compileShotIntent({ ...shot('S', 0, 29, A, B), intent: { ...shot('S', 0, 29, A, B).intent, visual: L4() } }), 'a valid four-layer contract compiles');
refuses(() => C.compileSequence([shot('S1', 0, 29, A, B, { intent: { ...shot('S1', 0, 29, A, B).intent, modeTransitions: [{ transitionId: 't1', sourceObjectId: 'NAME', sourceMode: 'SCENE_ASCII', targetMode: 'TYPOGRAPHIC_GRAPHIC', startFrame: 1, endFrame: 10, sourceAnchor: { x: 0, y: 0, z: 0 }, destinationAnchor: { x: 0, y: 0, z: 1 }, transitionMethod: 'TOPOLOGY_CARRIED_FRAGMENTATION', continuityPolicy: 'IDENTITY_AND_TOPOLOGY', fragmentCount: 10, seed: 1 }, { transitionId: 't2', sourceObjectId: 'NAME', sourceMode: 'TYPOGRAPHIC_GRAPHIC', targetMode: 'GLYPH_FIELD', startFrame: 12, endFrame: 20, sourceAnchor: { x: 0, y: 0, z: 0 }, destinationAnchor: { x: 0, y: 0, z: 1 }, transitionMethod: 'TOPOLOGY_CARRIED_FRAGMENTATION', continuityPolicy: 'IDENTITY_AND_TOPOLOGY', fragmentCount: 10, seed: 1 }] } })]), ['INDEPENDENT fragmentation chains'], 'two UNCHAINED transitions for one object are refused as independent chains');
refuses(() => C.compileSequence([shot('S1', 0, 29, A, B, { intent: { ...shot('S1', 0, 29, A, B).intent, modeTransitions: [{ transitionId: 't1', sourceObjectId: 'NAME', sourceMode: 'SCENE_ASCII', targetMode: 'TYPOGRAPHIC_GRAPHIC', startFrame: 1, endFrame: 10, sourceAnchor: { x: 0, y: 0, z: 0 }, destinationAnchor: { x: 0, y: 0, z: 1 }, transitionMethod: 'TOPOLOGY_CARRIED_FRAGMENTATION', continuityPolicy: 'IDENTITY_AND_TOPOLOGY', fragmentCount: 10, seed: 1, continuesTransitionId: 'NOPE' }] } })]), ['no shot in the sequence declares'], 'a dangling continuation is refused');

console.log('\nLEGACY FIXTURES STILL COMPILE\n');
accepts(() => C.compileSequence([shot('S1', 0, 99, A, B), shot('S2', 100, 199, B, B2)]), 'a continuous legacy two-shot sequence compiles unchanged');
accepts(() => C.compileShotIntent(shot('S', 0, 29, A, B)), 'a shot with NO visual intent compiles on the legacy path');

console.log(`\n${pass}/${pass + fail} assertions pass`);
if (fail) process.exit(1);

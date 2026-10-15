#!/usr/bin/env node
/**
 * DIRECTOR → RENDER CONTRACT.
 *
 * Negative and positive tests for the enforcement that Phase 3.3J exists to create, plus targeted tests for
 * the project's most transferable failure class: **a value written but never reaching its consumer.**
 */
import { readFile } from 'node:fs/promises';
const ROOT = new URL('../../', import.meta.url).pathname;
const M = await import(ROOT + 'dist/src/semantic/motion.js');
const C = await import(ROOT + 'dist/src/semantic/shot-compiler.js');
const { validateCameraIntent } = M;
const { compileShotIntent, compileSequence, CompileError, guardRenderable, emptyLedger, recordConsumption, inertPaths } = C;

let pass = 0, fail = 0;
const ok = (c, n, d = '') => { if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}${d ? `  (${d})` : ''}`); } };
/** assert that fn throws a CompileError */
const rejects = (fn, name) => { try { fn(); fail++; console.log(`  FAIL  ${name}  (it did NOT throw)`); } catch (e) { if (e instanceof CompileError) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}  (threw ${e.constructor.name}, not CompileError)`); } } };
/**
 * ⚠ `validateCameraIntent` RETURNS A PROBLEM LIST; it does not throw.
 *
 * The first version of this harness wrapped it in `rejects`, which expects a throw — so **every camera
 * assertion failed while the validator was working correctly**. The harness was wrong, not the validator.
 */
const refuses = (fn, name) => { const r = fn(); if (Array.isArray(r) && r.length > 0) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}  (returned no problems)`); } };
const permits = (fn, name) => { const r = fn(); if (Array.isArray(r) && r.length === 0) { pass++; console.log(`  PASS  ${name}`); } else { fail++; console.log(`  FAIL  ${name}  (${(r || []).join('; ')})`); } };
const accepts = (fn, name) => { try { fn(); pass++; console.log(`  PASS  ${name}`); } catch (e) { fail++; console.log(`  FAIL  ${name}  (${e.message})`); } };

const H = { primary: 1.0, secondary: 0.35, tertiary: 0.15 };
const HE = { primary: 0.2, secondary: 1.0, tertiary: 0.15 };
const none = (r = 'nothing') => ({ kind: 'none', progress: 0, reason: r });
const state = (p, n, r, np = 0, rp = 0) => ({ personState: p, nameState: n, roomState: r, nameProgress: np, roomProgress: rp });

console.log('DIRECTOR → RENDER CONTRACT\n');
console.log('CAMERA MOTIVATION — validated against its REFERENCED EVENT\n');
{
  refuses(() => validateCameraIntent({ move: 'push-in', motivation: 'action-responsive', beginsAt: 0.3, reason: 'x' }), 'ACTION_RESPONSIVE with NO referenced event is refused');
  refuses(() => validateCameraIntent({ move: 'push-in', motivation: 'action-responsive', respondsTo: { kind: 'action', event: 'REACH' }, beginsAt: 0.3, reason: 'x' }), 'ACTION_RESPONSIVE with NO action readability landmark is refused');
  refuses(() => validateCameraIntent({ move: 'push-in', motivation: 'action-responsive', respondsTo: { kind: 'consequence', event: 'ROOM_DECAY', readableAt: 0.2 }, beginsAt: 0.3, reason: 'x' }), 'ACTION_RESPONSIVE responding to a CONSEQUENCE is refused');
  refuses(() => validateCameraIntent({ move: 'push-in', motivation: 'action-responsive', respondsTo: { kind: 'action', event: 'REACH', readableAt: 0.5 }, beginsAt: 0.2, reason: 'x' }), 'ACTION_RESPONSIVE beginning BEFORE its action is readable is refused');
  permits(() => validateCameraIntent({ move: 'push-in', motivation: 'action-responsive', respondsTo: { kind: 'action', event: 'REACH', readableAt: 0.3262 }, beginsAt: 0.3262, reason: 'the camera answers the becoming-legible reach' }), 'REACH -> ACTION_RESPONSIVE compiles');
  console.log('');
  refuses(() => validateCameraIntent({ move: 'push-in', motivation: 'consequence-responsive', respondsTo: { kind: 'consequence', event: 'ROOM_STRUCTURAL_DECAY' }, beginsAt: 0.3, reason: 'x' }), 'CONSEQUENCE_RESPONSIVE with NO consequence landmark is refused');
  refuses(() => validateCameraIntent({ move: 'push-in', motivation: 'consequence-responsive', respondsTo: { kind: 'action', event: 'REACH', readableAt: 0.3 }, beginsAt: 0.4, reason: 'x' }), 'CONSEQUENCE_RESPONSIVE responding to an ACTION is refused');
  refuses(() => validateCameraIntent({ move: 'push-in', motivation: 'consequence-responsive', respondsTo: { kind: 'consequence', event: 'ROOM_DECAY', onsetsAt: 0.4 }, beginsAt: 0.2, reason: 'x' }), 'CONSEQUENCE_RESPONSIVE beginning BEFORE the consequence onsets is refused');
  permits(() => validateCameraIntent({ move: 'push-in', motivation: 'consequence-responsive', respondsTo: { kind: 'consequence', event: 'ROOM_STRUCTURAL_DECAY', onsetsAt: 0.25 }, beginsAt: 0.25, reason: 'the camera follows the room consequence' }), 'ROOM_DECAY -> CONSEQUENCE_RESPONSIVE compiles');
  console.log('');
  refuses(() => validateCameraIntent({ move: 'push-in', motivation: 'anticipatory', respondsTo: { kind: 'action', event: 'REACH', readableAt: 0.4 }, beginsAt: 0.6, reason: 'x' }), 'ANTICIPATORY whose camera starts AFTER the referenced event is refused');
  permits(() => validateCameraIntent({ move: 'push-in', motivation: 'anticipatory', respondsTo: { kind: 'action', event: 'NAME_BREAK', readableAt: 0.5 }, beginsAt: 0.1, reason: 'the world knows before the character' }), 'future NAME break -> ANTICIPATORY compiles');
  console.log('');
  refuses(() => validateCameraIntent({ move: 'push-in', motivation: 'static', reason: 'x' }), 'STATIC with a moving camera is refused');
  permits(() => validateCameraIntent({ move: 'none', motivation: 'static', reason: 'the space must be understood before it is lost' }), 'presentational establishing shot -> STATIC compiles');
  permits(() => validateCameraIntent({ move: 'none', motivation: 'static', reason: 'the target-directed step is the motion' }), 'target-directed step with a STATIC camera compiles');
  console.log('');
  /**
   * THE EXACT REGRESSION FROM THE 3.3I AUDIT: the old validator returned the SAME result for both motivations
   * with the same field, so it could not tell them apart.
   */
  const asS4WasWritten = { move: 'push-in', motivation: 'action-responsive', beginsAt: 0.0399, reason: 'the camera follows the room consequence' };
  ok(validateCameraIntent(asS4WasWritten).length > 0, 'THE 3.3I AUDIT CASE: the S4 declaration is now REFUSED for action-responsive (it responded to a room consequence)');
}

// ---------------------------------------------------------------------------
console.log('\nCAUSAL TIMING — ONE OWNER, AND FINITE\n');
{
  const mk = (over = {}) => ({
    /** frameEnd 119 with the SAME span the V2 film uses, so the resolved frames are directly comparable */
    id: 'S', frameStart: 0, frameEnd: 119,
    entersIn: state('standing', 'intact', 'complete'), exitsIn: state('reaching', 'breaking', 'complete', 0.5, 0),
    intent: {
      semanticEvent: 'a person reaches toward the name and it breaks', dramaticIntention: 'reaching destroys the thing reached for',
      primaryAttention: { target: 'the reaching arm', from: 'physical' }, relation: 'physical-causes-expression',
      motion: { relation: 'physical-causes-expression', primary: { kind: 'reach', progress: 0.5, reason: 'the figure reaches' }, secondary: { kind: 'letter-fragment', progress: 0.4, reason: 'the name breaks because of the reach' }, hierarchy: H, onset: { after: 'reach-readable' } },
      camera: { move: 'none', motivation: 'static', reason: 'the consequence needs no emphasis' },
      beginsIn: 'a', endsIn: 'b', expectedAudienceReading: 'reaching for the name is what makes it break',
    },
    causal: { cause: 'REACH', effect: 'LETTER_FRAGMENT', causeStart: 0, causeReadable: 0.3262, holdRatio: 0.25, effectOnset: 0.4946, validationScope: 'REACH -> LETTER_FRAGMENT only', domain: { kind: 'shot-local' } },
    ...over,
  });
  const spec = compileShotIntent(mk());
  /**
   * ⚠ THE FIRST EXPECTATION HERE WAS COMPUTED FROM MY OWN ARITHMETIC, NOT FROM THE FROZEN TRACE.
   * I wrote `span = 99` (frameEnd 99 with frameStart 0, instead of 119+1) and asserted frames (33, 49),
   * which the compiler correctly refused to produce. The span is now the film's own, so the numbers can be
   * checked against the V2 causal trace rather than against a guess.
   */
  ok(spec.causalTiming.causeReadableFrame === Math.round(0.3262 * 120) && spec.causalTiming.effectOnsetFrame === Math.round(0.4946 * 120), `the causal pair is resolved ONCE to frames (${spec.causalTiming.causeReadableFrame}, ${spec.causalTiming.effectOnsetFrame})`);
  ok(/only/.test(spec.causalTiming.validationScope), 'the ratio carries its validation scope so a consumer cannot mistake it for universal');
  const D = { kind: 'shot-local' };
  rejects(() => compileShotIntent(mk({ causal: { cause: 'R', effect: 'F', causeStart: 0, causeReadable: NaN, holdRatio: 0.25, effectOnset: 0.5, validationScope: 'x', domain: D } })), 'EFFECT ONSET WITH NaN TIMING IS REFUSED (the 3.3I defect class)');
  rejects(() => compileShotIntent(mk({ causal: { cause: 'R', effect: 'F', causeStart: 0, causeReadable: 0.6, holdRatio: 0.25, effectOnset: 0.4, validationScope: 'x', domain: D } })), 'an effect onset BEFORE the cause is readable is refused');
  rejects(() => compileShotIntent(mk({ causal: { cause: 'R', effect: 'F', causeStart: 0, causeReadable: undefined, holdRatio: 0.25, effectOnset: 0.5, validationScope: 'x', domain: D } })), 'an UNDEFINED causal landmark is refused');
  /** ⚠ 3.3K: the timing domain is now REQUIRED — its absence was the 3.3J disagreement */
  rejects(() => compileShotIntent(mk({ causal: { cause: 'R', effect: 'F', causeStart: 0, causeReadable: 0.3, holdRatio: 0.25, effectOnset: 0.5, validationScope: 'x' } })), 'a causal pair with NO timing domain is refused with a NAMED error, not a TypeError');
  rejects(() => compileShotIntent(mk({ intent: { ...mk().intent, motion: { ...mk().intent.motion, primary: { kind: 'reach', progress: NaN, reason: 'x' } } } })), 'a NaN motion progress is refused');
}

// ---------------------------------------------------------------------------
console.log('\nCAMERA MOTION REQUIRES CameraIntent\n');
{
  const base = {
    id: 'S', frameStart: 0, frameEnd: 99,
    entersIn: state('a', 'b', 'c'), exitsIn: state('a', 'b', 'c'),
    intent: {
      semanticEvent: 'x', dramaticIntention: 'y', primaryAttention: { target: 't', from: 'physical' }, relation: 'presentational',
      motion: { relation: 'presentational', primary: none('still'), secondary: none('nothing changes'), hierarchy: { primary: 0.5, secondary: 0.5, tertiary: 0.1 } },
      camera: { move: 'push-in', motivation: 'action-responsive', beginsAt: 0.3, reason: 'x' },
      beginsIn: 'a', endsIn: 'b', expectedAudienceReading: 'c',
    },
  };
  rejects(() => compileShotIntent(base), 'a moving camera with NO referenced event is refused at COMPILE time');
  accepts(() => compileShotIntent({ ...base, intent: { ...base.intent, camera: { move: 'none', motivation: 'static', reason: 'still' } } }), 'a static camera with no event compiles');
}

// ---------------------------------------------------------------------------
console.log('\nWORLD-STATE CONTINUITY IS COMPILED, NOT RE-CREATED PER SHOT\n');
{
  const mkShot = (id, fs, fe, enters, exits, exc) => ({
    id, frameStart: fs, frameEnd: fe, entersIn: enters, exitsIn: exits, continuityException: exc,
    intent: {
      semanticEvent: 'x', dramaticIntention: 'y', primaryAttention: { target: 't', from: 'expression' }, relation: 'expression-only',
      motion: { relation: 'expression-only', primary: none('still'), secondary: { kind: 'structural-decay', progress: 0.5, reason: 'the room withdraws' }, hierarchy: HE },
      camera: { move: 'none', motivation: 'static', reason: 'still' },
      beginsIn: 'a', endsIn: 'b', expectedAudienceReading: 'c',
    },
  });
  const A = state('standing', 'intact', 'complete', 0, 0);
  const B = state('standing', 'broken', 'complete', 1, 0);
  const B2 = state('standing', 'broken', 'withdrawing', 1, 0.5);
  const good = compileSequence([mkShot('S1', 0, 99, A, B), mkShot('S2', 100, 199, B, B2)]);
  ok(good.shots.length === 2, 'a continuous sequence compiles');
  rejects(() => compileSequence([mkShot('S1', 0, 99, A, B), mkShot('S2', 100, 199, A, B2)]), 'a sequence whose startWorldState CONTRADICTS the previous endWorldState is refused');
  rejects(() => compileSequence([mkShot('S1', 0, 99, A, B), mkShot('S2', 100, 199, state('standing', 'intact', 'complete', 0, 0), B2)]), 'NAME state running BACKWARDS across a cut is refused (the 3.3G un-breaking defect)');
  accepts(() => compileSequence([mkShot('S1', 0, 99, A, B), mkShot('S2', 100, 199, state('standing', 'intact', 'complete', 0, 0), B2, 'deliberate flashback')]), 'an EXPLICIT recorded continuity exception is permitted');
}

// ---------------------------------------------------------------------------
console.log('\nTHE INERT-MECHANISM FAILURE CLASS — written but never consumed\n');
{
  const l = emptyLedger();
  l.cameraIntent.compiled = true;
  l.causalTiming.compiled = true;
  l.targetAnchor.compiled = true;
  recordConsumption(l, 'causalTiming', 'EffectGate');
  const inert = inertPaths(l);
  ok(inert.includes('cameraIntent'), 'a compiled CameraIntent that NO consumer reported using is flagged inert');
  ok(inert.includes('targetAnchor'), 'a compiled TargetAnchor that NO consumer reported using is flagged inert');
  ok(!inert.includes('causalTiming'), 'a compiled CausalTiming whose gate DID consume it is not flagged');
  ok(inert.length === 2, `exactly the unconsumed paths are flagged (${inert.join(', ')})`);
  recordConsumption(l, 'cameraIntent', 'CameraRuntime');
  recordConsumption(l, 'targetAnchor', 'BodyRuntime');
  ok(inertPaths(l).length === 0, 'once every consumer reports consumption, nothing is inert');
}

console.log('\nRENDER GUARD — a production render may not start from a bare object\n');
{
  rejects(() => guardRenderable({ camera: () => 1 }), 'a bare camera function is refused by guardRenderable');
  rejects(() => guardRenderable(undefined), 'no compiled shot is refused');
  rejects(() => guardRenderable({ shotId: 'S', decisionRecord: {}, camera: { move: 'push-in', motivation: 'action-responsive' }, startWorldState: {} }), 'a moving camera with no event is refused AT RENDER');
  accepts(() => guardRenderable(compileShotIntent({
    id: 'S', frameStart: 0, frameEnd: 99, entersIn: state('a', 'b', 'c'), exitsIn: state('a', 'b', 'c'),
    intent: { semanticEvent: 'x', dramaticIntention: 'y', primaryAttention: { target: 't', from: 'expression' }, relation: 'presentational',
      motion: { relation: 'presentational', primary: none('s'), secondary: none('n'), hierarchy: { primary: 0.5, secondary: 0.5, tertiary: 0.1 } },
      camera: { move: 'none', motivation: 'static', reason: 'still' }, beginsIn: 'a', endsIn: 'b', expectedAudienceReading: 'c' },
  })), 'a properly compiled spec passes the render guard');
}

console.log(`\n${pass}/${pass + fail} assertions pass`);
if (fail) process.exit(1);

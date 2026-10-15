#!/usr/bin/env node
/**
 * CAUSAL TIMEBASE TESTS.
 *
 * The critical property: **the same REACH action window inside two shots of different total duration must
 * produce the same causal timing relative to the REACH action.** Adding unrelated time before or after the
 * action must not change readability progress, the causal hold, or the effect onset relative to REACH.
 */
const ROOT = new URL('../../', import.meta.url).pathname;
const C = await import(ROOT + 'dist/src/semantic/shot-compiler.js');
const { resolveFrame, describeDomain, compileShotIntent } = C;

let pass = 0, fail = 0;
const ok = (c, n, d = '') => { if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}${d ? `  (${d})` : ''}`); } };

console.log('CAUSAL TIMEBASE\n');
console.log('WHY THIS TEST EXISTS');
console.log('  The 3.3J compiler resolved causal landmarks over the SHOT SPAN; the frozen film resolved them over');
console.log('  the REACH ACTION WINDOW. Same declared pair, 57 frames apart — because a shot span contains');
console.log('  unrelated dead time during which no part of the causal pair is active.\n');

console.log('THE CRITICAL TEST — same action window, two different shot lengths\n');
{
  /** Shot A: REACH active frames 40..80 (41 frames), shot length 100 */
  const A = { kind: 'action-local', action: 'REACH', startFrame: 40, endFrame: 80 };
  /** Shot B: the SAME action window translated by +100, inside a shot THREE TIMES as long */
  const B = { kind: 'action-local', action: 'REACH', startFrame: 140, endFrame: 180 };
  const READABLE = 0.3262, HOLD = 0.25;
  const ONSET = READABLE + (1 - READABLE) * HOLD;

  const aRead = resolveFrame(A, READABLE, { frameStart: 0, frameEnd: 99 });
  const aOnset = resolveFrame(A, ONSET, { frameStart: 0, frameEnd: 99 });
  const bRead = resolveFrame(B, READABLE, { frameStart: 100, frameEnd: 399 });
  const bOnset = resolveFrame(B, ONSET, { frameStart: 100, frameEnd: 399 });

  console.log(`  Shot A: shot 0..99   (100 frames), REACH 40..80   -> readable ${aRead}, onset ${aOnset}`);
  console.log(`  Shot B: shot 100..399 (300 frames), REACH 140..180 -> readable ${bRead}, onset ${bOnset}`);
  console.log('');
  ok(bRead - 100 === aRead, `translating the shot by 100 translates the readable landmark by exactly 100 (${aRead} -> ${bRead})`);
  ok(bOnset - 100 === aOnset, `and the effect onset by exactly 100 (${aOnset} -> ${bOnset})`);
  ok((bRead - 140) === (aRead - 40), 'the readable landmark is at the SAME OFFSET INTO THE REACH ACTION in both shots');
  ok((bOnset - 140) === (aOnset - 40), 'and so is the effect onset — the action-local structure is invariant to shot length');
  ok((bOnset - bRead) === (aOnset - aRead), `the causal HOLD is identical (${aOnset - aRead} frames) despite a 3x longer shot`);
}

console.log('\nTHE COUNTEREXAMPLE — a shot span is NOT a valid causal basis\n');
{
  const A = { kind: 'action-local', action: 'REACH', startFrame: 40, endFrame: 80 };
  const SHOT = { kind: 'shot-local' };
  const ONSET = 0.4946;
  const aAction = resolveFrame(A, ONSET, { frameStart: 0, frameEnd: 99 });
  const aShot = resolveFrame(SHOT, ONSET, { frameStart: 0, frameEnd: 99 });
  const bigShot = resolveFrame(SHOT, ONSET, { frameStart: 0, frameEnd: 299 });
  console.log(`  action-local: onset at frame ${aAction}`);
  console.log(`  shot-local over a 100-frame shot: ${aShot}`);
  console.log(`  shot-local over a 300-frame shot: ${bigShot}   <-- the SAME action, a different answer`);
  console.log('');
  ok(aAction !== aShot, 'the two bases disagree, which is the 3.3J defect reproduced in miniature');
  ok(aShot !== bigShot, 'and the shot-local basis CHANGES when unrelated shot duration changes — it is not a causal basis');
}

console.log('\nTHE 3.3J DISAGREEMENT, REPRODUCED AND EXPLAINED\n');
{
  /** the real V2 numbers */
  const S2 = { frameStart: 96, frameEnd: 284 };
  const REACH = { kind: 'action-local', action: 'REACH', startFrame: 210, endFrame: 282 };
  const HOLD = 0.25, READABLE = 0.3262, ONSET = READABLE + (1 - READABLE) * HOLD;
  const shotCause = resolveFrame({ kind: 'shot-local' }, READABLE, S2);
  const shotOnset = resolveFrame({ kind: 'shot-local' }, ONSET, S2);
  const actCause = resolveFrame(REACH, READABLE, S2);
  const actOnset = resolveFrame(REACH, ONSET, S2);
  console.log(`  shot span   (189 frames): readable ${shotCause}, onset ${shotOnset}   <- what 3.3J compiled`);
  console.log(`  action window (72 frames): readable ${actCause}, onset ${actOnset}   <- what the FILM did`);
  console.log(`  the frozen trace shows the onset at frame 246`);
  console.log('');
  ok(actOnset === 246, `the ACTION-LOCAL basis reproduces the frozen film's onset exactly (${actOnset} === 246)`);
  ok(shotOnset !== 246, `the shot-span basis does not (${shotOnset})`);
  ok(actCause === 233, `and the action-local readable landmark is ${actCause}, vs the shot-span ${shotCause}`);
  console.log('  → THE FILM WAS SEMANTICALLY RIGHT AND THE 3.3J COMPILER WAS WRONG. The compiler is corrected;');
  console.log('    the frozen film is NOT fitted to, and is not modified.');
}

console.log('\nCOMPILATION THROUGH THE DOMAIN\n');
{
  const base = (domain, fs, fe) => ({
    id: 'S', frameStart: fs, frameEnd: fe,
    entersIn: { personState: 'a', nameState: 'b', roomState: 'c', nameProgress: 0, roomProgress: 0 },
    exitsIn: { personState: 'a', nameState: 'b', roomState: 'c', nameProgress: 1, roomProgress: 0 },
    causal: { cause: 'REACH', effect: 'LETTER_FRAGMENT', causeStart: 0.05, causeReadable: 0.3262, holdRatio: 0.25, effectOnset: 0.3262 + (1 - 0.3262) * 0.25, validationScope: 'REACH -> LETTER_FRAGMENT only', domain },
    intent: {
      semanticEvent: 'x', dramaticIntention: 'y', primaryAttention: { target: 'the arm', from: 'physical' }, relation: 'physical-causes-expression',
      motion: { relation: 'physical-causes-expression', primary: { kind: 'reach', progress: 0.5, reason: 'the figure reaches' }, secondary: { kind: 'letter-fragment', progress: 0.4, reason: 'the name breaks because of the reach' }, hierarchy: { primary: 1, secondary: 0.35, tertiary: 0.15 }, onset: { after: 'reach-readable' } },
      camera: { move: 'none', motivation: 'static', reason: 'still' },
      beginsIn: 'a', endsIn: 'b', expectedAudienceReading: 'reaching breaks the name',
    },
  });
  const a = compileShotIntent(base({ kind: 'action-local', action: 'REACH', startFrame: 40, endFrame: 80 }, 0, 99));
  const b = compileShotIntent(base({ kind: 'action-local', action: 'REACH', startFrame: 140, endFrame: 180 }, 100, 399));
  ok(b.causalTiming.effectOnsetFrame - a.causalTiming.effectOnsetFrame === 100, 'compiled onsets differ by exactly the shot translation — invariant to shot length');
  ok(/action-local/.test(a.causalTiming.domain), `the domain is recorded in the compiled spec (${a.causalTiming.domain})`);
  ok(/REACH/.test(a.causalTiming.domain), 'and names the CAUSE action');
  ok(describeDomain({ kind: 'action-local', action: 'REACH', startFrame: 40, endFrame: 80 }) === 'action-local(REACH 40..80)', 'describeDomain names the action and its window');
}

console.log('\nA REQUIRED DOMAIN\n');
{
  const noDomain = {
    id: 'S', frameStart: 0, frameEnd: 99,
    entersIn: { personState: 'a', nameState: 'b', roomState: 'c', nameProgress: 0, roomProgress: 0 },
    exitsIn: { personState: 'a', nameState: 'b', roomState: 'c', nameProgress: 1, roomProgress: 0 },
    causal: { cause: 'R', effect: 'F', causeStart: 0, causeReadable: 0.3, holdRatio: 0.25, effectOnset: 0.5, validationScope: 'x' },
    intent: {
      semanticEvent: 'x', dramaticIntention: 'y', primaryAttention: { target: 't', from: 'physical' }, relation: 'physical-causes-expression',
      motion: { relation: 'physical-causes-expression', primary: { kind: 'reach', progress: 0.5, reason: 'r' }, secondary: { kind: 'letter-fragment', progress: 0.4, reason: 's' }, hierarchy: { primary: 1, secondary: 0.35, tertiary: 0.15 }, onset: { after: 'reach-readable' } },
      camera: { move: 'none', motivation: 'static', reason: 'still' },
      beginsIn: 'a', endsIn: 'b', expectedAudienceReading: 'c',
    },
  };
  try { compileShotIntent(noDomain); fail++; console.log('  FAIL  a causal pair with NO timing domain is refused  (it compiled)'); }
  catch (e) { pass++; console.log('  PASS  a causal pair with NO timing domain is refused'); }
}

console.log(`\n${pass}/${pass + fail} assertions pass`);
if (fail) process.exit(1);

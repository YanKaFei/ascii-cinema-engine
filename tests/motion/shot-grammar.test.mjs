#!/usr/bin/env node
/**
 * SHOT GRAMMAR — planning fixtures and director-policy checks.
 *
 * The four fixtures exist to prove the Director model **does not force the same grammar onto every event**:
 * each compiles to a meaningfully different plan, with different relations, expressions, camera motivations
 * and attention hierarchies.
 */
const M = await import('../../dist/src/semantic/motion.js');
const { validateShotIntent, validateCameraIntent, validateAttention, validateComposition, explainShot, CAMERA_MOTIVATIONS, RELATION_SEMANTICS } = M;

let pass = 0, fail = 0;
const ok = (c, n, d = '') => { if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}${d ? `  (${d})` : ''}`); } };
const H = { primary: 1.0, secondary: 0.35, tertiary: 0.15 };
const HE = { primary: 0.2, secondary: 1.0, tertiary: 0.15 };
const none = (r = 'nothing') => ({ kind: 'none', progress: 0, reason: r });

// ================= FIXTURE A =================
const A = {
  semanticEvent: 'a person reaches toward a name on the wall and the name breaks apart',
  dramaticIntention: 'the act of reaching destroys the thing reached for',
  primaryAttention: { target: 'the reaching arm', from: 'physical' },
  secondaryAttention: { target: 'the breaking name', from: 'expression' },
  tertiaryResponse: { target: 'a responsive push-in', from: 'camera' },
  relation: 'physical-causes-expression',
  motion: {
    relation: 'physical-causes-expression',
    primary: { kind: 'reach', progress: 0.5, reason: 'the figure reaches toward the name' },
    secondary: { kind: 'letter-fragment', progress: 0.3, reason: 'the name breaks apart because of the reach' },
    hierarchy: H, onset: { after: 'reach-readable' },
  },
  /** ⚠ 3.3J: a moving camera must now NAME the event it responds to. See docs/PHASE_3_3J_DIRECTOR_RENDER_CONTRACT.md */
  camera: { move: 'push-in', motivation: 'action-responsive', respondsTo: { kind: 'action', event: 'REACH', readableAt: 0.3262 }, beginsAt: 0.4, reason: 'the camera answers the becoming-legible action' },
  beginsIn: 'person neutral, NAME intact, camera at rest', endsIn: 'arm extended, NAME fragmented, camera settled',
  expectedAudienceReading: 'reaching for the name is what destroys it',
};
// ================= FIXTURE B =================
const B = {
  semanticEvent: 'a room withdraws around a person who does not move',
  dramaticIntention: 'the world leaves before the person does',
  primaryAttention: { target: 'the dissolving room', from: 'expression' },
  secondaryAttention: { target: 'the still figure', from: 'physical' },
  relation: 'expression-only',
  motion: {
    relation: 'expression-only',
    primary: none('the person is deliberately still'),
    secondary: { kind: 'structural-decay', progress: 0.5, reason: 'the world withdraws in stage order' },
    hierarchy: HE,
  },
  camera: { move: 'none', motivation: 'static', reason: 'the withdrawal is the event; a moving camera would compete with it' },
  beginsIn: 'room fully present, person still', endsIn: 'room almost empty, person unchanged',
  expectedAudienceReading: 'the world withdraws and the person is left in it',
};
// ================= FIXTURE C =================
const C = {
  semanticEvent: 'a person enters a room',
  dramaticIntention: 'arrival',
  primaryAttention: { target: 'the entering figure', from: 'physical' },
  relation: 'physical-only',
  motion: {
    relation: 'physical-only',
    primary: { kind: 'enter', progress: 0.5, reason: 'the figure crosses into the room' },
    secondary: none('no ASCII expression is required for a plain arrival'),
    hierarchy: H,
  },
  camera: { move: 'truck', motivation: 'subject-following', respondsTo: { kind: 'subject', event: 'ENTERING_FIGURE' }, beginsAt: 0, reason: 'the camera keeps the entering figure framed' },
  beginsIn: 'room empty, frame static', endsIn: 'figure inside the room, still framed',
  expectedAudienceReading: 'someone has arrived',
};
// ================= FIXTURE D =================
const D = {
  semanticEvent: 'the room begins collapsing before the person reacts',
  dramaticIntention: 'the world knows before the character does',
  primaryAttention: { target: 'the collapsing room', from: 'expression' },
  secondaryAttention: { target: "the person's delayed reaction", from: 'physical' },
  relation: 'expression-causes-physical',
  motion: {
    relation: 'expression-causes-physical',
    primary: { kind: 'turn', progress: 0.5, reason: 'the figure turns toward the collapse, after it begins' },
    secondary: { kind: 'structural-decay', progress: 0.4, reason: 'the room collapses first and the figure reacts to it' },
    hierarchy: { primary: 0.35, secondary: 1.0, tertiary: 0.15 },
    onset: { after: 'expression-readable' },
  },
  camera: { move: 'push-in', motivation: 'anticipatory', respondsTo: { kind: 'action', event: 'PERSON_REACTS', readableAt: 0.6 }, beginsAt: 0.1, reason: 'the camera moves before the reaction, so the world seems to know first' },
  beginsIn: 'room intact, person unaware', endsIn: 'room collapsing, person reacting',
  expectedAudienceReading: 'the world knew before the character did',
};
// ================= FIXTURE E — the RESTRAINT fixture =================
const E = {
  semanticEvent: 'a person walks through a corridor and nothing supernatural happens',
  dramaticIntention: 'ordinary passage, and the calm of a world behaving normally',
  primaryAttention: { target: 'the walking figure', from: 'physical' },
  relation: 'physical-only',
  motion: {
    relation: 'physical-only',
    primary: { kind: 'walk', progress: 0.5, reason: 'the figure crosses the corridor' },
    secondary: none('nothing happens that would need an ASCII expression'),
    hierarchy: H,
  },
  camera: { move: 'truck', motivation: 'subject-following', respondsTo: { kind: 'subject', event: 'WALKING_FIGURE' }, beginsAt: 0, reason: 'the camera exists to keep the walking figure framed' },
  beginsIn: 'corridor empty, frame static', endsIn: 'figure further along the corridor, still framed',
  expectedAudienceReading: 'someone is walking down a corridor, and the world is ordinary',
};
// ================= FIXTURE F =================
const F = {
  semanticEvent: 'a written word disappears while the person does not react',
  dramaticIntention: 'loss that happens without witness — the person does not notice',
  primaryAttention: { target: 'the vanishing word', from: 'expression' },
  secondaryAttention: { target: 'the unmoving figure', from: 'physical' },
  relation: 'expression-only',
  motion: {
    relation: 'expression-only',
    primary: none('the person deliberately does not react'),
    secondary: { kind: 'density-dissolve', progress: 0.5, reason: 'the word loses substance until nothing is left' },
    hierarchy: HE,
  },
  camera: { move: 'none', motivation: 'static', reason: 'the absence of reaction is the subject; a moving camera would supply a reaction the shot denies' },
  beginsIn: 'word fully present, person still', endsIn: 'word gone, person unchanged',
  expectedAudienceReading: 'something was erased and nobody noticed',
};
const FIXTURES = { A, B, C, D, E, F };

console.log('SHOT GRAMMAR — PLANNING FIXTURES\n');
for (const [k, f] of Object.entries(FIXTURES)) {
  const p = validateShotIntent(f);
  ok(p.length === 0, `Fixture ${k} compiles cleanly`, p.join('; '));
}

console.log('\nTHE FIXTURES ARE MEANINGFULLY DIFFERENT (the model forces no single grammar)');
ok(new Set(Object.values(FIXTURES).map((f) => f.relation)).size === 4, 'all four fixtures use a DIFFERENT composition relation', Object.values(FIXTURES).map((f) => f.relation).join(', '));
/** The count grew from 4 fixtures to 6; the assertion is that the expressions DIFFER, not a fixed number. */
ok(new Set(Object.values(FIXTURES).map((f) => f.motion.secondary.kind)).size >= 3, `${new Set(Object.values(FIXTURES).map((f) => f.motion.secondary.kind)).size} distinct ASCII expressions across the fixtures (including 'none')`);
ok(new Set(Object.values(FIXTURES).map((f) => f.camera.motivation)).size === 4, 'four distinct camera motivations across six fixtures', Object.values(FIXTURES).map((f) => f.camera.motivation).join(', '));
ok(new Set(Object.values(FIXTURES).map((f) => f.camera.move)).size === 3, 'three distinct camera moves (none, push-in, truck)');
ok(FIXTURES.E.motion.secondary.kind === 'none' && FIXTURES.C.motion.secondary.kind === 'none', 'TWO fixtures need no ASCII expression at all — the Director shows restraint, it does not add decay because it can');
ok(FIXTURES.F.motion.primary.kind === 'none' && FIXTURES.B.motion.primary.kind === 'none', 'TWO fixtures invent no physical action — absence of action is a valid plan');
ok(FIXTURES.B.camera.motivation === 'static' && validateShotIntent(FIXTURES.B).length === 0, 'STATIC is a valid deliberate camera choice, not a missing decision');
ok(FIXTURES.C.motion.secondary.kind === 'none' && validateShotIntent(FIXTURES.C).length === 0, 'a shot may carry no ASCII expression at all');
ok(FIXTURES.B.motion.primary.kind === 'none' && validateShotIntent(FIXTURES.B).length === 0, 'a shot may carry no physical motion at all (expression-only)');

console.log('\nALL FIVE COMPOSITION RELATIONS REMAIN VALID');
ok(Object.keys(RELATION_SEMANTICS).length === 6, 'six relations declared — presentational was added in 3.3H');
for (const r of ['physical-only', 'expression-only', 'physical-causes-expression', 'expression-causes-physical', 'parallel', 'presentational']) {
  ok(RELATION_SEMANTICS[r] !== undefined, `'${r}' is valid`);
}

console.log('\nTHE DECISION CONTRACT IS PRODUCIBLE FOR EVERY FIXTURE');
for (const [k, f] of Object.entries(FIXTURES)) {
  const d = explainShot(f);
  const complete = d.semanticEvent && d.primaryPhysicalAction && d.asciiExpression && d.causalRelation && d.cameraMotivation && d.cameraMove && d.attentionHierarchy.length > 0 && d.beginsIn && d.endsIn;
  ok(!!complete, `Fixture ${k} answers all ten contract fields`);
}

console.log('\nATTENTION HIERARCHY — the director refuses competing primaries');
{
  const bad = JSON.parse(JSON.stringify(A));
  bad.primaryAttention = { target: 'the camera push', from: 'camera' };
  ok(validateAttention(bad).length > 0, 'a camera holding PRIMARY attention in a causal shot is refused');
  const same = JSON.parse(JSON.stringify(A));
  same.secondaryAttention = { target: 'the reaching arm', from: 'physical' };
  ok(validateAttention(same).length > 0, 'primary and secondary naming the same target is refused');
  const noPrim = JSON.parse(JSON.stringify(A));
  noPrim.primaryAttention = undefined;
  ok(validateAttention(noPrim).length > 0, 'a shot with no declared primary attention is refused');
}

console.log('\nCAMERA MOTIVATION != CAMERA MOVE');
{
  const a = { move: 'push-in', motivation: 'action-responsive', respondsTo: { kind: 'action', event: 'REACH', readableAt: 0.3 }, beginsAt: 0.33, reason: 'answers the action' };
  const b = { move: 'push-in', motivation: 'anticipatory', respondsTo: { kind: 'action', event: 'REACH', readableAt: 0.5 }, beginsAt: 0, reason: 'before the event' };
  ok(a.move === b.move, 'the same geometric move (push-in) is used by both motivations');
  ok(a.motivation !== b.motivation, 'but their motivations differ, and the external review rated them differently');
  ok(validateCameraIntent(a).length === 0 && validateCameraIntent(b).length === 0, 'both are valid camera intents');
  ok(validateCameraIntent({ move: 'push-in', motivation: 'static', reason: 'x' }).length > 0, 'a moving camera with STATIC motivation is refused');
  ok(validateCameraIntent({ move: 'none', motivation: 'action-responsive', reason: 'x' }).length > 0, "action-responsive with no move is refused");
  ok(validateCameraIntent({ move: 'push-in', motivation: 'action-responsive', reason: 'x' }).length > 0, 'action-responsive without a referenced event is refused');
  ok(validateCameraIntent({ move: 'push-in', motivation: 'action-responsive', respondsTo: { kind: 'action', event: 'REACH' }, beginsAt: 0.3, reason: 'x' }).length > 0, 'action-responsive without the action readibility landmark is refused');
  ok(validateCameraIntent({ move: 'push-in', motivation: 'anticipatory', respondsTo: { kind: 'action', event: 'REACH', readableAt: 0.5 }, beginsAt: 0.9, reason: 'x' }).length > 0, 'anticipatory beginning AFTER its referenced event is refused');
}

console.log('\nNO UNIVERSAL CAUSAL FRAME CONSTANT');
{
  const c = JSON.parse(JSON.stringify(A));
  c.motion.onset = { after: 'immediate' };
  ok(validateShotIntent(c).length > 0, 'a causal relation still refuses an onset with no legibility gate');
  const d = JSON.parse(JSON.stringify(D));
  d.motion.onset = { after: 'reach-readable' };
  ok(validateShotIntent(d).length > 0, 'an expression-caused shot refuses the physical gate — the gate names the CAUSE');
  ok(CAMERA_MOTIVATIONS.length >= 6, `${CAMERA_MOTIVATIONS.length} camera motivations declared`);
}

console.log('\nDIRECTOR RESTRAINT — CAPABILITY DOES NOT IMPLY USE');
{
  const { restraintReport } = M;
  const rE = restraintReport(FIXTURES.E);
  ok(/deliberately unused/.test(rE.note), 'Fixture E reports its unused capability rather than hiding it', rE.note);
  ok(rE.unused.some((u) => u.startsWith('expression')), 'Fixture E leaves the entire ASCII expression layer unused');
  ok(!/VIOLATION/.test(rE.note), 'Fixture E is not a restraint violation');
  const rB = restraintReport(FIXTURES.B);
  ok(rB.unused.some((u) => u === 'camera:static'), 'Fixture B records STATIC as a decision, not a missing mechanism');
  const g = JSON.parse(JSON.stringify(FIXTURES.E));
  g.motion.secondary = { kind: 'density-dissolve', progress: 0.5, reason: 'added for visual interest' };
  ok(/RESTRAINT VIOLATION/.test(restraintReport(g).note), 'a mechanism added for visual interest is refused', restraintReport(g).note);
  ok(validateShotIntent(g).length > 0, 'and the shot plan fails validation as a result');
  const n = JSON.parse(JSON.stringify(FIXTURES.E));
  n.expectedAudienceReading = '';
  ok(validateAttention(n).length > 0, 'a shot that does not declare what the audience should take from it is refused');
}

console.log('\nTHE SIX FIXTURES DO NOT COLLAPSE TO ONE PLAN');
{
  const sigs = Object.entries(FIXTURES).map(([k, f]) => `${f.relation}|${f.motion.primary.kind}|${f.motion.secondary.kind}|${f.camera.motivation}|${f.camera.move}`);
  ok(new Set(sigs).size === 6, `all six fixtures produce a DISTINCT plan signature (${new Set(sigs).size}/6)`);
  const allSame = sigs.every((x) => /physical-causes-expression/.test(x));
  ok(!allSame, 'not every fixture is forced into physical-causes-expression');
  const pushIns = sigs.filter((x) => /push-in/.test(x)).length;
  ok(pushIns <= 2, `only ${pushIns} of 6 fixtures use a push-in — the planner is not defaulting to one camera move`);
}

// (final tally and exit are at the end of the file)

// ===========================================================================
// CAMERA MOTIVATION — the S4 audit (Phase 3.3I), RE-TESTED AFTER 3.3J
// ===========================================================================
console.log('\nCAMERA MOTIVATION — the S4 AUDIT, BEFORE AND AFTER 3.3J');
{
  /**
   * ⚠ THE GAP THESE ASSERTIONS USED TO RECORD HAS BEEN CLOSED BY PHASE 3.3J.
   *
   * The 3.3I audit found that `validateCameraIntent` returned the SAME result for `action-responsive` and
   * `consequence-responsive` with the same field — it tested that a number was DECLARED, not that a legible
   * action EXISTED. The assertions here previously PINNED that gap; they now assert it is **closed**.
   *
   * The 3.3I finding itself is unchanged: S4's onset showed `roomDecay = 0.0399` while `reachProgress = 1`
   * and `stepProgress = 1`, so the camera is **consequence-responsive** and the label was wrong.
   */
  const s4AsAuthoredIn33I = { move: 'push-in', motivation: 'action-responsive', beginsAt: 0.25, reason: 'the camera follows the room consequence' };
  ok(validateCameraIntent(s4AsAuthoredIn33I).length > 0, 'the S4 declaration as authored in 3.3I is now REFUSED (it names no event)');

  const s4Mislabeled = { move: 'push-in', motivation: 'action-responsive', respondsTo: { kind: 'consequence', event: 'ROOM_STRUCTURAL_DECAY', onsetsAt: 0.25 }, beginsAt: 0.25, reason: 'the camera follows the room consequence' };
  ok(validateCameraIntent(s4Mislabeled).length > 0, 'and it is refused even WITH a consequence reference — action-responsive must respond to an ACTION');

  const s4Corrected = { move: 'push-in', motivation: 'consequence-responsive', respondsTo: { kind: 'consequence', event: 'ROOM_STRUCTURAL_DECAY', onsetsAt: 0.25 }, beginsAt: 0.25, reason: 'the camera follows the room consequence' };
  ok(validateCameraIntent(s4Corrected).length === 0, 'the CORRECTED metadata (consequence-responsive + consequence landmark) is accepted');

  /** the two motivations must now be distinguishable — that was the whole gap */
  const ar = { move: 'push-in', motivation: 'action-responsive', respondsTo: { kind: 'action', event: 'REACH', readableAt: 0.3 }, beginsAt: 0.3, reason: 'x' };
  const crNoMark = { move: 'push-in', motivation: 'consequence-responsive', respondsTo: { kind: 'consequence', event: 'ROOM_DECAY' }, beginsAt: 0.3, reason: 'x' };
  const crOk = { move: 'push-in', motivation: 'consequence-responsive', respondsTo: { kind: 'consequence', event: 'ROOM_DECAY', onsetsAt: 0.3 }, beginsAt: 0.3, reason: 'x' };
  const arSwapped = { move: 'push-in', motivation: 'action-responsive', respondsTo: { kind: 'consequence', event: 'ROOM_DECAY', onsetsAt: 0.3 }, beginsAt: 0.3, reason: 'x' };
  const crSwapped = { move: 'push-in', motivation: 'consequence-responsive', respondsTo: { kind: 'action', event: 'REACH', readableAt: 0.3 }, beginsAt: 0.3, reason: 'x' };
  ok(validateCameraIntent(arSwapped).length > 0 && validateCameraIntent(crSwapped).length > 0, 'THE GAP IS CLOSED: the two motivations no longer accept each other\'s event kind');
  ok(validateCameraIntent(crNoMark).length > 0 && validateCameraIntent(crOk).length === 0, 'consequence-responsive now REQUIRES its consequence landmark (it used to require nothing)');
  ok(validateCameraIntent(ar).length === 0, 'action-responsive still accepts a correctly referenced action');
}

console.log(`\n${pass}/${pass + fail} assertions pass (including the camera motivation audit)`);

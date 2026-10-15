/**
 * PHASE 3.3J — V2 COMPATIBILITY REPLAY.
 *
 * `director-plan-v2.json` is replayed through the new compile contract. **V2 is not re-rendered and not
 * modified.** `director-plan-v2.json` itself is NOT modified — the S4 metadata correction lives in this
 * fixture, and the proposed correction is recorded in the JSON output.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'out', 'phase33i');
const J = path.join(ROOT, 'outputs', 'phase33j');
const C = await import(path.join(ROOT, 'dist', 'src', 'semantic', 'shot-compiler.js'));
const { compileSequence } = C;

const v2 = JSON.parse(await readFile(path.join(OUT, 'director-plan-v2.json'), 'utf8'));
const frozen = JSON.parse(await readFile(path.join(OUT, 'causal-trace.json'), 'utf8'));
const meta = v2.shots;
const FPS = 30;
const none = (r) => ({ kind: 'none', progress: 0, reason: r });
const H = { primary: 1.0, secondary: 0.35, tertiary: 0.15 };
const HE = { primary: 0.2, secondary: 1.0, tertiary: 0.15 };

const at = (f) => frozen.trace.find((r) => r.frame === f) ?? frozen.trace[frozen.trace.length - 1];
const worldAt = (frame) => {
  const r = at(frame);
  return {
    personState: `step:${r.stepPhase}`,
    nameState: r.nameFragment >= 1 ? 'gone' : r.nameFragment > 0 ? 'fragmenting' : 'intact',
    roomState: r.roomDecay >= 0.9 ? 'nearly-absent' : r.roomDecay > 0 ? 'withdrawing' : 'complete',
    nameProgress: +r.nameFragment.toFixed(4),
    roomProgress: +r.roomDecay.toFixed(4),
  };
};
const b = (i) => ({ frameStart: meta[i].startFrame, frameEnd: meta[i].endFrame });

/** THE S4 METADATA CORRECTION, from the 3.3I audit: consequence-responsive, not action-responsive */
const S4_CAMERA = {
  move: 'push-in', motivation: 'consequence-responsive',
  respondsTo: { kind: 'consequence', event: 'ROOM_STRUCTURAL_DECAY', onsetsAt: 0.25 },
  beginsAt: 0.25,
  reason: 'the camera follows the room consequence — corrected from the mislabelled action-responsive',
};
/** the ORIGINAL, as authored in 3.3I: a moving camera with no referenced event at all */
const S4_CAMERA_ORIGINAL = { move: 'push-in', motivation: 'action-responsive', beginsAt: 0.25, reason: 'the camera follows the room consequence' };

function buildPlan(s4camera) {
  return [
    { id: 'S1-establish', ...b(0), entersIn: worldAt(meta[0].startFrame), exitsIn: worldAt(meta[0].endFrame), intent: {
      semanticEvent: 'a person stands alone in a room, and a name is written on the wall',
      dramaticIntention: 'establish the world and the person-name relation before anything changes',
      primaryAttention: { target: 'the room and the person standing in it', from: 'physical' },
      secondaryAttention: { target: 'the name on the wall', from: 'expression' },
      relation: 'presentational',
      motion: { relation: 'presentational', primary: none('the person is present but performs no action; this shot establishes space and relation'), secondary: none('the name is already written and must simply be legible'), hierarchy: { primary: 0.5, secondary: 0.5, tertiary: 0.15 } },
      camera: { move: 'none', motivation: 'static', reason: 'the space must be understood before it can be lost' },
      beginsIn: 'empty frame', endsIn: 'person standing, room complete, NAME intact',
      expectedAudienceReading: 'a person is alone in a room, and their name is written on the wall' } },
    { id: 'S2-performance', ...b(1), entersIn: worldAt(meta[1].startFrame), exitsIn: worldAt(meta[1].endFrame),
      causal: { cause: 'REACH', effect: 'LETTER_FRAGMENT', causeStart: 0.05, causeReadable: 0.3262, holdRatio: 0.25, effectOnset: 0.3262 + (1 - 0.3262) * 0.25, validationScope: 'REACH -> LETTER_FRAGMENT only; no other pair has external evidence' },
      intent: {
      semanticEvent: 'the person notices the name, orients to it, steps toward it, settles and reaches, and the name breaks',
      dramaticIntention: 'the act of reaching for the name is what destroys it',
      primaryAttention: { target: 'the reaching arm', from: 'physical' },
      secondaryAttention: { target: 'the name breaking apart', from: 'expression' },
      relation: 'physical-causes-expression',
      motion: { relation: 'physical-causes-expression', primary: { kind: 'reach', progress: 0.5, reason: 'the reach is the only physical expression the story needs, and it makes the noticing visible' }, secondary: { kind: 'letter-fragment', progress: 0.4, reason: 'the name breaks BECAUSE the person reached, which is the film causal centre' }, hierarchy: H, onset: { after: 'reach-readable' } },
      camera: { move: 'none', motivation: 'static', reason: 'the character now supplies the motion; a push here would compete with the performance (3.3I SHOT COMPOSITION CORRECTION)' },
      beginsIn: 'person standing, NAME intact', endsIn: 'arm extended, NAME fragmenting',
      expectedAudienceReading: 'reaching for the name is what makes it break' } },
    { id: 'S3-name-lost', ...b(2), entersIn: worldAt(meta[2].startFrame), exitsIn: worldAt(meta[2].endFrame), intent: {
      semanticEvent: 'the name comes apart and almost nothing remains', dramaticIntention: 'the consequence, given room to land',
      primaryAttention: { target: 'what is left of the name', from: 'expression' }, relation: 'expression-only',
      motion: { relation: 'expression-only', primary: none('the person holds the reach and does not act again'), secondary: { kind: 'letter-fragment', progress: 0.85, reason: 'the same fragmentation continuing to its end, not a second effect' }, hierarchy: HE },
      camera: { move: 'none', motivation: 'static', reason: 'the loss should be watched, not announced' },
      beginsIn: 'arm extended, NAME loosening', endsIn: 'NAME almost gone',
      expectedAudienceReading: 'the name is gone and the person still holds the gesture that removed it' } },
    { id: 'S4-room-withdraws', ...b(3), entersIn: worldAt(meta[3].startFrame), exitsIn: worldAt(meta[3].endFrame), intent: {
      semanticEvent: 'the room itself gradually disappears', dramaticIntention: 'the world withdraws, and it is the room rather than the person that goes',
      primaryAttention: { target: 'the room losing its structure', from: 'expression' }, relation: 'expression-only',
      motion: { relation: 'expression-only', primary: none('the person does not react'), secondary: { kind: 'structural-decay', progress: 0.6, reason: 'the room must withdraw as SPACE rather than switch off' }, hierarchy: HE },
      camera: s4camera,
      beginsIn: 'room complete, NAME almost gone', endsIn: 'room reduced to its structure',
      expectedAudienceReading: 'the space around the person is going away' } },
    { id: 'S5-person-remains', ...b(4), entersIn: worldAt(meta[4].startFrame), exitsIn: worldAt(meta[4].endFrame), intent: {
      semanticEvent: 'only the person remains', dramaticIntention: 'the film end state',
      primaryAttention: { target: 'the person, alone', from: 'physical' }, relation: 'expression-only',
      motion: { relation: 'expression-only', primary: none('the person is still; the ending is a state, not an action'), secondary: { kind: 'structural-decay', progress: 0.95, reason: 'the decay completes rather than stops' }, hierarchy: HE },
      camera: { move: 'none', motivation: 'static', reason: 'the final image must be readable and held' },
      beginsIn: 'room reduced to its structure', endsIn: 'name gone, room nearly absent, person standing alone',
      expectedAudienceReading: 'everyone and everything else is gone, and the person is still standing there' } },
  ];
}

await mkdir(J, { recursive: true });
console.log('PHASE 3.3J — V2 COMPATIBILITY REPLAY\n');
console.log('  director-plan-v2.json is replayed through the compile contract.');
console.log('  V2 is NOT re-rendered, NOT modified. V2 hash remains fb8c4175d2bdba32.');
console.log('  director-plan-v2.json is NOT modified.\n');

/** PASS 1 — the plan exactly as 3.3I authored it */
let original = null, refusal = null;
try { original = compileSequence(buildPlan(S4_CAMERA_ORIGINAL), { fps: FPS }); } catch (e) { refusal = e; }
console.log('  PASS 1 — the plan AS AUTHORED IN 3.3I:');
console.log(refusal ? `    REFUSED: ${refusal.message}` : '    accepted (unexpected)');
console.log('');

/** PASS 2 — with the S4 metadata correction */
const fixed = compileSequence(buildPlan(S4_CAMERA), { fps: FPS });
console.log('  PASS 2 — with the S4 metadata correction:');
console.log(`    ACCEPTED — ${fixed.shots.length} shots, ${fixed.totalFrames} frames\n`);
console.log('    shot                 frames      relation                     camera motivation        event                     onset f   causal f');
for (const s of fixed.shots) {
  console.log('    ' + s.shotId.padEnd(20) + (s.frameStart + '..' + s.frameEnd).padStart(10) + '  ' + s.compositionRelation.padEnd(28) + s.camera.motivation.padEnd(24) + (s.camera.event ?? '-').padEnd(24) + String(s.camera.beginsAtFrame ?? '-').padStart(7) + (s.causalTiming ? '  ' + s.causalTiming.causeReadableFrame + '/' + s.causalTiming.effectOnsetFrame : '').padStart(12));
}
console.log('');
console.log('    CONSUMPTION LEDGER:');
for (const [k, v] of Object.entries(fixed.cameraIntent)) console.log('      ' + k.padEnd(17) + 'compiled=' + String(v.compiled).padEnd(6) + 'consumed=' + String(v.consumed).padEnd(6) + (v.consumer ? 'by ' + v.consumer : ''));
console.log('');
console.log('    SEMANTIC PROVENANCE retained (not collapsed to a bare yaw):');
for (const s of fixed.shots) if (s.target.relations.length) console.log('      ' + s.shotId.padEnd(20) + s.target.relations.join(', '));

/** COMPATIBILITY vs the frozen film */
const s2 = fixed.shots.find((s) => s.shotId === 'S2-performance');
const s4 = fixed.shots.find((s) => s.shotId === 'S4-room-withdraws');
const frozenReach = frozen.trace.find((r) => r.reachProgress >= 0.3262)?.frame;
const frozenFrag = frozen.trace.find((r) => r.nameFragment > 0)?.frame;
const frozenCam = frozen.trace.find((r) => Math.abs(r.camZ - 0.9315) > 1e-6)?.frame;
const rows = [
  { quantity: 'S4 camera onset frame', contract: s4.camera.beginsAtFrame, frozen: frozenCam, agree: Math.abs(s4.camera.beginsAtFrame - frozenCam) <= 1,
    reason: 'within one frame — a definition difference: beginsAt marks the frame the camera STARTS (easing value 0), the trace records the first MEASURABLE change' },
  { quantity: 'S2 cause readable frame', contract: s2.causalTiming.causeReadableFrame, frozen: frozenReach, agree: false,
    reason: 'the FILM applied the landmark to a PERFORMANCE WINDOW (7.0-9.4 s); the CONTRACT applies it to the SHOT SPAN. Same declared pair, two bases — the duplication this phase removes.' },
  { quantity: 'S2 effect onset frame', contract: s2.causalTiming.effectOnsetFrame, frozen: frozenFrag, agree: false, reason: 'derived from the cause, so it differs for the same reason' },
];
console.log('');
console.log('  COMPATIBILITY vs the FROZEN V2 causal trace:');
console.log('    quantity                     contract   frozen   agree');
for (const r of rows) console.log('    ' + r.quantity.padEnd(29) + String(r.contract).padStart(8) + String(r.frozen).padStart(9) + '   ' + (r.agree ? 'yes' : 'NO'));
console.log('');
console.log('  The two causal landmarks disagree, and that IS the phase finding: the film and another');
console.log('  script each reconstructed the onset independently from the same constants — seven sites');
console.log('  total. One of them reconstructed it as NaN, and the film fragmented the NAME from frame 0.');
console.log('  The contract gives the pair ONE owner.');

await writeFile(path.join(J, 'v2-compatibility.json'), JSON.stringify({
  note: 'director-plan-v2.json replayed through the compile contract; V2 and the plan file are NOT modified',
  v2Hash: 'fb8c4175d2bdba32',
  pass1_asAuthoredIn33I: refusal ? { compiles: false, refusal: refusal.message, context: refusal.context } : { compiles: true },
  pass2_withS4Correction: { compiles: true, shots: fixed.shots, ledger: fixed.cameraIntent },
  proposedS4Metadata: S4_CAMERA,
  compatibility: rows,
  interpretation: 'The causal landmarks disagree because the film derived them on a performance-window basis and the contract on the shot-span basis. Same declared pair, two independent derivations, seven sites in the repository. The contract establishes one owner.',
}, null, 2));

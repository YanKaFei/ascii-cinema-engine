/**
 * PHASE 3.3G — THE DIRECTOR'S PLAN.
 *
 * The semantic story, compiled into shots. NOT one sentence per shot.
 *
 *   "A person stands alone in a room. Their name is written on the wall. They notice it.
 *    They reach toward the name. The name begins to break apart. Then the room itself gradually
 *    disappears. At the end, only the person remains."
 *
 * The plan is authored, checked and reviewed BEFORE anything renders. Writes director-plan.json.
 */
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'out', 'phase33g');
const SP = await import(path.join(ROOT, 'dist', 'src', 'semantic', 'shot-plan.js'));
const { state, reviewPlan } = SP;
const H = { primary: 1.0, secondary: 0.35, tertiary: 0.15 };
const HE = { primary: 0.2, secondary: 1.0, tertiary: 0.15 };
const none = (r) => ({ kind: 'none', progress: 0, reason: r });

/**
 * SHOT CHOICE — five shots, and the reasons the Director combined or isolated beats.
 *
 * The story's seven sentences map to five shots because TWO pairs are combined and ONE beat is isolated:
 *   - "stands alone in a room" + "their name is written on the wall"  -> SHOT 1. Both are SPATIAL
 *     information about one place. Splitting them would cut on no change of subject.
 *   - "they notice it" + "they reach toward the name"                 -> SHOT 2. Noticing has no physical
 *     expression in the validated vocabulary; the reach IS the noticing made visible.
 *   - "the name begins to break apart"                                -> ISOLATED. This is the film's
 *     causal centre and the only event in the story that is *caused* by the person.
 *   - "the room itself gradually disappears"                          -> SHOT 4.
 *   - "at the end, only the person remains"                           -> SHOT 5.
 */
const shots = [];

// ---------------- SHOT 1 — ESTABLISHING ----------------
shots.push({
  id: 'S1-establish',
  intent: {
    semanticEvent: 'a person stands alone in a room, and a name is written on the wall',
    dramaticIntention: 'establish the world and the relation between the person and the written name before anything changes',
    primaryAttention: { target: 'the room and the person standing in it', from: 'physical' },
    secondaryAttention: { target: 'the name on the wall', from: 'expression' },
    /**
     * ⚠ THIS SHOT EXPOSED A GAP IN THE RELATION MODEL.
     *
     * The establishing shot has no physical action (nobody acts) and no expressive transformation (the name
     * is simply there). It is not causal — nothing causes anything yet. The original five relations had no
     * home for a **presentational** shot, and `physical-only` was correctly refused for having no motion.
     *
     * `parallel` is the honest relation: the world is in a state and the shot observes it, with EITHER
     * layer permitted to be absent. Forcing this into `expression-only` would have meant claiming an intact,
     * unmodified name was an "expression" — a fiction the plan would then have to carry.
     */
    relation: 'parallel',
    motion: {
      relation: 'parallel',
      /** the person is present but does not act — this is information, not a pose demo */
      primary: none('the person is present but performs no action; this shot exists to establish space and relation'),
      secondary: none('the name is already written — showing it requires no expression, it must simply be legible'),
      hierarchy: H,
    },
    camera: { move: 'none', motivation: 'static', reason: 'the space must be understood before it can be lost; a moving camera would spend the establishing shot on itself' },
    beginsIn: 'empty frame', endsIn: 'person standing, room complete, NAME intact',
    expectedAudienceReading: 'a person is alone in a room, and their name is written on the wall',
  },
  entersIn: state('standing, centred left, still', 'intact and legible on the wall', 'complete and structured'),
  exitsIn: state('standing, centred left, still', 'intact and legible on the wall', 'complete and structured'),
  reasonForCut: 'all spatial information is delivered; the story now needs the person to act, so the cut lands on the transition from looking to acting',
  notUsed: ['asii expression of any kind', 'camera movement', 'reach'],
  seconds: 3.2,
});

// ---------------- SHOT 2 — THE CAUSAL CORE ----------------
shots.push({
  id: 'S2-reach-breaks-name',
  intent: {
    semanticEvent: 'the person reaches toward the name and the name begins to break apart',
    dramaticIntention: 'the act of reaching for the name is what destroys it',
    primaryAttention: { target: 'the reaching arm', from: 'physical' },
    secondaryAttention: { target: 'the name breaking apart', from: 'expression' },
    tertiaryResponse: { target: 'a camera that answers the action', from: 'camera' },
    relation: 'physical-causes-expression',
    motion: {
      relation: 'physical-causes-expression',
      primary: { kind: 'reach', progress: 0.5, reason: 'the reach is the only physical expression the story needs, and it is what makes the noticing visible' },
      secondary: { kind: 'letter-fragment', progress: 0.4, reason: 'the name must break BECAUSE the person reached, which is the film\'s causal centre' },
      hierarchy: H,
      onset: { after: 'reach-readable' },
    },
    camera: { move: 'push-in', motivation: 'action-responsive', beginsAtActionProgress: 0.3262, reason: 'the camera answers the becoming-legible action, granting it importance without competing with it (validated in 3.3E)' },
    beginsIn: 'person standing, NAME intact, camera at rest',
    endsIn: 'arm extended toward the wall, NAME visibly loosening, camera slightly closer',
    expectedAudienceReading: 'reaching for the name is what makes it break',
  },
  entersIn: state('standing, centred left, still', 'intact and legible on the wall', 'complete and structured'),
  exitsIn: state('arm extended toward the wall, holding', 'loosening and separating, still identifiable', 'complete and structured'),
  reasonForCut: 'the causal hold has elapsed and the fragmentation has begun; the audience now needs to see the consequence rather than the cause, and the arm is already held',
  notUsed: ['room decay', 'density dissolve', 'camera acceleration', 'any second expression'],
  seconds: 4.33,
});

// ---------------- SHOT 3 — THE CONSEQUENCE ----------------
shots.push({
  id: 'S3-name-lost',
  intent: {
    semanticEvent: 'the name comes apart and almost nothing of it remains',
    dramaticIntention: 'the consequence of the reach, given room to land before the world itself responds',
    primaryAttention: { target: 'what is left of the name', from: 'expression' },
    secondaryAttention: { target: 'the person, still holding the reach', from: 'physical' },
    relation: 'expression-only',
    motion: {
      relation: 'expression-only',
      primary: none('the person holds the reach and does not act again; the consequence is the subject'),
      secondary: { kind: 'letter-fragment', progress: 0.85, reason: 'this is the same fragmentation continuing to its end, not a second effect' },
      hierarchy: HE,
    },
    camera: { move: 'none', motivation: 'static', reason: 'the consequence needs no camera emphasis; the loss should be watched, not announced' },
    beginsIn: 'arm extended, NAME loosening',
    endsIn: 'NAME almost gone, person still holding the reach',
    expectedAudienceReading: 'the name is gone, and the person is still holding the gesture that removed it',
  },
  entersIn: state('arm extended toward the wall, holding', 'loosening and separating, still identifiable', 'complete and structured'),
  exitsIn: state('arm extended toward the wall, holding', 'almost entirely gone', 'complete and structured'),
  reasonForCut: 'the name has been destroyed and registered; only now does the room respond, so the cut separates cause from world-scale consequence',
  notUsed: ['room decay', 'camera movement', 'a second expression'],
  seconds: 2.2,
});

// ---------------- SHOT 4 — THE WORLD WITHDRAWS ----------------
shots.push({
  id: 'S4-room-withdraws',
  intent: {
    semanticEvent: 'the room itself gradually disappears',
    dramaticIntention: 'the world withdraws, and it is the room rather than the person that goes',
    primaryAttention: { target: 'the room losing its structure', from: 'expression' },
    secondaryAttention: { target: 'the person, unchanged, inside it', from: 'physical' },
    relation: 'expression-only',
    motion: {
      relation: 'expression-only',
      primary: none('the person does not react — the story gives them no reaction, and inventing one would be a new physical action the vocabulary does not have'),
      secondary: { kind: 'structural-decay', progress: 0.6, reason: 'the room must withdraw as SPACE rather than switch off, which is what the staged decay ordering exists to express' },
      hierarchy: HE,
    },
    camera: {
      move: 'push-in', motivation: 'consequence-responsive', beginsAtActionProgress: 0.25,
      reason: 'the camera responds only after the consequence has begun, so it follows the withdrawal rather than announcing it',
    },
    beginsIn: 'room complete, NAME almost gone, person holding the reach',
    endsIn: 'room reduced to its structure, person unchanged',
    expectedAudienceReading: 'the space around the person is going away',
  },
  entersIn: state('arm extended toward the wall, holding', 'almost entirely gone', 'complete and structured'),
  exitsIn: state('arm lowered, standing alone', 'gone', 'structure only, most planes withdrawn'),
  reasonForCut: 'the room is far enough gone that the person now reads as standing in space rather than in a room, which is the ending\'s subject',
  notUsed: ['density dissolve', 'a second expression', 'any camera move that outranks the decay'],
  seconds: 2.7,
});

// ---------------- SHOT 5 — ONLY THE PERSON REMAINS ----------------
shots.push({
  id: 'S5-person-remains',
  intent: {
    semanticEvent: 'only the person remains',
    dramaticIntention: 'the film\'s end state: the person is still there, the name is gone, and the room has withdrawn',
    primaryAttention: { target: 'the person, alone', from: 'physical' },
    secondaryAttention: { target: 'the nearly empty space around them', from: 'expression' },
    relation: 'expression-only',
    motion: {
      relation: 'expression-only',
      primary: none('the person is still; the ending is a state, not an action'),
      secondary: { kind: 'structural-decay', progress: 0.95, reason: 'the decay completes rather than stops, so the ending is the same event arriving, not a new one' },
      hierarchy: HE,
    },
    camera: { move: 'none', motivation: 'static', reason: 'the final image must be readable and held; camera movement would end the film on technique instead of on the person' },
    beginsIn: 'room reduced to its structure, person holding the reach',
    endsIn: 'name gone, room nearly absent, person standing alone',
    expectedAudienceReading: 'everyone and everything else is gone, and the person is still standing there',
  },
  entersIn: state('arm lowered, standing alone', 'gone', 'structure only, most planes withdrawn'),
  exitsIn: state('standing alone, still', 'gone', 'nearly absent — junctions only'),
  reasonForCut: 'the film ends here; the final state is held rather than cut away from',
  notUsed: ['camera movement', 'a second expression', 'any resolving effect'],
  seconds: 1.6,
});

const plan = {
  story: 'A person stands alone in a room. Their name is written on the wall. They notice it. They reach toward the name. The name begins to break apart. Then the room itself gradually disappears. At the end, only the person remains.',
  shots,
  /**
   * ⚠ CROSS-SHOT CAUSALITY IS DECLARED AS UNVALIDATED, DELIBERATELY.
   *
   * The story reads as though the room's disappearance follows the name's. But `CAUSAL_HOLD_RATIO = 0.25`
   * was validated ONLY for `REACH -> LETTER_FRAGMENT`. Reusing it for `NAME -> ROOM` would be exactly the
   * generalisation the 3.3E review warned against, and **no external evidence exists for that pair.**
   *
   * So the Director declares **sequential dramatic consequence** — the cuts place the room's withdrawal
   * after the name's destruction, and the audience may read causation, but the plan **does not claim a
   * timing law it has not validated.**
   */
  crossShotCausality: {
    declared: true,
    relation: 'sequential dramatic consequence (room withdrawal follows name destruction)',
    validated: false,
    note: 'CAUSAL_HOLD_RATIO = 0.25 is validated only for REACH -> LETTER_FRAGMENT. No causal timing law is claimed between the name event and the room event; the ordering is carried by shot order and hard cuts.',
  },
};

const report = reviewPlan(plan);
await mkdir(OUT, { recursive: true });
await writeFile(path.join(OUT, 'director-plan.json'), JSON.stringify({ plan, report }, null, 2));

console.log('PHASE 3.3G — DIRECTOR PLAN\n');
console.log(`  story compiled to ${report.shotCount} shots, ${report.totalSeconds} s\n`);
console.log('  shot                    secs  relation                     physical  expression        camera');
for (const s of plan.shots) {
  console.log(`  ${s.id.padEnd(22)} ${String(s.seconds).padStart(4)}  ${s.intent.relation.padEnd(28)} ${s.intent.motion.primary.kind.padEnd(9)} ${s.intent.motion.secondary.kind.padEnd(17)} ${s.intent.camera.motivation}`);
}
console.log('\n  CONTINUITY:', report.continuity.length === 0 ? 'PASS — every cut carries the world state through' : 'FAIL');
for (const c of report.continuity) console.log('    ' + c);
console.log('\n  SHOT VALIDITY:', report.shotValidity.length === 0 ? 'PASS' : 'FAIL');
for (const v of report.shotValidity) console.log('    ' + v);
console.log('\n  ATTENTION PROGRESSION:');
report.attention.order.forEach((a, i) => console.log(`    ${i + 1}. ${a}`));
console.log('   ', report.attention.problems.length === 0 ? 'PASS — every cut redirects attention' : report.attention.problems.join('; '));
console.log('\n  EFFECT STACKING:', report.stacking.every((s) => !s.stacked) ? 'PASS — never more than one expressive transformation per shot' : 'STACKED');
for (const s of report.stacking) if (s.stacked) console.log(`    ${s.id}: ${s.active.join(' + ')}`);
console.log('\n  REDUNDANCY:');
if (report.redundant.length === 0) console.log('    PASS — no shot is potentially redundant');
for (const r of report.redundant) console.log(`    ${r.id}: POTENTIALLY REDUNDANT — ${r.reason}`);
console.log('\n  RESTRAINT:');
for (const r of report.restraint) console.log(`    ${r.id.padEnd(22)} ${r.used.length} used, ${r.unused.length} deliberately unused${/VIOLATION/.test(r.note) ? '  <-- VIOLATION' : ''}`);
console.log('\n  DURATIONS differ (not equalised):', new Set(plan.shots.map((s) => s.seconds)).size, 'distinct values');

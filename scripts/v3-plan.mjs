/** V3 DIRECTOR PLAN — authored here, validated by the Phase 3.3J compiler, consumed by the V3 runtime. */
export const FPS = 30, TOTAL_SECONDS = 16, TOTAL_FRAMES = 480;
const F = (s) => Math.round(s * FPS);
/** ⚠ shot boundaries: 8 visual tasks, weighted by dramatic need rather than equal length (§10 permits this) */
export const SHOTS = [
  { id: 'S1-signal-to-space', start: 0.0, end: 1.6 },
  { id: 'S2-the-person', start: 1.6, end: 3.7 },
  { id: 'S3-notice', start: 3.7, end: 5.9 },
  { id: 'S4-approach', start: 5.9, end: 8.0 },
  { id: 'S5-reach', start: 8.0, end: 9.7 },
  { id: 'S6-name-fracture', start: 9.7, end: 11.7 },
  { id: 'S7-room-withdraws', start: 11.7, end: 14.1 },
  { id: 'S8-person-remains', start: 14.1, end: 16.0 },
].map((s) => ({ ...s, frameStart: F(s.start), frameEnd: F(s.end) - 1 }));
const S = (id) => SHOTS.find((x) => x.id === id);
export const SHOT_FRAMES = Object.fromEntries(SHOTS.map((s) => [s.id, s]));

const none = (r) => ({ kind: 'none', progress: 0, reason: r });
const H = { primary: 1.0, secondary: 0.35, tertiary: 0.15 };
const HE = { primary: 0.2, secondary: 1.0, tertiary: 0.15 };
const HP = { primary: 1.0, secondary: 0.8, tertiary: 0.15 };
const W = (over) => over;
/** world state helper */
const st = (person, name, room, np, rp) => ({ personState: person, nameState: name, roomState: room, nameProgress: np, roomProgress: rp });

export const PLANNED = [
  {
    id: 'S1-signal-to-space', ...S('S1-signal-to-space'),
    entersIn: st('absent', 'intact but unwritten', 'not yet formed', 0, 0),
    exitsIn: st('absent', 'intact', 'formed', 0, 0),
    intent: {
      semanticEvent: 'a sparse field of characters aggregates out of darkness and becomes the architecture of a room',
      dramaticIntention: 'the space itself should arrive as language, so that the room is understood as made of writing rather than containing it',
      primaryAttention: { target: 'the character field becoming a wall', from: 'expression' },
      secondaryAttention: { target: 'the name on the far wall', from: 'expression' },
      relation: 'expression-only',
      motion: {
        relation: 'expression-only',
        primary: none('no physical action: this shot is the birth of the space'),
        secondary: { kind: 'assemble-from-field', progress: 0.9, reason: 'the room has no other origin than the field of characters that becomes it' },
        hierarchy: HE,
      },
      camera: { move: 'push-in', motivation: 'subject-following', respondsTo: { kind: 'subject', event: 'ROOM_FORMATION', readableAt: 0.5 }, beginsAt: 0.28, reason: 'the camera follows the forming space inward, so the room is entered as it is made rather than cut to once made' },
      beginsIn: 'darkness with scattered characters', endsIn: 'a formed architectural space',
      expectedAudienceReading: 'the room is made of characters that have gathered into walls',
    },
  },
  {
    id: 'S2-the-person', ...S('S2-the-person'),
    entersIn: st('absent', 'intact', 'formed', 0, 0),
    exitsIn: st('standing, alone in the space', 'intact', 'formed', 0, 0),
    intent: {
      semanticEvent: 'the space opens and a single person is standing in it, small against the wall, with the name visible far away',
      dramaticIntention: 'the person must be seen as alone and small before the story asks anything of them',
      primaryAttention: { target: 'the person alone in the space', from: 'physical' },
      secondaryAttention: { target: 'the name on the far wall', from: 'expression' },
      relation: 'expression-only',
      motion: {
        relation: 'expression-only',
        primary: none('the person is still: nothing has happened yet'),
        secondary: { kind: 'density-dissolve', progress: 0.4, reason: 'the forming field settles and thins into readable architecture, which is what makes the name legible as an object on a wall' },
        hierarchy: HE,
      },
      camera: { move: 'crane', motivation: 'reveal', respondsTo: { kind: 'reveal', event: 'PERSON_AND_NAME_IN_ONE_SPACE', readableAt: 0.30 }, beginsAt: 0.32, reason: 'the camera cranes down to disclose that the person and the name share one space, which is the information the shot exists to give' },
      beginsIn: 'a formed room, no person visible', endsIn: 'the person standing, the room and the name established',
      expectedAudienceReading: 'a person is alone in a room, and their name is written far away on the wall',
    },
  },
  {
    id: 'S3-notice', ...S('S3-notice'),
    entersIn: st('standing, alone in the space', 'intact', 'formed', 0, 0),
    exitsIn: st('turned toward the name, holding the look', 'intact', 'formed', 0, 0),
    intent: {
      semanticEvent: 'the person notices the name and turns their head and torso toward it',
      dramaticIntention: 'a very small action must be made to matter, so the audience invests in the person rather than the event',
      primaryAttention: { target: 'the head turning toward the name', from: 'physical' },
      secondaryAttention: { target: 'the name on the wall', from: 'expression' },
      relation: 'physical-causes-expression',
      motion: {
        relation: 'physical-causes-expression',
        primary: { kind: 'turn', progress: 0.7, reason: 'the turn is the whole action, and it is what makes the notice visible' },
        secondary: { kind: 'directional-response', progress: 0.5, reason: 'the characters near the sight line lean toward the name, so the direction of the attention is drawn rather than implied' },
        hierarchy: HP,
        onset: { after: 'reach-readable' },
      },
      camera: { move: 'truck', motivation: 'subject-following', respondsTo: { kind: 'subject', event: 'THE_TURNING_HEAD', readableAt: 0.20 }, beginsAt: 0.20, reason: 'the camera slides with the turning head, which keeps the person large while the name grows into frame behind them' },
      beginsIn: 'person standing, facing away from the name', endsIn: 'person turned toward the name',
      expectedAudienceReading: 'the person has noticed their own name and is turning toward it',
    },
  },
  {
    id: 'S4-approach', ...S('S4-approach'),
    entersIn: st('turned toward the name, holding the look', 'intact', 'formed', 0, 0),
    exitsIn: st('closer to the wall, the step completed', 'intact', 'formed', 0, 0),
    intent: {
      semanticEvent: 'the person takes one target-directed step toward the name, low to the ground, with the floor characters streaming past',
      dramaticIntention: 'the approach should be felt as distance being crossed, not merely as a change of position',
      primaryAttention: { target: 'the stepping foot and the ground it crosses', from: 'physical' },
      secondaryAttention: { target: 'the floor field streaming under the step', from: 'expression' },
      relation: 'physical-causes-expression',
      motion: {
        relation: 'physical-causes-expression',
        primary: { kind: 'walk', progress: 0.8, reason: 'the step is the only physical action in the shot, and it is what moves the character through the field' },
        secondary: { kind: 'density-dissolve', progress: 0.6, reason: 'the floor characters dissolve and reform around each footfall, so the ground is a material the step displaces' },
        hierarchy: HP,
        onset: { after: 'reach-readable' },
      },
      camera: { move: 'truck', motivation: 'subject-following', respondsTo: { kind: 'subject', event: 'THE_STEPPING_BODY', readableAt: 0.0 }, beginsAt: 0.0, reason: 'a low tracking camera follows the stepping body so the floor parallax and the body movement produce one visual rhythm' },
      beginsIn: 'standing at a distance from the wall', endsIn: 'one step closer, the stance settling',
      expectedAudienceReading: 'the person is walking toward their name and the ground moves under them',
    },
  },
  {
    id: 'S5-reach', ...S('S5-reach'),
    entersIn: st('closer to the wall, the step completed', 'intact', 'formed', 0, 0),
    exitsIn: st('arm extended, hand at the name', 'intact', 'formed', 0, 0),
    intent: {
      semanticEvent: 'over the shoulder, the arm reaches toward the name and the hand arrives in front of the letters',
      dramaticIntention: 'the reach must be understood as reaching FOR something, so the relation between the hand and the word is the subject',
      primaryAttention: { target: 'the hand arriving in front of the name', from: 'physical' },
      secondaryAttention: { target: 'the name the hand is reaching for', from: 'expression' },
      relation: 'physical-causes-expression',
      motion: {
        relation: 'physical-causes-expression',
        primary: { kind: 'reach', progress: 0.9, reason: 'the reach is the action, and it must be legible as reaching toward the name rather than as an arm moving' },
        secondary: { kind: 'local-field-response', progress: 0.5, reason: 'the characters immediately in front of the hand displace around it, so the hand is present in the material' },
        hierarchy: HP,
        onset: { after: 'reach-readable' },
      },
      camera: { move: 'push-in', motivation: 'anticipatory', respondsTo: { kind: 'action', event: 'REACH_TOWARD_TARGET', readableAt: 0.62 }, beginsAt: 0.30, reason: 'the camera moves in well before the hand lands, so the audience is already closer when contact happens' },
      beginsIn: 'arm at rest, name intact', endsIn: 'hand at the name, name intact',
      expectedAudienceReading: 'the person is reaching for the name and will touch it',
    },
  },
  {
    id: 'S6-name-fracture', ...S('S6-name-fracture'),
    entersIn: st('arm extended, hand at the name', 'intact', 'formed', 0, 0),
    exitsIn: st('arm still extended', 'fragmenting', 'formed', 0.8, 0),
    causal: {
      cause: 'REACH', effect: 'LETTER_FRAGMENT', causeStart: 0, causeReadable: 0.3262, holdRatio: 0.25,
      effectOnset: 0.3262 + (1 - 0.3262) * 0.25, validationScope: 'REACH -> LETTER_FRAGMENT only',
      domain: { kind: 'action-local', action: 'REACH', startFrame: 0, endFrame: F(2.0) - 1 },
    },
    intent: {
      semanticEvent: 'the letterforms of the name break apart into characters that carry direction, speed and identity',
      dramaticIntention: 'the name must be destroyed as LANGUAGE, not merely faded, so that the loss is of meaning rather than of an image',
      primaryAttention: { target: 'the letterform breaking into characters', from: 'expression' },
      secondaryAttention: { target: 'the hand still extended at the wall', from: 'physical' },
      relation: 'expression-causes-physical',
      motion: {
        relation: 'expression-causes-physical',
        primary: { kind: 'reach', progress: 0.2, reason: 'the arm stays extended and almost still, so the breaking is not mistaken for the arm waving' },
        secondary: { kind: 'letter-fragment', progress: 0.9, reason: 'the fragmentation is the event, and it must be emitted as characters with momentum rather than as a dissolve' },
        hierarchy: HE,
        onset: { after: 'expression-readable' },
      },
      camera: { move: 'push-in', motivation: 'action-responsive', respondsTo: { kind: 'action', event: 'LETTER_FRAGMENT', readableAt: 0.25 }, beginsAt: 0.28, reason: 'the camera answers the breaking by moving into it, which is what makes the fracture feel received rather than observed' },
      beginsIn: 'name intact, hand at the wall', endsIn: 'name broken into a travelling character field',
      expectedAudienceReading: 'the name is being destroyed by the reach, and the pieces are language',
    },
  },
  {
    id: 'S7-room-withdraws', ...S('S7-room-withdraws'),
    entersIn: st('arm still extended', 'fragmenting', 'formed', 0.8, 0),
    exitsIn: st('arm lowering', 'gone', 'withdrawn', 1, 0.85),
    intent: {
      semanticEvent: 'the fragments of the name spread out and take over the material of the room, and the architecture comes apart with them',
      dramaticIntention: 'the space should be lost as a consequence of the name being lost, so that the two losses are one event',
      primaryAttention: { target: 'the character material taking over the walls', from: 'expression' },
      secondaryAttention: { target: 'the room losing its structure', from: 'expression' },
      relation: 'expression-only',
      motion: {
        relation: 'expression-only',
        primary: none('the person does not act again: the room leaves on its own'),
        secondary: { kind: 'structural-decay', progress: 0.9, reason: 'the takeover must destroy the architecture as structure, not merely darken it' },
        hierarchy: HE,
      },
      camera: { move: 'pull-out', motivation: 'consequence-responsive', respondsTo: { kind: 'consequence', event: 'ROOM_STRUCTURAL_DECAY', onsetsAt: 0.25 }, beginsAt: 0.25, reason: 'the camera withdraws as the room does, so the loss of space is felt as the viewer also losing the room' },
      beginsIn: 'room formed, name gone', endsIn: 'room withdrawn, a character field where the walls were',
      expectedAudienceReading: 'the room is going away, taking the space with it, and the person did not cause it directly',
    },
  },
  {
    id: 'S8-person-remains', ...S('S8-person-remains'),
    entersIn: st('arm lowering', 'gone', 'withdrawn', 1, 0.85),
    exitsIn: st('standing still, alone', 'gone', 'withdrawn', 1, 1),
    intent: {
      semanticEvent: 'the last characters leave the frame and only the person remains, standing, and the image holds',
      dramaticIntention: 'the film must end on the person rather than on the event, and must leave time for that to be felt',
      primaryAttention: { target: 'the person alone in the emptied space', from: 'physical' },
      relation: 'expression-only',
      motion: {
        relation: 'expression-only',
        primary: none('the person is still: there is nothing left to do'),
        secondary: { kind: 'density-dissolve', progress: 0.7, reason: 'the remaining field must disperse so that the space is empty and the person is what is left' },
        hierarchy: HE,
      },
      camera: { move: 'none', motivation: 'static', reason: 'the camera must stop when the movement stops, so the last image is held rather than pushed' },
      beginsIn: 'a character field where the room was', endsIn: 'the person alone, the image held',
      expectedAudienceReading: 'the person remains, and everything else is gone',
    },
  },
];

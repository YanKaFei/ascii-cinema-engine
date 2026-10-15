/**
 * R3 DIRECTOR PLAN — the NAME story, with a compiled VISUAL MODE TRANSITION on the semantic object NAME.
 *
 * ⚠ **THE STORY IS UNCHANGED.** Every performance window, causal pair, camera motivation and world-state
 * transition is inherited verbatim from the R2 plan. What R3 adds is the ability to say that the SAME object
 * changes representation — which is the capability this round exists to deliver.
 */
import { PLANNED as R2_PLANNED, FPS, TOTAL_FRAMES, SHOTS } from './r2-plan.mjs';

export { FPS, TOTAL_FRAMES, SHOTS };

const NAME = { x: 0, y: 1.30, z: -0.64 };

/**
 * ⚠ THE TRANSITION TIMING IS AUTHORED HERE, IN SHOT-RELATIVE HALF-OPEN FRAMES, AND THE COMPILER VALIDATES IT.
 *
 * S5-reach is 51 frames. The object begins as SCENE_ASCII wall text, enlarges into TYPOGRAPHIC_GRAPHIC over
 * frames **[8, 30)**, and then the topology resolves into GLYPH_FIELD over **[30, 48)**. The two windows are
 * contiguous, so the object is continuously changing representation rather than cutting between states.
 *
 * **Both ends are inside the shot**, so the runtime can always reach the transition's end — a rule the compiler
 * enforces.
 */
const TRANSITIONS = {
  'S5-reach': [
    {
      transitionId: 'NAME:scene-to-graphic',
      sourceObjectId: 'NAME',
      sourceMode: 'SCENE_ASCII',
      targetMode: 'TYPOGRAPHIC_GRAPHIC',
      /**
       * ⚠ PROMINENCE, NOT FRACTURE — and the window ends INSIDE its own shot.
       *
       * S5 is 51 frames (240..290). This link runs to absolute 288, so the compiler's rule that "a transition whose
       * end lies beyond its shot could never be reached" is satisfied. **The FRACTURE is not here**: its validated
       * cause is the S6 causal landmark, so it belongs to S6. Opening it in S5 is what made the LETTER_FRAGMENT
       * consequence precede its cause by fifty frames.
       */
      startFrame: 8,
      endFrame: 48,
      sourceAnchor: { x: NAME.x, y: NAME.y, z: NAME.z },
      destinationAnchor: { x: NAME.x, y: NAME.y, z: NAME.z + 0.24 },
      transitionMethod: 'TOPOLOGY_CARRIED_FRAGMENTATION',
      continuityPolicy: 'IDENTITY_AND_TOPOLOGY',
      fragmentCount: 96,
      seed: 20261,
    },
  ],
};

const S6_TRANSITIONS = [
  {
    /**
     * ⚠ THE FRACTURE OPENS AT ITS VALIDATED CAUSE.
     *
     * The S6 causal pair is `causeReadableFrame 19` -> absolute **310** and `effectOnsetFrame 29` -> absolute
     * **320** in the `action-local(REACH 0..59)` domain. Shot-relative frame 29 is where the effect is authored, so
     * the topology begins to resolve into the field THERE and not earlier.
     */
    transitionId: 'NAME:graphic-to-field',
    sourceObjectId: 'NAME',
    sourceMode: 'TYPOGRAPHIC_GRAPHIC',
    targetMode: 'GLYPH_FIELD',
    startFrame: 29,
    endFrame: 48,
    sourceAnchor: { x: NAME.x, y: NAME.y, z: NAME.z + 0.24 },
    destinationAnchor: { x: NAME.x + 0.10, y: NAME.y + 0.05, z: NAME.z + 0.78 },
    transitionMethod: 'TOPOLOGY_CARRIED_FRAGMENTATION',
    continuityPolicy: 'IDENTITY_AND_TOPOLOGY',
    fragmentCount: 96,
    seed: 20261,
  },
  {
    transitionId: 'NAME:field-continues-into-room',
    sourceObjectId: 'NAME',
    sourceMode: 'GLYPH_FIELD',
    targetMode: 'GLYPH_FIELD',
    startFrame: 48,
    endFrame: 59,
    sourceAnchor: { x: NAME.x + 0.10, y: NAME.y + 0.05, z: NAME.z + 0.14 },
    destinationAnchor: { x: NAME.x + 0.05, y: NAME.y - 0.10, z: NAME.z + 0.30 },
    transitionMethod: 'TOPOLOGY_CARRIED_FRAGMENTATION',
    continuityPolicy: 'IDENTITY_AND_TOPOLOGY',
    continuesTransitionId: 'NAME:graphic-to-field',
    fragmentCount: 85,
    seed: 20261,
  },
];

const ALL = { ...TRANSITIONS, 'S6-name-fracture': S6_TRANSITIONS };

export const PLANNED = R2_PLANNED.map((shot) => {
  const tr = ALL[shot.id];
  if (!tr) return shot;
  return { ...shot, intent: { ...shot.intent, modeTransitions: tr } };
});

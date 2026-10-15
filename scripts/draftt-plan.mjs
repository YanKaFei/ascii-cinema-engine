/**
 * DRAFT-T DIRECTOR PLAN — 「缝」 (SEAM)
 *
 * ⚠ **THIS FILM HAS NO HUMAN FIGURE.** That is a deliberate redirection, not an omission.
 *
 * The evidence behind it: the external review of the previous film returned
 * `HUMAN RECOGNITION — NOT VALIDATED`, and the standing audit showed the figure was built from box/capsule
 * primitives — **drawing its outline exposes the primitives rather than a body.** An ASCII character engine cannot
 * describe a person well, and continuing to spend the engine's strongest machinery on that is misallocation.
 *
 * This film is therefore about **characters**: a material that gathers, acquires structure, splits at a seam, breaks,
 * and re-settles into a new form. Every image is a grid of characters; the subject IS the character material.
 *
 * The engine is UNCHANGED. It already had everything needed:
 *   - one persistent object identity across the whole film (the strongest property the engine has)
 *   - validated representation changes: SCENE_ASCII -> TYPOGRAPHIC_GRAPHIC -> GLYPH_FIELD
 *   - real TrueType outline sampling for the typographic stage
 *   - a carrier state machine with preserved identities through fragmentation
 *   - compiled causal timing
 *
 * ⚠ WHAT IS REUSED AND WHAT IS NEW. The camera grammar, performance/semantic vocabulary, transition machinery and
 * causal contract are copied from the proven plan because the compiler validates them strictly — inventing new
 * vocabulary would fail compilation and prove nothing. **The dramatic content is entirely new and there is no
 * person anywhere in it.**
 */
import * as V3 from './v3-plan.mjs';

export const FPS = V3.FPS;
export const TOTAL_FRAMES = V3.TOTAL_FRAMES;

/** the same eight shot windows the compiler and the runtime already agree on */
export const SHOTS = V3.SHOTS;
const S = (id) => SHOTS.find((x) => x.id === id);

const none = (r) => ({ kind: 'none', progress: 0, reason: r });
const H = { primary: 1.0, secondary: 0.35, tertiary: 0.15 };
const HE = { primary: 0.2, secondary: 1.0, tertiary: 0.15 };
const HP = { primary: 1.0, secondary: 0.8, tertiary: 0.15 };

/**
 * WORLD STATE — the same five slots the runtime reads, but describing CHAR material, not a person.
 * `personState` is retained because the compiled WorldState contract has that field; it holds the state of the
 * **character material's own agent** (the field's self-organising behaviour), never a human.
 */
const st = (field, mark, room, fprog, rprog) => ({ personState: field, nameState: mark, roomState: room, nameProgress: fprog, roomProgress: rprog });

const NAME = { x: 0, y: 1.30, z: -0.64 };

export const PLANNED = [
  {
    id: 'S1-signal-to-space', ...S('S1-signal-to-space'),
    entersIn: st('dispersed marks', 'not yet written', 'not yet formed', 0, 0),
    exitsIn: st('gathered', 'intact, small', 'formed', 0, 0),
    intent: {
      semanticEvent: 'scattered characters drift in darkness and organise themselves into the walls of a space',
      dramaticIntention: 'the space should be understood as MADE OF writing rather than containing it — the material is the architecture',
      primaryAttention: { target: 'the character field becoming a wall', from: 'expression' },
      secondaryAttention: { target: 'the mark on the far wall', from: 'expression' },
      relation: 'expression-only',
      motion: {
        relation: 'expression-only',
        primary: none('no physical action: the material is organising itself'),
        secondary: { kind: 'assemble-from-field', progress: 0.9, reason: 'the field has no other origin than its own dispersal reversing' },
        hierarchy: HE,
      },
      camera: { move: 'push-in', motivation: 'subject-following', respondsTo: { kind: 'subject', event: 'FIELD_CONDENSATION', readableAt: 0.5 }, beginsAt: 0.28, reason: 'the camera follows the field condensing inward, so the space is entered while it is still being made' },
      beginsIn: 'scattered characters in darkness', endsIn: 'a formed architecture of characters',
      expectedAudienceReading: 'the space is made of characters that gathered',
    },
  },
  {
    id: 'S2-the-person', ...S('S2-the-person'),
    entersIn: st('gathered', 'intact, small', 'formed', 0, 0),
    exitsIn: st('structured', 'intact', 'formed', 0, 0),
    intent: {
      semanticEvent: 'the char material resolves into bands: a dense structural mass and, far behind it, a small legible mark',
      dramaticIntention: 'two orders of material appear at once — the bulk that is scenery and the small thing that carries meaning',
      primaryAttention: { target: 'the structural mass of characters', from: 'expression' },
      secondaryAttention: { target: 'the small mark on the far wall', from: 'expression' },
      relation: 'expression-only',
      motion: {
        relation: 'expression-only',
        primary: none('no action: this shot is the establishment of the two orders of material'),
        secondary: { kind: 'assemble-from-field', progress: 0.85, reason: 'the bands settle out of the field into stable structure' },
        hierarchy: HE,
      },
      camera: { move: 'crane', motivation: 'reveal', respondsTo: { kind: 'reveal', event: 'TWO_ORDERS_OF_MATERIAL', readableAt: 0.30 }, beginsAt: 0.32, reason: 'the camera cranes to disclose that the bulk and the mark occupy one space, which is the information the shot exists to give' },
      beginsIn: 'a directionless field', endsIn: 'a structured mass and a distant mark',
      expectedAudienceReading: 'there is a great deal of material, and one small piece of it means something',
    },
  },
  {
    id: 'S3-notice', ...S('S3-notice'),
    entersIn: st('structured', 'intact', 'formed', 0, 0),
    exitsIn: st('structure turned', 'intact, near-readable', 'formed', 0, 0),
    intent: {
      semanticEvent: 'the structure rotates in depth and the mark advances toward readability',
      dramaticIntention: 'the material acquires a FACE — the structure turns, and turning reveals that it has a reading side',
      primaryAttention: { target: 'the structure turning toward the viewer', from: 'expression' },
      secondaryAttention: { target: 'the mark thickening', from: 'expression' },
      relation: 'expression-only',
      motion: {
        relation: 'expression-only',
        primary: none('no physical action: the turn is a change of orientation, not an action'),
        secondary: { kind: 'assemble-from-field', progress: 0.7, reason: 'the near face of the structure resolves as the far material recedes' },
        hierarchy: HE,
      },
      camera: { move: 'truck', motivation: 'subject-following', respondsTo: { kind: 'subject', event: 'STRUCTURE_TURNS', readableAt: 0.20 }, beginsAt: 0.20, reason: 'the camera slides with the turning structure, keeping the reading face in view as it comes round' },
      beginsIn: 'a structure seen flat', endsIn: 'a structure with a reading face',
      expectedAudienceReading: 'the material has turned, and it is turning toward being read',
    },
  },
  {
    id: 'S4-approach', ...S('S4-approach'),
    entersIn: st('structure turned', 'intact, near-readable', 'formed', 0, 0),
    exitsIn: st('close', 'intact', 'formed', 0, 0),
    intent: {
      semanticEvent: 'the camera crosses the distance to the structure, and the character bands slide against each other producing parallax',
      dramaticIntention: 'the material is shown to have real depth — the bands are at different distances and moving past them changes what occludes what',
      primaryAttention: { target: 'the parallax between the character bands', from: 'expression' },
      secondaryAttention: { target: 'the mark still ahead', from: 'expression' },
      relation: 'expression-only',
      motion: {
        relation: 'expression-only',
        primary: none('no physical action: the depth is revealed by the camera crossing it'),
        secondary: { kind: 'assemble-from-field', progress: 0.6, reason: 'the bands settle into their final relative depths as the camera passes them' },
        hierarchy: HE,
      },
      camera: { move: 'truck', motivation: 'subject-following', respondsTo: { kind: 'subject', event: 'BAND_PARALLAX', readableAt: 0.0 }, beginsAt: 0.0, reason: 'a low tracking camera crosses the bands so their depth separation produces one continuous parallax' },
      beginsIn: 'a structure at a distance', endsIn: 'a structure close, bands in depth',
      expectedAudienceReading: 'the material has depth; crossing it changes what is in front',
    },
  },
  {
    id: 'S5-reach', ...S('S5-reach'),
    entersIn: st('close', 'intact', 'formed', 0, 0),
    exitsIn: st('seam open', 'intact', 'formed', 0, 0),
    intent: {
      semanticEvent: 'the structure opens along a seam: two character bands separate and the gap between them widens',
      dramaticIntention: 'the break must be understood as coming from the material OWN structure — the seam is where the bands do not meet, so the separation is the material discovering a fault it already had',
      primaryAttention: { target: 'the widening seam between the bands', from: 'physical' },
      secondaryAttention: { target: 'the mark the seam is opening toward', from: 'expression' },
      relation: 'physical-causes-expression',
      motion: {
        relation: 'physical-causes-expression',
        primary: { kind: 'reach', progress: 0.9, reason: 'the seam opens deliberately and the opening must be legible as the structure separating along its own joint' },
        secondary: { kind: 'local-field-response', progress: 0.5, reason: 'characters along the seam displace before the bands move, so the fault is visible in the material first' },
        hierarchy: HP,
        onset: { after: 'reach-readable' },
      },
      camera: { move: 'push-in', motivation: 'anticipatory', respondsTo: { kind: 'action', event: 'SEAM_OPENS', readableAt: 0.62 }, beginsAt: 0.30, reason: 'the camera moves in well before the seam is wide, so the audience is already close when the structure gives' },
      beginsIn: 'the structure intact', endsIn: 'the structure open along a seam',
      expectedAudienceReading: 'the material is separating along a joint, and the separation is about to become a break',
    },
  },
  {
    id: 'S6-name-fracture', ...S('S6-name-fracture'),
    entersIn: st('seam open', 'intact', 'formed', 0, 0),
    exitsIn: st('broken', 'fragmenting', 'decaying', 0.8, 0.2),
    causal: {
      cause: 'REACH', effect: 'LETTER_FRAGMENT', causeStart: 0, causeReadable: 0.3262, holdRatio: 0.25,
      effectOnset: 0.3262 + (1 - 0.3262) * 0.25,
      validationScope: 'SEAM -> LETTER_FRAGMENT; the authored cause is the seam giving way, measured over the same action window the engine already validates',
      /** the domain is an OBJECT, and the cause is measured over the action, never over the shot span */
      domain: { kind: 'action-local', action: 'REACH', startFrame: 0, endFrame: 59 },
    },
    intent: {
      semanticEvent: 'the seam gives way: the break starts where the bands separated and travels outward through the character topology',
      dramaticIntention: 'the break must be seen to ORIGINATE at the seam and PROPAGATE, so its shape is caused rather than random',
      primaryAttention: { target: 'the break originating at the seam', from: 'physical' },
      secondaryAttention: { target: 'the structure losing its span', from: 'expression' },
      relation: 'physical-causes-expression',
      motion: {
        relation: 'physical-causes-expression',
        primary: { kind: 'reach', progress: 1.0, reason: 'the seam reaches its limit and the material follows it, so the failure is the consequence of the opening' },
        secondary: { kind: 'topology-carried-fragmentation', progress: 1.0, reason: 'each character is born from its own topology cell, so the break carries the structure rather than dispersing it' },
        hierarchy: HP,
        onset: { after: 'reach-readable' },
      },
      camera: { move: 'push-in', motivation: 'action-responsive', respondsTo: { kind: 'action', event: 'LETTER_FRAGMENT', readableAt: 0.25 }, beginsAt: 0.28, reason: 'the camera answers the breaking by moving into it, which makes the fracture received rather than observed' },
      beginsIn: 'a seam open in a standing structure', endsIn: 'a structure broken along its seam',
      expectedAudienceReading: 'the seam gave way, and the break spread out from where it opened',
    },
  },
  {
    id: 'S7-room-withdraws', ...S('S7-room-withdraws'),
    entersIn: st('broken', 'fragmenting', 'decaying', 0.8, 0.2),
    exitsIn: st('thin field', 'field', 'gone', 1, 1),
    intent: {
      semanticEvent: 'the broken characters reflow: the pieces cease to be a structure and become a field again, which then thins as the space empties',
      dramaticIntention: 'the end of the structure is not a loss but a change of order — the same characters stop being architecture and become weather',
      primaryAttention: { target: 'the broken characters re-flowing as a field', from: 'expression' },
      secondaryAttention: { target: 'the space emptying around them', from: 'expression' },
      relation: 'expression-only',
      motion: {
        relation: 'expression-only',
        /**
         * ⚠ THE PRIMARY MUST BE A **CANONICAL** EXPRESSION. The first draft used `none` as primary with
         * `topology-carried-fragmentation` as the secondary, and the compiler refused: *"a supporting expression
         * cannot carry a shot alone."* The vocabulary is explicit — only `structural-decay`, `letter-fragment`,
         * `assemble-from-field` and `density-dissolve` may lead. The intent here is the structure losing its order,
         * which is exactly `structural-decay`.
         */
        primary: { kind: 'structural-decay', progress: 1.0, reason: 'the structure stops being a structure: the same characters lose their joint and become a loose field, which is the order change this shot exists to show' },
        secondary: { kind: 'local-field-response', progress: 0.6, reason: 'characters near each former joint drift first, so the loss of order is seen to start at the seams' },
        hierarchy: HE,
      },
      camera: { move: 'pull-out', motivation: 'consequence-responsive', respondsTo: { kind: 'consequence', event: 'STRUCTURE_LOSES_ORDER', onsetsAt: 0.25 }, beginsAt: 0.25, reason: 'the camera withdraws as the structure does, so the loss of order is felt as the viewer also losing the structure' },
      beginsIn: 'a broken structure', endsIn: 'a thinning field in an emptied space',
      expectedAudienceReading: 'the same characters are still there, but they are no longer a building',
    },
  },
  {
    id: 'S8-person-remains', ...S('S8-person-remains'),
    entersIn: st('thin field', 'field', 'gone', 1, 1),
    exitsIn: st('quiet', 'a single line', 'gone', 1, 1),
    intent: {
      semanticEvent: 'the field settles until nothing is left but a single readable line of characters, held',
      dramaticIntention: 'the film must end on the smallest possible legible thing — everything the material was has reduced to one line that is still readable, which is the whole point of an ASCII film',
      primaryAttention: { target: 'the single remaining line', from: 'expression' },
      secondaryAttention: { target: 'the emptiness around it', from: 'expression' },
      relation: 'expression-only',
      motion: {
        relation: 'expression-only',
        primary: none('the movement has stopped: this is the hold'),
        secondary: { kind: 'assemble-from-field', progress: 1.0, reason: 'the last characters settle into a straight readable line' },
        hierarchy: HE,
      },
      camera: { move: 'none', motivation: 'static', reason: 'the camera must stop when the movement stops, so the last image is held rather than pushed' },
      beginsIn: 'a thinning field', endsIn: 'one legible line, held',
      expectedAudienceReading: 'all of that material has come down to one line, and it can still be read',
    },
  },
];


/**
 * ⚠ VISUAL LAYERS — DECLARED, BECAUSE THE CONTRACT GUARD REQUIRES IT.
 *
 * The first render attempt failed with
 *   `LayerConsumptionError: layer 'SCENE_LAYER' was required but is not declared in the intent`
 * which is the engine refusing to render a shot whose layers were never authored. **Disabling the subject layer at
 * runtime was the wrong fix** — the honest fix is to declare the three layers this film actually has.
 *
 * **`SUBJECT_LAYER` IS ABSENT BY DESIGN.** This film has no human figure, so the layer that draws the figure is not
 * declared at all. It is not hidden, not blanked at runtime, and not `visible:false` — it does not exist in this
 * film's representation.
 */
const DRAFT_LAYERS = (opts) => {
  const { note, negSpace = null, typeVisible = true, sceneFrames, typeFrames } = opts;
  const layers = [
    { layerId: 'SCENE_LAYER', subjectId: 'room', drawsSubjects: ['room', 'surface'],
      representationMode: 'SCENE_ASCII', materialId: 'architecture', priority: 10, visible: true, timing: sceneFrames },
    /**
     * ⚠ `SUBJECT_LAYER` MUST BE DECLARED HERE, OR EVERYTHING DRAWN INTO IT IS DISCARDED.
     *
     * **A layer that is pushed to the compositor but never declared in the shot's visual intent contributes
     * nothing.** That is what the engine's contract means by "declared", and it cost a full debugging cycle: the
     * fracture material was drawn into `cvSubject` on every frame, and the layer ledger showed the layer not
     * existing at all. A flood test — filling all 28,800 cells with `@` — left the output **byte-identical**,
     * which is what proved the write path was dead rather than merely mistuned.
     *
     * This slot is the engine's slot for the film's subject; here the subject is the character material itself.
     */
    { layerId: 'SUBJECT_LAYER', subjectId: 'material', drawsSubjects: ['material'],
      representationMode: 'SCENE_ASCII', materialId: 'architecture', priority: 40, visible: true, timing: sceneFrames },
    { layerId: 'TYPOGRAPHY_LAYER', subjectId: 'name', drawsSubjects: ['name'],
      representationMode: 'TYPOGRAPHIC_GRAPHIC', materialId: 'text', priority: 60, visible: typeVisible, timing: typeFrames },
    { layerId: 'NEGATIVE_SPACE_MASK', subjectId: 'negative-space', drawsSubjects: ['atmosphere'],
      representationMode: 'NEGATIVE_SPACE', materialId: 'atmosphere', priority: 0,
      visible: !!negSpace, clearsSubjects: negSpace ? negSpace.targets : [],
      timing: negSpace ? { fromFrame: negSpace.fromFrame, toFrame: negSpace.toFrame } : { fromFrame: 0, toFrame: 1 } },
  ];
  return { compositionNote: note, layers };
};

const DRAFT_NOTES = {
  'S1-signal-to-space': 'scattered characters gather into architectural courses; the space is made of writing',
  'S2-the-person': 'two orders of material: a dense structural mass and, far behind it, one small legible mark',
  'S3-notice': 'the structure turns and acquires a reading face',
  'S4-approach': 'the character bands sit at different depths; crossing them produces the parallax',
  'S5-reach': 'the seam between two bands opens; negative space is opened where the bands separate so the gap reads',
  'S6-name-fracture': 'the seam gives way and the break travels outward through the character topology',
  'S7-room-withdraws': 'the broken characters lose their joint and become a thinning field; the space empties',
  'S8-person-remains': 'the field settles to one readable line, held',
};

/**
 * ⚠ REPRESENTATION CHANGE — THE MECHANISM THE FILM WAS MISSING.
 *
 * Until now DRAFT-T had density but **no material transformation**: the same characters simply sat in place while
 * particles drifted. V1 study C is the strongest thing this project has produced partly because its material
 * genuinely changes state (atmosphere -> text). The engine already implements that, and the compiler validates it:
 *
 *     SCENE_ASCII  ->  TYPOGRAPHIC_GRAPHIC  ->  GLYPH_FIELD
 *
 * with the OBJECT persisting across all three. `modeTransitions` is the intent-level declaration; the compiler
 * preserves it onto the compiled spec and the runtime consumes `spec.modeTransitions`.
 *
 * THE TIMING IS NOT INVENTED. `startFrame: 29` is exactly this film's authored causal landmark for S6 — the
 * compiler re-derived `causeReadable 19 -> absolute 310` and `effectOnset 29 -> absolute 320` from the plan itself,
 * and this film's plan already uses frame 29 in its `action-local(REACH 0..59)` domain. The topology therefore
 * begins resolving into the field AT THE VALIDATED CAUSE, not at an arbitrary frame.
 *
 * `fragmentCount: 96` matches the carrier population the film already keeps identities for.
 */
const S6_MODE_TRANSITIONS = [
  {
    transitionId: 'MATERIAL:graphic-to-field',
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
];

const DRAFT_TRANSITIONS = { 'S6-name-fracture': S6_MODE_TRANSITIONS };

export const PLANNED_WITH_LAYERS = PLANNED.map((shot) => {
  const span = shot.frameEnd - shot.frameStart + 1;
  const neg = shot.id === 'S5-reach' ? { fromFrame: 10, toFrame: span - 6, targets: ['room', 'atmosphere'] }
    : shot.id === 'S6-name-fracture' ? { fromFrame: 4, toFrame: span - 4, targets: ['room', 'atmosphere'] }
    : shot.id === 'S8-person-remains' ? { fromFrame: 6, toFrame: span, targets: ['room', 'atmosphere'] } : null;
  const tr = DRAFT_TRANSITIONS[shot.id];
  return { ...shot, intent: { ...shot.intent, ...(tr ? { modeTransitions: tr } : {}), visual: DRAFT_LAYERS({
    note: DRAFT_NOTES[shot.id],
    negSpace: neg,
    sceneFrames: { fromFrame: 0, toFrame: span },
    typeFrames: { fromFrame: 0, toFrame: span },
  }) } };
});

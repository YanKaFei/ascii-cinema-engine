/**
 * R2 DIRECTOR PLAN — the V3 NAME plan, with the FOUR-LAYER representation contract declared per shot.
 *
 * ⚠ **THE NARRATIVE IS UNCHANGED.** Every performance window, causal pair, camera motivation and world-state
 * transition is inherited verbatim from `v3-plan.mjs`. What R2 adds is the director's ability to say, per shot,
 * what each of the four layers IS — which is the capability this round exists to deliver.
 */
import * as V3 from './v3-plan.mjs';

/** the four layers, as a function of the shot's visual task */
const LAYERS = (opts) => {
  const { note, subjectMode = 'EDGE_ASCII', negSpace = null, sceneVisible = true, typeVisible = true,
          sceneFrames, subjectFrames, typeFrames } = opts;
  /**
   * ⚠ EVERY LAYER DECLARES ITS COMPILED FRAME INTERVAL. The scene and typography intervals are authored per shot
   * so that a layer's presence is a DECISION with a window rather than an unconditional draw — which is what makes
   * the timing path testable end to end.
   */
  const layers = [
    { layerId: 'SCENE_LAYER', subjectId: 'room', drawsSubjects: ['room', 'surface'], representationMode: 'SCENE_ASCII', materialId: 'architecture', priority: 10, visible: sceneVisible, timing: sceneFrames },
    { layerId: 'SUBJECT_LAYER', subjectId: 'person', drawsSubjects: ['person'], representationMode: subjectMode, materialId: 'figure', priority: 40, visible: true, timing: subjectFrames },
    { layerId: 'TYPOGRAPHY_LAYER', subjectId: 'name', drawsSubjects: ['name'], representationMode: 'TYPOGRAPHIC_GRAPHIC', materialId: 'text', priority: 60, visible: typeVisible, timing: typeFrames },
  ];
  /**
   * ⚠ THE MASK IS THE ERASER AND THE ATMOSPHERE IS WHAT IT DRAWS. `subjectId` names the role; `drawsSubjects`
   * names the content, which is what `clearsSubjects` is validated against.
   */
  /**
   * ⚠ THE MASK NOW CARRIES A COMPILED FRAME INTERVAL, and that is the R2.1 repair.
   *
   * R2 declared and compiled `LayerTiming` and the compositor never read it, so a mask whose window had ended
   * still cleared cells. Every layer here now states its interval in **shot-relative half-open frames**, and when
   * a shot opens no negative space the mask is declared with an EMPTY interval `[0, 0)` and `visible: false`,
   * which is the honest statement of "this shot has no negative space" rather than an absent field.
   */
  layers.push({
    layerId: 'NEGATIVE_SPACE_MASK', subjectId: 'negative-space', drawsSubjects: ['atmosphere'],
    representationMode: 'NEGATIVE_SPACE', materialId: 'atmosphere', priority: 0,
    visible: !!negSpace, clearsSubjects: negSpace ? negSpace.targets : [],
    timing: negSpace ? { fromFrame: negSpace.fromFrame, toFrame: negSpace.toFrame } : { fromFrame: 0, toFrame: 1 },
  });
  return { compositionNote: note, layers };
};

const NOTES = {
  'S1-signal-to-space': 'a light architectural frame arrives out of the atmosphere; no figure yet, so the space must carry the shot alone',
  'S2-the-person': 'the room recedes to ground and the figure becomes the subject; the NAME sits behind both, small but legible',
  'S3-notice': 'the figure is drawn by its contour so that a small turn reads; architecture thinned so the head has room',
  'S4-approach': 'the floor structure gives the step parallax while the figure keeps contour priority',
  'S5-reach': 'the region between the hand and the NAME is opened as negative space, so the relationship has air',
  'S6-name-fracture': 'the NAME is the only graphic with full weight; the architecture has withdrawn and the subject stays in contour',
  'S7-room-withdraws': 'the space is emptied by the mask as the room leaves; the figure is what remains legible',
  'S8-person-remains': 'typography is gone, architecture is gone, and only the subject\u2019s contour and the atmosphere remain',
};

export const PLANNED = V3.PLANNED.map((shot) => {
  const id = shot.id;
  /**
   * The mask windows are expressed in SHOT-RELATIVE frames and are the authored scope of the negative space:
   *   S5-reach          the region opens as the hand travels, and closes before the cut
   *   S6-name-fracture  the region is open through the break
   *   S8-person-remains the region opens for the final hold
   * Every other shot opens none, and says so with `visible: false`.
   */
  const span = shot.frameEnd - shot.frameStart + 1;
  const S5 = { fromFrame: 10, toFrame: span - 6 };
  const S6 = { fromFrame: 4, toFrame: span - 4 };
  const S8 = { fromFrame: 6, toFrame: span };
  const opts = id === 'S5-reach'
    ? { note: NOTES[id], negSpace: { fromFrame: S5.fromFrame, toFrame: S5.toFrame, targets: ['room', 'atmosphere'] }, subjectFrames: { fromFrame: 0, toFrame: span } }
    : id === 'S6-name-fracture'
      ? { note: NOTES[id], negSpace: { fromFrame: S6.fromFrame, toFrame: S6.toFrame, targets: ['room', 'atmosphere'] }, subjectFrames: { fromFrame: 0, toFrame: span } }
      : id === 'S8-person-remains'
        ? { note: NOTES[id], negSpace: { fromFrame: S8.fromFrame, toFrame: S8.toFrame, targets: ['room', 'atmosphere'] }, subjectFrames: { fromFrame: 0, toFrame: span } }
        : { note: NOTES[id], subjectFrames: { fromFrame: 0, toFrame: span } };
  return { ...shot, intent: { ...shot.intent, visual: LAYERS(opts) } };
});

export const FPS = V3.FPS;
export const TOTAL_FRAMES = V3.TOTAL_FRAMES;
export const SHOTS = V3.SHOTS;

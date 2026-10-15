/**
 * R3.6 DIRECTOR PLAN — the R3 plan plus a declared TYPOGRAPHY COMPOSITION CONTRACT on the shot that needs
 * readable typography.
 */
import { PLANNED as R3_PLANNED, FPS, TOTAL_FRAMES, SHOTS } from './r3-plan.mjs';
export { FPS, TOTAL_FRAMES, SHOTS };

/**
 * ⚠ THE READABILITY FIX, EXPRESSED AS DIRECTION RATHER THAN AS A RENDER CONSTANT.
 *
 * R3.5 composed the word inside a hardcoded 62 % x 44 % of the frame. Measured: a letter stroke resolved to
 * **1.8 output cells**, and a directional ASCII glyph cannot describe a stroke thinner than about three cells —
 * so the letterforms were present but could not read as `N A M E`.
 *
 * The contract states the readable window and the occupancy the word may take INSIDE it. At 92 % x 78 % the
 * letterforms are 94 cells tall and each macro stroke is ~3.6 cells, which is what lets the ASCII material
 * describe a stroke instead of dissolving it. **Outside the window the word returns to its environmental size.**
 *
 * The occupancy window is authored in SHOT-RELATIVE frames and derived from the compiled transitions:
 * the prominence link opens at shot frame 8 and the causal fracture onset is shot frame 29, so the word is given
 * a readable window that ENDS at the validated fragmentation onset — the audience must perceive the word before
 * it breaks, and not one frame after it should have begun breaking.
 */
const NAME_COMPOSITION = {
  sourceObjectId: 'NAME',
  layoutPolicy: 'FIT',
  /** outside the readable window the word belongs to the environment */
  screenRegion: { x0: 0.19, y0: 0.28, x1: 0.81, y1: 0.72 },
  readabilityInterval: {
    fromFrame: 8,
    toFrame: 29,
    occupancy: { width: 0.92, height: 0.78 },
  },
  visualPriority: 'PRIMARY',
  protectedSubjectAnchors: [{ subjectId: 'PERSON', anchorId: 'hand' }],
  occlusionPolicy: 'PROTECT_SUBJECTS',
};

export const PLANNED = R3_PLANNED.map((shot) => {
  if (shot.id !== 'S5-reach') return shot;
  return { ...shot, intent: { ...shot.intent, typographyComposition: NAME_COMPOSITION } };
});

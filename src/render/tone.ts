/**
 * Tone mapping — the single shared definition of how engine luminance becomes a
 * display value.
 *
 * The engine's final decision is one number per character cell: `ink` in 0..1,
 * already exposed and clipped, already quantized onto a glyph. Turning that into a
 * pixel value must use the SAME curve in the ffmpeg verification chain and in the
 * Remotion render, or the stills will not predict the film.
 *
 * Curve choice: a plain gamma lift (1/1.85). A previous revision multiplied by
 * 1.8, which clipped anything at ink > 0.55 to pure white and destroyed the faint
 * marks that carry the whole visual language.
 */

export const INK_GAMMA = 1 / 1.85;

/** Map engine ink (0..1) to a display value (0..255). */
export function inkToDisplayByte(ink: number): number {
  if (ink <= 0) return 0;
  if (ink >= 1) return 255;
  return Math.round(Math.pow(ink, INK_GAMMA) * 255);
}

/** Map engine ink (0..1) to a display value (0..1). */
export function inkToDisplayUnit(ink: number): number {
  if (ink <= 0) return 0;
  if (ink >= 1) return 1;
  return Math.pow(ink, INK_GAMMA);
}

/** Apply the shared curve to a whole ink plane in place, producing RGB triples. */
export function writeCell(
  out: Uint8Array | Uint8ClampedArray,
  offset: number,
  ink: number,
): void {
  const v = inkToDisplayByte(ink);
  out[offset] = v;
  out[offset + 1] = v;
  out[offset + 2] = v;
}

/**
 * Filmic highlight shoulder.
 *
 * The problem this solves was measured, not assumed. On the authored films the RAW luminance
 * field is ~95% below 0.1 with a bright tail reaching ~3.0, and the grade
 * `(lum - blackPoint) * exposure` (blackPoint 0.085, exposure 1.85) therefore pushes everything
 * above luminance ~0.62 to a hard clip at 1.0. The result was that 60-64% of lit cells graded to
 * near-white: the image was a white mass, and lifting the glyph density ceiling only made it a
 * DENSER white mass, because a clipped highlight cannot express a gradient no matter which
 * character it is drawn with.
 *
 * A straight gamma cannot fix a clipped highlight — it only redistributes values that are still
 * inside the range. What is needed is a SHOULDER: below `knee` the response is linear (so the
 * midtones the field actually contains survive), and above it the curve rolls off asymptotically
 * toward white, so a bright tail compresses into distinguishable near-whites instead of a plateau.
 *
 *   x <= knee :  y = x
 *   x >  knee :  y = knee + (1 - knee) * (1 - exp(-(x - knee) / (1 - knee)))
 *
 * The curve is monotonic, passes through the origin and through (1, 1), and is C1-continuous at
 * the knee, so it introduces no banding at the join.
 */
export function filmicShoulder(x: number, knee = 0.55): number {
  if (x <= 0) return 0;
  const k = Math.min(0.95, Math.max(0.05, knee));
  if (x <= k) return x;
  const t = (x - k) / (1 - k);
  return k + (1 - k) * (1 - Math.exp(-t));
}

/** Map engine ink (0..1) to a display value (0..255) through the shoulder and gamma. */
export function inkToDisplayByteFilmic(ink: number, knee = 0.55): number {
  if (ink <= 0) return 0;
  if (ink >= 1) return 255;
  return Math.round(Math.pow(filmicShoulder(ink, knee), INK_GAMMA) * 255);
}

/**
 * RhythmPlanner — what is the film's shape over time?
 *
 * Rhythm is a GLOBAL layer, not per-shot easing. The planner emits four curves over the
 * whole film, and the ShotPlanner cuts shots to fit them. That ordering matters: if shots
 * chose their own durations and curves were derived afterwards, rhythm would be a
 * description of the film rather than a decision about it.
 *
 * Four curves, deliberately distinct:
 *   energy               overall intensity; drives shot LENGTH and camera amounts
 *   tension              unresolved pressure; peaks BEFORE energy does
 *   informationDensity   how much the audience is asked to read; drives glyph density
 *   motionDensity        how much is moving; drives camera velocity and particle motion
 *
 * Tension leading energy is not decoration: it is what makes an audience feel that
 * something is coming. A film whose tension tracks its energy exactly feels inert.
 */

import type { Curve, SemanticFeatures } from "../types.js";
import type { RhythmPlanOutput } from "../types.js";
import { arcIntensityAt } from "./DramaturgyPlanner.js";

/** How far ahead of energy the tension peak sits, by arc shape. */
const TENSION_LEAD: Record<SemanticFeatures["arcShape"], number> = {
  rise: 0.08,
  fall: 0.0,
  wave: 0.05,
  plateau: 0.0,
  collapse: 0.12,
  spiral: 0.06,
};

/** How much the information density lags energy: reading takes time. */
const INFORMATION_LAG: Record<SemanticFeatures["arcShape"], number> = {
  rise: 0.1,
  fall: 0.05,
  wave: 0.02,
  plateau: 0.08,
  collapse: 0.14,
  spiral: 0.06,
};

export function planRhythm(features: SemanticFeatures, duration: number): RhythmPlanOutput {
  const N = 24; // keyframe resolution; enough for smoothness, few enough to read in a report
  const energy: Curve = [];
  const tension: Curve = [];
  const informationDensity: Curve = [];
  const motionDensity: Curve = [];

  const amplitude = 0.45 + 0.55 * clamp01(features.violence + features.resolutionPressure * 0.5);

  for (let i = 0; i <= N; i++) {
    const t = i / N;

    const e = clamp01(arcIntensityAt(features.arcShape, t) * amplitude + (1 - amplitude) * 0.35);
    // A plateau film has no climax, but it is not a constant: the frame's arrangement
    // changes even though its content does not. Without this the film's four curves were
    // flat lines within tolerance of each other and the rhythm layer did nothing.
    const plateauRipple =
      features.arcShape === "plateau" ? 0.5 + 0.5 * Math.sin(t * Math.PI * 3) : 1;
    energy.push([round(t), round(e)]);

    // Tension peaks earlier than energy.
    const tt = clamp01(t + TENSION_LEAD[features.arcShape]);
    const tensionBase = arcIntensityAt(features.arcShape, tt);
    // A plateau film has low tension throughout: nothing is being withheld.
    const tensionScale = features.arcShape === "plateau" ? 0.45 : 1;
    tension.push([
      round(t),
      round(clamp01(tensionBase * amplitude * tensionScale * (features.arcShape === "plateau" ? plateauRipple : 1))),
    ]);

    // Information lags energy and is gated by literalism: an abstract film asks for less
    // reading, so its information curve is lower even when its energy is high.
    const ti = clamp01(t - INFORMATION_LAG[features.arcShape]);
    const infoBase = arcIntensityAt(features.arcShape, ti);
    informationDensity.push([
      round(t),
      round(
        clamp01(
          infoBase * (0.35 + 0.55 * features.literalism) * amplitude * (features.arcShape === "plateau" ? plateauRipple : 1),
        ),
      ),
    ]);

    // Motion: a wave film moves most at the extremes of its cycle; a plateau film moves
    // least overall because nothing is travelling anywhere.
    const motionBase =
      features.arcShape === "wave"
        ? 0.5 + 0.5 * Math.abs(Math.sin(t * Math.PI * 2))
        : features.arcShape === "plateau"
          ? // A plateau film moves LITTLE, but not never: the arrangement changes even
            // though the content does not. The ripple is what keeps this a curve.
            0.3 + 0.45 * plateauRipple
          : arcIntensityAt(features.arcShape, t);
    const tempoScale: Record<SemanticFeatures["tempo"], number> = {
      slow: 0.55,
      measured: 0.75,
      urgent: 1.0,
      erratic: 1.0,
    };
    motionDensity.push([
      round(t),
      round(clamp01(motionBase * tempoScale[features.tempo] * (0.5 + 0.5 * features.violence))),
    ]);
  }

  const rationale =
    `Arc "${features.arcShape}" at ${features.tempo} tempo over ${duration.toFixed(0)}s. ` +
    `Tension leads energy by ${(TENSION_LEAD[features.arcShape] * 100).toFixed(0)}% so the audience is ahead of the image; ` +
    `information lags by ${(INFORMATION_LAG[features.arcShape] * 100).toFixed(0)}% because reading takes time. ` +
    (features.arcShape === "plateau"
      ? "As a film about a state, tension is held low throughout: nothing is being withheld from the audience."
      : `Peak energy is scaled by violence ${features.violence.toFixed(2)} and resolution pressure ${features.resolutionPressure.toFixed(2)}.`);

  return { energy, tension, informationDensity, motionDensity, rationale };
}

/** Sample a curve at t, with smooth interpolation. */
export function sampleCurve(curve: Curve, t: number): number {
  if (curve.length === 0) return 0;
  const x = clamp01(t);
  if (x <= curve[0]![0]) return curve[0]![1];
  const lastKey = curve[curve.length - 1]!;
  if (x >= lastKey[0]) return lastKey[1];
  for (let i = 0; i < curve.length - 1; i++) {
    const [a, av] = curve[i]!;
    const [b, bv] = curve[i + 1]!;
    if (x >= a && x <= b) {
      const u = (x - a) / Math.max(1e-9, b - a);
      const e = u * u * (3 - 2 * u);
      return av + (bv - av) * e;
    }
  }
  return lastKey[1];
}

/**
 * Average of a curve over [from, to]. Used to give a shot ONE rhythm value even though the
 * film's curve varies across it.
 */
export function averageCurve(curve: Curve, from: number, to: number): number {
  const N = 12;
  let sum = 0;
  for (let i = 0; i < N; i++) {
    const t = from + ((i + 0.5) / N) * (to - from);
    sum += sampleCurve(curve, t);
  }
  return sum / N;
}

function round(v: number): number {
  return Number(v.toFixed(4));
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export { TENSION_LEAD, INFORMATION_LAG };

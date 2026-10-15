/** Easing curves. Pure functions of a normalized 0..1 progress. */

import type { Easing } from "../domain/schema.js";
import { clamp01 } from "./math.js";

export function ease(kind: Easing, t: number): number {
  const x = clamp01(t);
  switch (kind) {
    case "linear":
      return x;
    case "easeIn":
      return x * x;
    case "easeOut":
      return 1 - (1 - x) * (1 - x);
    case "easeInOut":
      return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
    case "easeOutExpo":
      return x >= 1 ? 1 : 1 - Math.pow(2, -10 * x);

    // ---- cinematic families -------------------------------------------------
    // Every one satisfies f(0) = 0 and f(1) = 1 exactly, so they are drop-in replacements.

    case "easeInCubic":
      return x * x * x;
    case "easeOutCubic":
      return 1 - Math.pow(1 - x, 3);
    case "easeInOutCubic":
      return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
    case "easeInQuart":
      return x * x * x * x;
    case "easeOutQuint":
      return 1 - Math.pow(1 - x, 5);
    /**
     * OVERSHOOT. Passes the target and comes back.
     *
     * The constant 1.70158 is the standard "back" overshoot; it sends the curve about 10% past 1
     * before returning. This is the curve that makes a camera move feel like it has WEIGHT — a heavy
     * object carried by a person does not stop dead on its mark, and a hard `easeOut` is what makes
     * motion read as a machine.
     */
    case "easeOutBack": {
      const c1 = 1.70158;
      const c3 = c1 + 1;
      return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
    }
    case "easeInOutBack": {
      const c2 = 1.70158 * 1.525;
      return x < 0.5
        ? (Math.pow(2 * x, 2) * ((c2 + 1) * 2 * x - c2)) / 2
        : (Math.pow(2 * x - 2, 2) * ((c2 + 1) * (x * 2 - 2) + c2) + 2) / 2;
    }
    /**
     * SETTLE. Decaying oscillation about the target.
     *
     * This is the FOLLOW-THROUGH curve: a mass arrives, passes, and rocks to rest. It is the
     * difference between "the camera reached its mark" and "the camera came to rest". Scaled so the
     * excursion decays to well under a pixel by t=1, and clamped to exactly 1 at the end so it never
     * leaves the move unfinished.
     */
    case "easeOutElastic": {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      const c4 = (2 * Math.PI) / 3;
      return Math.pow(2, -10 * x) * Math.sin((x * 10 - 0.75) * c4) + 1;
    }
    /** SETTLE, non-oscillating: arrival with a few diminishing contacts. */
    case "easeOutBounce": {
      const n1 = 7.5625;
      const d1 = 2.75;
      if (x < 1 / d1) return n1 * x * x;
      if (x < 2 / d1) {
        const t = x - 1.5 / d1;
        return n1 * t * t + 0.75;
      }
      if (x < 2.5 / d1) {
        const t = x - 2.25 / d1;
        return n1 * t * t + 0.9375;
      }
      const t = x - 2.625 / d1;
      return n1 * t * t + 0.984375;
    }

    default:
      return x;
  }
}

/**
 * ANTICIPATION — the wind-up before a move.
 *
 * Wraps any base curve with a small opposite-direction excursion in the first `amount` of the move,
 * so the subject pulls back before it goes. This is the single strongest cue that motion was
 * intended rather than computed, and it cannot be expressed by any easing curve alone because it is
 * not a shape of progress; it is a departure from the target direction.
 *
 * `f(0) = 0` and `f(1) = 1` are preserved, and the anticipation never exceeds `amount`, so a caller
 * can bound how far the wind-up travels.
 */
export function anticipate(base: Easing, t: number, amount = 0.18, window = 0.3): number {
  const x = clamp01(t);
  const main = ease(base, x);
  if (x >= window) return main;
  // a single dip: 0 at the ends of the window, -amount in the middle
  const u = x / window; // 0..1 across the wind-up
  const dip = -amount * Math.sin(Math.PI * u);
  return main + dip * (1 - u) ** 1;
}

/**
 * STAGGER — a per-item delay, so a group does not move as one object.
 *
 * Returns the value of `base` for an item whose progress is offset by `index * step`, clamped into
 * range. A crowd that moves in perfect unison reads as a texture; a crowd with a small stagger reads
 * as a crowd. The clamp means late items finish on time rather than running past the end of the shot.
 */
export function stagger(base: Easing, t: number, index: number, step = 0.04): number {
  const offset = index * step;
  // rescale so the last item still completes within the shot
  const span = Math.max(1e-6, 1 - Math.abs(step) * Math.max(0, index));
  const local = clamp01((clamp01(t) - offset) / span);
  return ease(base, local);
}

/**
 * SETTLE — a decaying wobble on top of any curve, for follow-through that is not an easing choice.
 *
 * The envelope must be LARGEST AT THE START and decay to nothing, and it must not vanish at t=0 or
 * the curve jumps off its mark. `sin(pi * u)` gives zero at both ends of the move and a single
 * maximum in between, and it is that maximum — placed early by `u = x^0.4` — which decays:
 *
 *     deviation(x) = amplitude * (1 - x)^2 * sin(pi * x^0.4)
 *
 * A first attempt used `sin(cycles * 2pi * x)`, whose first zero crossing lands at x = 0.2 and which
 * therefore measured as a LARGER deviation late in the move than early — the opposite of settling.
 * The test that caught it asked whether the excursion at 0.2 exceeded the excursion at 0.7 and got
 * `0.0000 > 0.0036`, which is the signature of a wobble that grows instead of damping.
 *
 * `f(0) = 0` and `f(1) = 1` are preserved exactly, so it composes with any base curve.
 */
export function settle(t: number, base: Easing = "easeOut", amplitude = 0.04): number {
  const x = clamp01(t);
  const main = ease(base, x);
  if (x <= 0 || x >= 1) return main;
  const decay = Math.pow(1 - x, 2);
  const wobble = Math.sin(Math.PI * Math.pow(x, 0.4));
  return main + amplitude * decay * wobble;
}

/**
 * Piecewise keyframe track. Keys are (t, value) pairs sorted by t.
 * Values outside the range clamp to the first/last key.
 */
export function track(keys: Array<[number, number]>, t: number): number {
  if (keys.length === 0) return 0;
  const first = keys[0]!;
  if (t <= first[0]) return first[1];
  const last = keys[keys.length - 1]!;
  if (t >= last[0]) return last[1];
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i]!;
    const b = keys[i + 1]!;
    if (t >= a[0] && t <= b[0]) {
      const span = b[0] - a[0];
      if (span <= 1e-9) return b[1];
      const u = (t - a[0]) / span;
      // smooth the segment so hand-authored keys stay fluid
      const e = u * u * (3 - 2 * u);
      return a[1] + (b[1] - a[1]) * e;
    }
  }
  return last[1];
}

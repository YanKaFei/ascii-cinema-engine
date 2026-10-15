/**
 * V3 TRANSITION RUNTIME — FORM MATCH, MATERIAL TAKEOVER, MOTION CONTINUITY.
 *
 * ⚠ **V1 HAD NO TRANSITION AT ALL.** Each study was one continuous move, so transitions were *designed but not
 * shown*. This module makes them executable and **auditable**.
 *
 * ## The mechanism that makes them real
 *
 * A transition is not an effect applied over a cut. **The particle field persists ACROSS the cut**, so the
 * particles that carried the outgoing shot are the same particles that arrive in the incoming shot — with the
 * same `id`, the same character, and **the same velocity**. A cut therefore changes where the attractors are,
 * not who is flying.
 *
 * That is what allows the brief's audit: `carrier identity`, `motion direction`, `momentum`, `source` and
 * `destination` are all **recorded per particle** and can be checked afterwards.
 */
import type { Vec3 } from "../design/geometry.js";
import { v3, add, scale, sub, length, norm, dot } from "../design/geometry.js";
import type { GlyphField, Particle } from "./field.js";

export const TRANSITION_KINDS = ["FORM_MATCH", "MATERIAL_TAKEOVER", "MOTION_CONTINUITY"] as const;
export type TransitionKind = (typeof TRANSITION_KINDS)[number];

export interface TransitionSpec {
  id: string;
  kind: TransitionKind;
  fromShot: string;
  toShot: string;
  /** the frame at which the outgoing shot's material begins to leave its own attractors */
  beginsAtFrame: number;
  /** the frame at which the incoming shot's attractors take over */
  settlesAtFrame: number;
  /** what carries the transition, in the director's terms — recorded, not decorative */
  carrier: string;
  /** how hard the outgoing material is pushed along the carrier direction */
  momentum: number;
  /** the fraction of the field that participates; the rest holds the shot */
  participation: number;
}

/** one particle's journey across a transition, recorded so the claim can be checked */
export interface CarrierRecord {
  particleId: number;
  ch: string;
  fromMaterial: string;
  toMaterial: string;
  startPosition: Vec3;
  endPosition: Vec3;
  /** displacement actually travelled */
  travel: number;
  startSpeed: number;
  endSpeed: number;
  /** cosine between the carrier direction assigned and the direction the particle actually moved */
  directionAgreement: number;
}

export interface TransitionTrace {
  id: string;
  kind: TransitionKind;
  fromShot: string;
  toShot: string;
  carrier: string;
  beginsAtFrame: number;
  settlesAtFrame: number;
  /** how many particles carried it */
  carrierCount: number;
  /** the mean direction the carriers travelled, and how consistently */
  meanDirection: Vec3;
  directionConsistency: number;
  meanTravel: number;
  /** true when the carriers' speed did NOT collapse at the boundary — momentum preserved */
  momentumPreserved: boolean;
  meanSpeedBefore: number;
  meanSpeedAfter: number;
  /** a sample of individual carriers, so identity can be verified */
  carriers: CarrierRecord[];
}

/**
 * Run a transition across one frame.
 *
 * @param field the persistent field — the SAME instance across the cut
 * @param outgoing the attractors the field currently holds
 * @param incoming the attractors the incoming shot wants
 * @param u 0..1 progress across the transition window
 */
export function applyTransition(field: GlyphField, spec: TransitionSpec, outgoing: Vec3[], incoming: Vec3[], u: number, frame: number, carrierDirection: Vec3, from = 0, count = -1): void {
  /**
   * ⚠ THE TRANSITION ACTS ONLY ON ITS OWN BLOCK. The first version applied to every particle, which is what made
   * the room and the debris impossible to hold at once and produced the state switch at the S2->S3 boundary.
   */
  const n = count < 0 ? field.particles.length : Math.min(count, field.particles.length - from);
  const participate = Math.floor(n * spec.participation);
  const off = from;
  const dir = norm(carrierDirection);
  const t = Math.max(0, Math.min(1, u));
  for (let i = 0; i < n; i++) {
    const pt = field.particles[off + i]!;
    if (i >= participate) {
      /** the non-participating remainder keeps holding the outgoing shot, so the shot does not collapse at once */
      if (outgoing.length) { pt.target = outgoing[i % outgoing.length]!; pt.hold = 1; }
      continue;
    }
    if (spec.kind === "FORM_MATCH") {
      /**
       * FORM MATCH — the outgoing form's own points become the incoming structure. The particle travels from
       * its current place on the outgoing contour to the corresponding place on the incoming one, so the
       * SHAPE morphs rather than crossfading.
       */
      const src = outgoing.length ? outgoing[i % outgoing.length]! : pt.p;
      const dst = incoming.length ? incoming[i % incoming.length]! : src;
      const from = add(scale(src, 1), scale(dir, spec.momentum * 0.1 * Math.sin(Math.PI * t)));
      pt.target = v3(from.x + (dst.x - from.x) * t, from.y + (dst.y - from.y) * t, from.z + (dst.z - from.z) * t);
      pt.hold = 1;
      pt.material = t < 0.5 ? "formmatch-source" : "formmatch-dest";
    } else if (spec.kind === "MATERIAL_TAKEOVER") {
      /**
       * MATERIAL TAKEOVER — the material LEAVES its own structure and takes over the next shot's surfaces.
       * The distinction from form match is directional: here the carriers are pushed outward along the carrier
       * direction first, and only then settle onto the incoming attractors, so the takeover is seen to SPREAD.
       */
      const src = outgoing.length ? outgoing[i % outgoing.length]! : pt.p;
      const dst = incoming.length ? incoming[i % incoming.length]! : src;
      const push = spec.momentum * Math.sin(Math.PI * t);
      const mid = add(scale(add(src, dst), 0.5), scale(dir, push));
      /** quadratic path through the pushed midpoint: a real arc, so the material visibly travels */
      const a = scale(src, (1 - t) * (1 - t)), b = scale(mid, 2 * (1 - t) * t), c = scale(dst, t * t);
      pt.target = add(add(a, b), c);
      pt.hold = 1;
      pt.material = t < 0.35 ? "takeover-source" : t < 0.75 ? "takeover-travel" : "takeover-dest";
    } else {
      /** MOTION CONTINUITY — the incoming attractors are offset so the field keeps travelling as it arrives */
      const dst = incoming.length ? incoming[i % incoming.length]! : pt.p;
      pt.target = add(dst, scale(dir, spec.momentum * (1 - t)));
      pt.hold = 1;
      pt.material = "continuity";
    }
  }
}

/** record what actually happened, so a transition claim can be verified rather than believed */
export function recordTransition(spec: TransitionSpec, before: { id: number; ch: string; p: Vec3; v: Vec3; material: string }[], after: { id: number; ch: string; p: Vec3; v: Vec3; material: string }[], carrierDirection: Vec3, participate: number): TransitionTrace {
  const dir = norm(carrierDirection);
  const carriers: CarrierRecord[] = [];
  let sumDir = v3(0, 0, 0), agree = 0, travel = 0, speedBefore = 0, speedAfter = 0;
  const n = Math.min(before.length, after.length, participate);
  for (let i = 0; i < n; i++) {
    const a = before[i]!, b = after[i]!;
    const d = sub(b.p, a.p);
    const td = length(d);
    const nd = td > 1e-9 ? norm(d) : v3(0, 0, 0);
    const sa = length(a.v), sb = length(b.v);
    sumDir = add(sumDir, nd);
    agree += td > 1e-9 ? dot(dir, nd) : 0;
    travel += td; speedBefore += sa; speedAfter += sb;
    if (i < 64) carriers.push({ particleId: a.id, ch: a.ch, fromMaterial: a.material, toMaterial: b.material, startPosition: a.p, endPosition: b.p, travel: +td.toFixed(5), startSpeed: +sa.toFixed(5), endSpeed: +sb.toFixed(5), directionAgreement: +nd && +(dot(dir, nd)).toFixed(4) });
  }
  const cnt = Math.max(1, n);
  return {
    id: spec.id, kind: spec.kind, fromShot: spec.fromShot, toShot: spec.toShot, carrier: spec.carrier,
    beginsAtFrame: spec.beginsAtFrame, settlesAtFrame: spec.settlesAtFrame,
    carrierCount: n,
    meanDirection: { x: +(sumDir.x / cnt).toFixed(5), y: +(sumDir.y / cnt).toFixed(5), z: +(sumDir.z / cnt).toFixed(5) },
    directionConsistency: +(agree / cnt).toFixed(4),
    meanTravel: +(travel / cnt).toFixed(5),
    /** ⚠ the measured test for "momentum was preserved": carriers did not stop at the boundary */
    momentumPreserved: speedAfter / cnt > (speedBefore / cnt) * 0.25,
    meanSpeedBefore: +(speedBefore / cnt).toFixed(5),
    meanSpeedAfter: +(speedAfter / cnt).toFixed(5),
    carriers,
  };
}

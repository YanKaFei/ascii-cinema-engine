/**
 * V3 CHARACTER TOPOLOGY — the figure as DESIGNED ASCII, not a filled block.
 *
 * ⚠ THE V2 DEFECT: the body was a **uniform solid block of `#`** with a rectangle torso and single-character
 * capsule limbs, so nothing about the local form chose the glyph and the figure read as a mannequin.
 *
 * ⚠ AND A V3 BUG THAT HAD TO BE FOUND BY ISOLATION. The first version of this module multiplied world-unit
 * body sizes by `pxPerUnit` **and then projected the result**, so every part was transformed twice and the
 * figure rendered as a head, a hollow box, and two limbs shooting off diagonally. **The isolated test caught it
 * — the composition never could have**, because the bug was invisible inside a busy frame.
 *
 * The rule now: **every point is computed in WORLD SPACE and projected exactly once.** Perspective is therefore
 * correct, and a body part at a different depth genuinely gets smaller.
 *
 * Part topology:
 *   head   rim-lit ellipse with a facing cue on the profile side
 *   neck   short tapering column
 *   torso  V-taper, shaded ACROSS its width so the chest reads round
 *   arm    tapering capsule, rim dark and interior graded toward the shadow side
 *   hand   compact wedge, denser than the arm so it reads as a separate object
 *   leg    tapering capsule with a knee offset
 *   foot   flat wedge, the darkest mark in the figure
 */
import type { Canvas } from "../design/material.js";
import { glyphOf, type GlyphFamily } from "../design/material.js";
import { project, type CamBasis } from "../design/geometry.js";
import type { Vec3 } from "../design/geometry.js";

const FAM: GlyphFamily = "figure";

export interface Projected { x: number; y: number; depth: number; visible: boolean }

export interface BodyRig {
  root: Vec3;
  feetY: number;
  height: number;
  headYaw: number;
  torsoYaw: number;
  /** lateral lean of the shoulders relative to the pelvis, in world units */
  lean: number;
  reachArm: "left" | "right";
  reachAmount: number;
  handWorld: Vec3;
  leftFoot: Vec3;
  rightFoot: Vec3;
  movingLegBend: number;
  movingSide: "left" | "right";
  headTurn: number;
  /** 0 = facing camera, 1 = full profile */
  profile: number;
}

export interface BodyScreen {
  pelvis: Projected; shoulder: Projected; neck: Projected; neckTop: Projected; head: Projected;
  headR: number; shoulderHalf: number; limbR: number; pxPerUnit: number;
}

/** screen position from a WORLD point — the one and only transform */
const S = (b: CamBasis, p: Vec3, cols: number, rows: number): Projected => {
  const q = project(b, p);
  return { x: (q.x * 0.5 + 0.5) * (cols - 1), y: (0.5 - q.y * 0.5) * (rows - 1), depth: q.depth, visible: q.visible };
};

/** project the rig once, and derive the pixels-per-world-unit factor from the figure's own extent */
export function projectRig(b: CamBasis, r: BodyRig, cols: number, rows: number): BodyScreen {
  const foot = S(b, { x: r.root.x, y: r.feetY, z: r.root.z }, cols, rows);
  const top = S(b, { x: r.root.x, y: r.feetY + r.height, z: r.root.z }, cols, rows);
  /**
   * ⚠ `pxPerUnit` converts a WORLD radius into glyph cells **at the figure's depth**. It is used ONLY for radii
   * (which are small and may be sub-cell), never for positions — positions always come from a projection.
   */
  const pxPerUnit = Math.abs(top.y - foot.y) / r.height;
  return {
    pelvis: S(b, { x: r.root.x, y: r.feetY + r.height * 0.47, z: r.root.z }, cols, rows),
    shoulder: S(b, { x: r.root.x + r.lean, y: r.feetY + r.height * 0.82, z: r.root.z }, cols, rows),
    neck: S(b, { x: r.root.x + r.lean, y: r.feetY + r.height * 0.855, z: r.root.z }, cols, rows),
    neckTop: S(b, { x: r.root.x + r.lean, y: r.feetY + r.height * 0.885, z: r.root.z }, cols, rows),
    head: S(b, { x: r.root.x + r.lean, y: r.feetY + r.height * 0.945, z: r.root.z }, cols, rows),
    headR: Math.max(2, r.height * 0.078 * pxPerUnit),
    shoulderHalf: Math.max(2, r.height * 0.115 * pxPerUnit),
    limbR: Math.max(1.2, r.height * 0.038 * pxPerUnit),
    pxPerUnit,
  };
}

function mark(cv: Canvas, x: number, y: number, ink: number, depth: number, part: string, contour = false): void {
  const v = contour ? Math.min(1, ink + 0.30) : ink;
  cv.write(x, y, glyphOf(FAM, v), FAM, v, depth, part);
}

/** a limb: rim dark, interior graded ACROSS the axis so it reads as a cylinder */
function limb(cv: Canvas, a: Projected, b: Projected, r0: number, r1: number, depth: number, part: string, shade = 1): void {
  if (!a.visible || !b.visible) return;
  const vx = b.x - a.x, vy = b.y - a.y;
  const len = Math.hypot(vx, vy);
  if (len < 0.5) return;
  const nx = -vy / len, ny = vx / len;
  const steps = Math.max(2, Math.ceil(len));
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const cx = a.x + vx * t, cy = a.y + vy * t;
    const r = r0 + (r1 - r0) * t;
    for (let k = -Math.ceil(r); k <= Math.ceil(r); k++) {
      const q = Math.abs(k) / Math.max(1e-6, r);
      if (q > 1) continue;
      const rim = q > 0.66;
      const side = 0.5 + 0.5 * (k / Math.max(1e-6, r)) * shade;
      mark(cv, cx + nx * k, cy + ny * k, rim ? 0.86 : 0.24 + 0.40 * side, depth, part, rim);
    }
  }
}

/** the whole figure. Returns the extended hand and the head centre for transition carriers. */
export function drawBody3(cv: Canvas, b: CamBasis, r: BodyRig, cols: number, rows: number, depthBase: number): { hand: Projected; head: Projected } {
  const s = projectRig(b, r, cols, rows);
  if (!s.head.visible && !s.pelvis.visible) return { hand: s.head, head: s.head };
  const H = r.feetY + r.height;
  const P = (x: number, y: number, z: number) => S(b, { x, y, z }, cols, rows);

  /** ---- legs ---- */
  const hipHalf = r.height * 0.045;
  for (const side of ["left", "right"] as const) {
    const fw = side === "left" ? r.leftFoot : r.rightFoot;
    const hip = P(r.root.x + (side === "left" ? -hipHalf : hipHalf), r.feetY + r.height * 0.46, r.root.z);
    const foot = P(fw.x, fw.y, fw.z);
    const bend = side === r.movingSide ? r.movingLegBend : 0;
    const knee = P(
      r.root.x + (side === "left" ? -hipHalf : hipHalf) * 0.7 + (side === "left" ? -1 : 1) * 0.012 * (1 + bend * 3),
      r.feetY + r.height * 0.24,
      r.root.z + (fw.z - r.root.z) * 0.45,
    );
    limb(cv, hip, knee, s.limbR * 1.16, s.limbR * 0.92, depthBase + 0.02, "leg-" + side);
    limb(cv, knee, foot, s.limbR * 0.92, s.limbR * 0.70, depthBase + 0.015, "shin-" + side);
    for (let k = -Math.ceil(s.limbR * 1.6); k <= Math.ceil(s.limbR * 1.6); k++)
      for (let j = 0; j < Math.max(1, s.limbR * 0.8); j++) mark(cv, foot.x + k, foot.y - j, 0.95, depthBase - 0.01, "foot-" + side, true);
  }

  /** ---- torso: V-taper, shaded across its width ---- */
  const rowsN = Math.max(3, Math.ceil(Math.abs(s.shoulder.y - s.pelvis.y)));
  for (let i = 0; i <= rowsN; i++) {
    const t = i / rowsN;
    const y = s.shoulder.y + (s.pelvis.y - s.shoulder.y) * t;
    /** shoulders wider than the waist: the taper is what makes a torso read as a body */
    const half = s.shoulderHalf * (1 - 0.28 * t) * (1 + 0.05 * Math.sin(t * Math.PI));
    const cx = s.shoulder.x + (s.pelvis.x - s.shoulder.x) * t;
    for (let k = -Math.ceil(half); k <= Math.ceil(half); k++) {
      const q = Math.abs(k) / Math.max(1e-6, half);
      if (q > 1) continue;
      const rim = q > 0.78;
      const across = 0.5 + 0.5 * (k / Math.max(1e-6, half));
      mark(cv, cx + k, y, rim ? 0.88 : 0.20 + 0.38 * across, depthBase + 0.01, "torso", rim);
    }
  }

  /** ---- arms ---- */
  const parts: Record<string, Projected> = {};
  for (const side of ["left", "right"] as const) {
    const shX = r.root.x + r.lean + (side === "left" ? -1 : 1) * r.height * 0.112;
    const shoulder = P(shX, r.feetY + r.height * 0.815, r.root.z);
    const isReach = side === r.reachArm;
    const hand = isReach ? P(r.handWorld.x, r.handWorld.y, r.handWorld.z)
      : P(shX + (side === "left" ? -1 : 1) * r.height * 0.02, r.feetY + r.height * 0.45, r.root.z + 0.02);
    /** the elbow bows OUTWARD on a rest arm and stays nearly straight on a reaching arm */
    const bow = isReach ? (1 - r.reachAmount) * 0.055 : 0.030;
    const elb = P(
      (shX + (isReach ? r.handWorld.x : shX + (side === "left" ? -1 : 1) * r.height * 0.02)) / 2 + (side === "left" ? -1 : 1) * bow,
      r.feetY + r.height * (isReach ? (0.815 + (r.handWorld.y - r.feetY) / r.height) / 2 : 0.63),
      r.root.z + (isReach ? (r.handWorld.z - r.root.z) * 0.5 : 0.02),
    );
    limb(cv, shoulder, elb, s.limbR * 1.06, s.limbR * 0.86, depthBase + 0.006, "upperarm-" + side);
    limb(cv, elb, hand, s.limbR * 0.86, s.limbR * 0.62, depthBase, "forearm-" + side);
    /** the HAND is denser than the arm, so it reads as a separate object and can carry a transition */
    for (let dx = -Math.ceil(s.limbR); dx <= Math.ceil(s.limbR); dx++)
      for (let dy = -Math.ceil(s.limbR); dy <= Math.ceil(s.limbR); dy++) {
        if ((dx * dx) / (s.limbR * s.limbR) + (dy * dy) / (s.limbR * s.limbR * 0.75) > 1) continue;
        mark(cv, hand.x + dx, hand.y + dy, 0.92, depthBase - 0.006, "hand-" + side, true);
      }
    parts[side] = hand;
  }

  /** ---- neck ---- */
  limb(cv, s.neck, s.neckTop, s.limbR * 0.72, s.limbR * 0.58, depthBase + 0.004, "neck", 0.6);

  /** ---- head: rim-lit ellipse with a FACING CUE, narrowed by the profile ---- */
  const hr = Math.max(2.5, s.headR);
  const yawRad = (r.headYaw * Math.PI) / 180;
  const widthScale = 1 - 0.40 * Math.abs(Math.sin(yawRad)) * r.profile;
  for (let dy = -Math.ceil(hr); dy <= Math.ceil(hr); dy++)
    for (let dx = -Math.ceil(hr * widthScale); dx <= Math.ceil(hr * widthScale); dx++) {
      const q = (dx * dx) / ((hr * widthScale) ** 2) + (dy * dy) / (hr * hr);
      if (q > 1) continue;
      const rim = q > 0.52;
      mark(cv, s.head.x + dx, s.head.y + dy, rim ? 0.90 : 0.26, depthBase - 0.02, "head", rim);
    }
  const dir = Math.sin(yawRad) >= 0 ? 1 : -1;
  const cue = Math.abs(Math.sin(yawRad)) * r.profile;
  if (cue > 0.12) {
    const cw = Math.max(1, hr * 0.34 * cue);
    for (let dx = 0; dx <= cw; dx++)
      for (let dy = -hr * 0.20; dy <= hr * 0.20; dy++)
        mark(cv, s.head.x + dir * (hr * widthScale * 0.70 + dx), s.head.y + dy - hr * 0.06, 0.95, depthBase - 0.03, "head-cue", true);
  }
  return { hand: parts[r.reachArm]!, head: s.head };
}

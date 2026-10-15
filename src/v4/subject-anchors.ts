/**
 * REAL SUBJECT ANCHOR RESOLUTION.
 *
 * ⚠ **THE DEFECT THIS EXISTS FOR.** `protectedSubjectAnchors` was declared on the composition contract, validated by
 * the compiler and preserved on `CompiledShotSpec` — and **nothing read it**. R3.6 recorded `PERSON.hand` as
 * protected while the word went on covering the figure. A declaration that produces no spatial protection is an
 * inert mechanism of exactly the kind this project has recorded seven times.
 *
 * ⚠ **AN ANCHOR POINT IS NOT A SILHOUETTE.** A single projected point cannot describe what the compositor must keep
 * clear: an arm is a segment, the torso is a volume. Each anchor therefore resolves to a **projected footprint** —
 * a capsule for a limb, a box for a trunk — derived from the performance's OWN geometry, so the protected region
 * is where the body part actually is rather than where a fixed rectangle was guessed to be.
 */
import { project, type CamBasis, type Vec3 } from "../design/geometry.js";

/** The body-part anchors the performance can actually produce. */
export const RESOLVABLE_ANCHORS = ["head", "torso", "shoulder", "arm", "hand", "leftFoot", "rightFoot", "floor"] as const;
export type AnchorId = (typeof RESOLVABLE_ANCHORS)[number];

/** The minimal rig surface this module needs — matches what the renderer builds from the performance. */
export interface SubjectGeometry {
  root: Vec3;
  feetY: number;
  height: number;
  handWorld: Vec3;
  headYaw: number;
  torsoYaw: number;
  reachAmount: number;
}

/** A protected footprint in normalised screen space, ready for the compositor. */
export interface ProtectedFootprint {
  subjectId: string;
  anchorId: AnchorId;
  /** 'capsule' for limbs, 'box' for the trunk and head */
  shape: "capsule" | "box";
  /** the two endpoints, for a capsule; equal for a point-like anchor */
  a: { x: number; y: number };
  b: { x: number; y: number };
  /** radius in normalised screen units (capsules) or half-extents (boxes) */
  radius: number;
  /** true when every defining world point was in front of the near plane */
  resolved: boolean;
  /** the world endpoints, kept for provenance */
  worldA: Vec3;
  worldB: Vec3;
}

/**
 * Resolve one anchor to its projected footprint, from the ACTUAL rig.
 *
 * ⚠ Returns `resolved: false` when any defining point is behind the near plane. **An unresolvable anchor is
 * reported, not silently dropped** — the compiler refuses such a declaration, and the runtime refuses to pretend
 * it protected something.
 */
export function resolveAnchor(subjectId: string, anchorId: AnchorId, rig: SubjectGeometry, basis: CamBasis): ProtectedFootprint {
  const H = rig.height, F = rig.feetY;
  /** shoulder height, elbow and hand, all derived from the same rig the figure is drawn from */
  const shoulderY = F + H * 0.78;
  const shoulderL = { x: rig.root.x, y: shoulderY, z: rig.root.z };
  let a: Vec3, b: Vec3, shape: "capsule" | "box", radius: number;

  switch (anchorId) {
    case "hand":
      /** ⚠ THE ACTUAL REACHING HAND — the rig's own `handWorld`, not a fixed point */
      a = rig.handWorld; b = rig.handWorld; shape = "capsule"; radius = 0.055; break;
    case "arm":
      /** the forearm capsule from the shoulder toward the hand, so the gesture stays legible */
      a = shoulderL; b = rig.handWorld; shape = "capsule"; radius = 0.05; break;
    case "shoulder":
      a = shoulderL; b = { x: rig.root.x, y: shoulderY, z: rig.root.z }; shape = "capsule"; radius = 0.045; break;
    case "head":
      a = { x: rig.root.x, y: F + H * 0.90, z: rig.root.z }; b = a; shape = "box"; radius = 0.075; break;
    case "torso":
      a = { x: rig.root.x, y: F + H * 0.45, z: rig.root.z }; b = { x: rig.root.x, y: shoulderY, z: rig.root.z }; shape = "box"; radius = 0.10; break;
    case "leftFoot": a = rig.root; b = rig.root; shape = "capsule"; radius = 0.035; break;
    case "rightFoot": a = rig.root; b = rig.root; shape = "capsule"; radius = 0.035; break;
    case "floor": a = rig.root; b = rig.root; shape = "capsule"; radius = 0.02; break;
  }
  const pa = project(basis, a), pb = project(basis, b);
  return {
    subjectId, anchorId, shape,
    a: { x: pa.x, y: pa.y }, b: { x: pb.x, y: pb.y }, radius,
    resolved: pa.visible && pb.visible,
    worldA: a, worldB: b,
  };
}

/** Is a normalised screen point inside a footprint? Capsules are thick segments; boxes are axis-aligned. */
export function footprintContains(f: ProtectedFootprint, nx: number, ny: number): boolean {
  if (!f.resolved) return false;
  if (f.shape === "box") {
    const cx = (f.a.x + f.b.x) / 2, cy = (f.a.y + f.b.y) / 2;
    const hw = f.radius, hh = Math.abs(f.b.y - f.a.y) / 2 + f.radius * 0.6;
    return Math.abs(nx - cx) <= hw * 1.6 && Math.abs(ny - cy) <= hh;
  }
  /** distance from the point to the capsule's segment */
  const dx = f.b.x - f.a.x, dy = f.b.y - f.a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 1e-12 ? ((nx - f.a.x) * dx + (ny - f.a.y) * dy) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const px = f.a.x + t * dx, py = f.a.y + t * dy;
  return Math.hypot(nx - px, ny - py) <= f.radius;
}

/**
 * THE COMPOSITION CONSTRAINT EVALUATOR.
 *
 * ⚠ **A WARNING IS NOT A REPAIR.** These diagnostics exist to force a production decision, so they are named and
 * returned rather than logged: if the authored composition cannot satisfy its own constraints, the caller must
 * change the composition — not the metric.
 */
export const COMPOSITION_DIAGNOSTICS = [
  "TYPOGRAPHY_SUBJECT_OCCLUSION",
  "PROTECTED_ANCHOR_NOT_VISIBLE",
  "INSUFFICIENT_COMPOSITION_SPACE",
  "READABILITY_SCALE_UNSATISFIED",
] as const;
export type CompositionDiagnostic = (typeof COMPOSITION_DIAGNOSTICS)[number];

export interface FeasibilityInput {
  /** the word's projected screen box, in CELLS — used ONLY for reporting, never for the overlap verdict */
  wordBox: { minX: number; minY: number; maxX: number; maxY: number };
  cols: number; rows: number;
  /** the footprints the contract protects */
  footprints: ProtectedFootprint[];
  /** the resolved stroke width in output cells, and the minimum the readable form requires */
  strokeCells: number;
  minStrokeCells: number;
  /**
   * ⚠ THE **REAL** INTERSECTION, measured on the shared discrete mask, in cells.
   *
   * R3.7 decided occlusion from the word's **axis-aligned bounding box**, which reported `covered = 1.00` on every
   * frame while the actual protected∩typography intersection was **zero**. **A bounding box is not a glyph.** The
   * verdict must be the count of cells that are BOTH protected and actually painted.
   */
  intersectionCells: number;
  /** cells in the protected mask, so the fraction is meaningful */
  maskCells: number;
}
export interface FeasibilityResult {
  ok: boolean;
  diagnostics: CompositionDiagnostic[];
  /** cells of the protected footprints that the word's box would cover */
  coveredProtectedCells: number;
  protectedCells: number;
  strokeCells: number;
  /** a machine-readable summary for the audit */
  detail: Record<string, unknown>;
}

export function evaluateComposition(i: FeasibilityInput): FeasibilityResult {
  const diagnostics: CompositionDiagnostic[] = [];
  /** ⚠ the cells that are BOTH protected AND painted — the only honest overlap measure */
  const coveredProtectedCells = i.intersectionCells;
  const protectedCells = i.maskCells;
  for (const f of i.footprints) if (!f.resolved) diagnostics.push("PROTECTED_ANCHOR_NOT_VISIBLE");
  if (i.strokeCells < i.minStrokeCells) diagnostics.push("READABILITY_SCALE_UNSATISFIED");
  if (protectedCells === 0 && i.footprints.length) diagnostics.push("PROTECTED_ANCHOR_NOT_VISIBLE");
  /** an occlusion is reported only when real painted cells fall inside the protected mask */
  if (protectedCells > 0 && coveredProtectedCells / protectedCells > 0.35) diagnostics.push("TYPOGRAPHY_SUBJECT_OCCLUSION");
  return {
    ok: diagnostics.length === 0,
    diagnostics,
    coveredProtectedCells, protectedCells,
    strokeCells: i.strokeCells,
    detail: {
      /** reported for transparency, but NOT the basis of the verdict */
      wordBoxCoveredFraction: (() => {
        let inBox = 0, tot = 0;
        for (const f of i.footprints) {
          if (!f.resolved) continue;
          for (let cy = 0; cy < i.rows; cy++) for (let cx = 0; cx < i.cols; cx++) {
            const nx = (cx + 0.5) / i.cols * 2 - 1, ny = 1 - (cy + 0.5) / i.rows * 2;
            if (!footprintContains(f, nx, ny)) continue;
            tot++;
            if (cx >= i.wordBox.minX && cx <= i.wordBox.maxX && cy >= i.wordBox.minY && cy <= i.wordBox.maxY) inBox++;
          }
        }
        return tot ? +(inBox / tot).toFixed(4) : null;
      })(),
      protectedFractionCovered: protectedCells ? +(coveredProtectedCells / protectedCells).toFixed(4) : null,
      intersectionCells: i.intersectionCells,
      maskCells: i.maskCells,
      wordBox: i.wordBox,
      anchors: i.footprints.map((f) => ({ anchor: `${f.subjectId}.${f.anchorId}`, resolved: f.resolved, shape: f.shape, a: f.a, b: f.b, radius: f.radius })),
    },
  };
}

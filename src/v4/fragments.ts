/**
 * TOPOLOGY-CARRIED FRAGMENTATION — the mechanism that makes a representation change a TRANSFORMATION.
 *
 * ⚠ **WHAT THIS REPLACES.** The V3/R2 NAME break pushed its cells outward with
 *
 *     const ox = push * Math.sin((r + li) * 2.1), oy = push * Math.cos((c + li) * 1.7);
 *
 * which is a per-cell offset with **no provenance, no target and no continuity** — the cells scattered, and the
 * object stopped existing. There was nothing to audit: no fragment knew which letter produced it.
 *
 * Here every fragment is born from **one specific topology cell** of **one specific character**, carries that
 * provenance for its whole life, and travels a deterministic path from its source anchor to the transition's
 * destination anchor. **The identity of the object survives the change of representation.**
 *
 * ⚠ **THE SEED IS PER-CELL, NOT PER-FRAME.** A generator that resamples each frame would produce a cloud of
 * unrelated particles with stable ids — the exact failure the order warns about ("persistent IDs alone do not
 * prove visual continuity").
 */
import type { TypographyTopology, TopologyCell } from "./typography.js";
import type { VisualModeTransitionIntent } from "./mode-transition.js";
import type { Vec3 } from "../design/geometry.js";

/** A deterministic hash of a topology cell into 0..1. Same cell, same value, every frame, every machine. */
function hash01(a: number, b: number, seed: number): number {
  let h = (a * 374761393 + b * 668265263 + seed * 2246822519) | 0;
  h = (h ^ (h >>> 13)) * 1274126177 | 0;
  h = h ^ (h >>> 16);
  return ((h >>> 0) % 100000) / 100000;
}

export interface FragmentCarrier {
  /** STABLE for the fragment's whole life */
  id: string;
  sourceObjectId: string;
  /** the letter this fragment came from, and where on it */
  sourceChar: string;
  sourceCharIndex: number;
  sourceGlyphOrRegion: string;
  /** the topology cell, so provenance is auditable rather than asserted */
  sourceCell: { gx: number; gy: number };
  isContour: boolean;
  /** world position at the transition's start, and the anchor it is heading for */
  position: Vec3;
  velocity: Vec3;
  target: Vec3;
  birthFrame: number;
  deathFrame: number;
  /** deterministic per-fragment variation, constant across frames */
  drift: Vec3;
}

/** world position of a topology cell inside a placed word */
export function cellWorld(cell: TopologyCell, topo: TypographyTopology, origin: Vec3, width: number, height: number): Vec3 {
  const lx = (cell.gx + 0.5) / topo.cols - 0.5;
  const ly = 0.5 - (cell.gy + 0.5) / topo.rows;
  return { x: origin.x + lx * width, y: origin.y + ly * height, z: origin.z };
}

/**
 * RESOLVE THE TRANSITION INTO CARRIERS.
 *
 * Contour cells are sampled first, because a letter's identity lives in its edges; interior cells fill in behind.
 * Each carrier is assigned a target that is its own source position **pushed along the transition direction**, so
 * a letter's fragment cloud retains that letter's shape as it travels — **the fragments inherit their source
 * letter rather than being assigned to one arbitrarily.**
 */
export function resolveFragments(
  topo: TypographyTopology,
  t: VisualModeTransitionIntent,
  origin: Vec3,
  width: number,
  height: number,
  birthFrame: number,
  /**
   * ⚠ A LIFETIME THAT CAN OUTLIVE THE SHOT.
   *
   * R3 set `deathFrame = endFrame + 1`, so the field died two frames after its window and S6 independently
   * re-fractured the same NAME. When the compiled contract names a frame past this shot, the carriers live until
   * it — **that is what makes S5's field survive into S6 without a respawn.**
   */
  lifetimeEndFrame?: number,
): FragmentCarrier[] {
  const n = Math.min(t.fragmentCount, Math.max(1, topo.cells.length));
  /** contour first, then interior, then the rest — so provenance is edge-weighted by construction */
  const ordered: { cell: TopologyCell; isContour: boolean }[] = [
    ...topo.contour.map((c) => ({ cell: c, isContour: true })),
    ...topo.interior.map((c) => ({ cell: c, isContour: false })),
  ];
  /** deterministic even sampling across the ordered cells, so the count is exact and the choice is stable */
  const picked: { cell: TopologyCell; isContour: boolean }[] = [];
  for (let i = 0; i < n; i++) picked.push(ordered[Math.floor((i * ordered.length) / n)]!);

  const dir = {
    x: t.destinationAnchor.x - t.sourceAnchor.x,
    y: t.destinationAnchor.y - t.sourceAnchor.y,
    z: t.destinationAnchor.z - t.sourceAnchor.z,
  };
  const dead = Number.isFinite(lifetimeEndFrame) ? lifetimeEndFrame : t.endFrame + 1;
  return picked.map((p, i) => {
    const src = cellWorld(p.cell, topo, origin, width, height);
    const r1 = hash01(p.cell.gx, p.cell.gy, t.seed);
    const r2 = hash01(p.cell.gy, p.cell.gx, t.seed + 7);
    const r3 = hash01(p.cell.gx + p.cell.gy, i, t.seed + 13);
    /**
     * ⚠ THE TARGET PRESERVES THE LETTER'S SHAPE. A fragment is displaced along the transition direction but keeps
     * its own offset within the letter, so the word is still legible in the cloud — this is what distinguishes a
     * transformation from a dispersal.
     */
    const spread = 1 + (r1 - 0.5) * 0.55;
    const target: Vec3 = {
      x: src.x + dir.x * spread + (r2 - 0.5) * 0.22,
      y: src.y + dir.y * spread + (r1 - 0.5) * 0.22,
      z: src.z + dir.z * spread + (r3 - 0.5) * 0.18,
    };
    return {
      id: `${t.sourceObjectId}:${p.cell.char}${p.cell.charIndex}:${p.cell.gx},${p.cell.gy}`,
      sourceObjectId: t.sourceObjectId,
      sourceChar: p.cell.char,
      sourceCharIndex: p.cell.charIndex,
      sourceGlyphOrRegion: `${p.isContour ? "contour" : "interior"}:${p.cell.char}[${p.cell.gx},${p.cell.gy}]`,
      sourceCell: { gx: p.cell.gx, gy: p.cell.gy },
      isContour: p.isContour,
      position: src,
      velocity: { x: 0, y: 0, z: 0 },
      target,
      birthFrame,
      deathFrame: dead as number,
      drift: { x: (r1 - 0.5) * 0.06, y: (r2 - 0.5) * 0.06, z: (r3 - 0.5) * 0.04 },
    };
  });
}

export interface CarrierState { position: Vec3; velocity: Vec3; alive: boolean; aliveSince: number }

/**
 * RETARGET EXISTING CARRIERS — the continuation path.
 *
 * ⚠ **NO NEW CARRIERS ARE CREATED HERE.** A continuation changes where the SAME fragments are going and how long
 * they live. Identity, source letter and source topology cell are untouched, which is exactly what "the object
 * keeps its identity across a representation change" has to mean in code.
 */
export function retargetFragments(
  carriers: FragmentCarrier[],
  t: VisualModeTransitionIntent,
  lifetimeEndFrame?: number,
  /**
   * ⚠ A RETARGET MOVES THE **BIRTH** AS WELL AS THE DEATH.
   *
   * The first version updated only `deathFrame`. Because the population persists from the prominence link (born at
   * absolute 248, dead at 288), a fracture opening at 320 left every carrier **outside its own window** —
   * measured `alive 0` from 320 to 338 — so the field did not exist during the very interval it was authored for.
   * Moving the birth to the new link's start is what makes the fracture actually happen when it is supposed to.
   */
  newBirthFrameAbsolute?: number,
): { retargeted: number; idsPreserved: number } {
  const before = carriers.map((c) => c.id);
  const dir = {
    x: t.destinationAnchor.x - t.sourceAnchor.x,
    y: t.destinationAnchor.y - t.sourceAnchor.y,
    z: t.destinationAnchor.z - t.sourceAnchor.z,
  };
  for (const c of carriers) {
    /** the fragment keeps its own offset within its letter, so the word's shape survives the retarget */
    const r1 = hash01(c.sourceCell.gx, c.sourceCell.gy, t.seed + 101);
    const r2 = hash01(c.sourceCell.gy, c.sourceCell.gx, t.seed + 211);
    c.target = {
      x: c.target.x + dir.x * (1 + (r1 - 0.5) * 0.4),
      y: c.target.y + dir.y * (1 + (r2 - 0.5) * 0.4),
      z: c.target.z + dir.z * (1 + (r1 - 0.5) * 0.3),
    };
    if (typeof lifetimeEndFrame === "number" && Number.isFinite(lifetimeEndFrame)) c.deathFrame = lifetimeEndFrame;
    if (typeof newBirthFrameAbsolute === "number" && Number.isFinite(newBirthFrameAbsolute)) c.birthFrame = newBirthFrameAbsolute;
  }
  const after = carriers.map((c) => c.id);
  let preserved = 0;
  for (let i = 0; i < before.length; i++) if (before[i] === after[i]) preserved++;
  return { retargeted: carriers.length, idsPreserved: preserved };
}

/**
 * ADVANCE THE CARRIERS ONE FRAME.
 *
 * ⚠ **MOTION IS INTEGRATED, NOT RECOMPUTED.** The position at frame *f* is a function of the SAME carrier's
 * position at *f−1*, so the trajectory is continuous by construction. Velocity is carried forward and eased, and
 * the previous position is retained so `velocity` is a measured screen-space displacement rather than a declared
 * number. **This is what the continuity audit measures.**
 */
export function stepCarriers(carriers: FragmentCarrier[], states: Map<string, CarrierState>, frame: number, t: number, opts: { accel?: number; damping?: number } = {}): void {
  const accel = opts.accel ?? 0.16, damping = opts.damping ?? 0.82;
  for (const c of carriers) {
    let st = states.get(c.id);
    if (!st) { st = { position: { ...c.position }, velocity: { x: 0, y: 0, z: 0 }, alive: false, aliveSince: frame }; states.set(c.id, st); }
    if (frame < c.birthFrame || frame > c.deathFrame) { st.alive = false; continue; }
    if (!st.alive) { st.alive = true; st.aliveSince = frame; st.position = { ...c.position }; st.velocity = { x: 0, y: 0, z: 0 }; }
    /** the spring toward the fragment's OWN target, with a per-fragment drift; integrated from the previous state */
    const k = 0.10 + 0.16 * t;
    const ax = (c.target.x - st.position.x) * k + c.drift.x * (1 - t);
    const ay = (c.target.y - st.position.y) * k + c.drift.y * (1 - t);
    const az = (c.target.z - st.position.z) * k * 0.6 + c.drift.z * (1 - t);
    const prev = { ...st.position };
    st.velocity = {
      x: st.velocity.x * damping + ax * accel,
      y: st.velocity.y * damping + ay * accel,
      z: st.velocity.z * damping + az * accel,
    };
    st.position = { x: st.position.x + st.velocity.x, y: st.position.y + st.velocity.y, z: st.position.z + st.velocity.z };
    /** the measured displacement for this frame, so the continuity audit reads a real trajectory */
    st.velocity = { x: st.position.x - prev.x, y: st.position.y - prev.y, z: st.position.z - prev.z };
  }
}

/** carrier census by source character, for the provenance report */
export function carrierProvenance(carriers: FragmentCarrier[]): Record<string, { total: number; contour: number; byChar: Record<string, number> }> {
  const out: Record<string, { total: number; contour: number; byChar: Record<string, number> }> = {};
  for (const c of carriers) {
    const e = (out[c.sourceObjectId] ??= { total: 0, contour: 0, byChar: {} });
    e.total++;
    if (c.isContour) e.contour++;
    e.byChar[c.sourceChar] = (e.byChar[c.sourceChar] ?? 0) + 1;
  }
  return out;
}

/**
 * SHARED DISCRETE PROTECTED MASK — one mask, computed once, used by BOTH the evaluator and the compositor.
 *
 * ⚠ **THE DEFECT THIS EXISTS FOR.** R3.7 had two independent geometry paths:
 *   - `evaluateComposition` sampled each footprint over the whole grid and reported `protectedFractionCovered = 1.00`
 *   - the typography carve tested each painted cell against the same footprints and carved **0** cells
 *
 * The two never shared an object, so they could disagree and did. Worse, the reported coverage was **real but
 * misattributed**: the sample at cell (105,53) is **0.169** from the hand centre, well outside its 0.055 radius, so
 * the HAND did not contain it — the ARM capsule did. The arm runs from the shoulder toward the hand, and because
 * the shoulder's world height is above the frame top, the arm is a long near-vertical capsule through the frame
 * centre, exactly where the word is. **A footprint that is real is not the same as a footprint that is right, and
 * coverage attributed to the wrong part is worse than no measurement.**
 *
 * This module produces **one `Uint8Array` of canvas cells per frame**. The evaluator measures it, the compositor
 * carves it, and both read the identical buffer.
 */
import { footprintContains, type ProtectedFootprint } from "./subject-anchors.js";

export interface DiscreteMaskAudit {
  frame: number;
  /** cells in the union of all protected footprints */
  protectedCells: number;
  /** protected cells per anchor, so coverage cannot be attributed to the wrong part */
  perAnchor: { anchor: string; cells: number; resolved: boolean }[];
  cols: number;
  rows: number;
}

export interface DiscreteProtectedMask {
  /** 1 when the cell is inside a protected footprint */
  data: Uint8Array;
  cols: number;
  rows: number;
  /** cells inside ANY footprint */
  count: number;
  /** which anchors are unresolved this frame */
  unresolved: string[];
  audit: DiscreteMaskAudit;
}

/**
 * RASTERISE the footprints into a discrete cell mask.
 *
 * ⚠ The cell-centre convention is **identical** to the one the typography sampler uses when it paints, so a cell
 * the evaluator calls protected is exactly a cell the carver will refuse. This is the single place the convention
 * is written down.
 */
export function rasteriseProtectedMask(
  footprints: ProtectedFootprint[],
  cols: number,
  rows: number,
  frame: number,
): DiscreteProtectedMask {
  const data = new Uint8Array(cols * rows);
  const perAnchor: { anchor: string; cells: number; resolved: boolean }[] = [];
  const unresolved: string[] = [];
  let count = 0;

  for (const f of footprints) {
    const name = `${f.subjectId}.${f.anchorId}`;
    if (!f.resolved) { unresolved.push(name); perAnchor.push({ anchor: name, cells: 0, resolved: false }); continue; }
    /** bound the scan by the footprint's own extent so this stays cheap */
    const pad = f.radius * 1.05 + 0.01;
    const x0 = Math.max(0, Math.floor((Math.min(f.a.x, f.b.x) - pad) * 0.5 * cols + cols / 2) - 1);
    const x1 = Math.min(cols - 1, Math.ceil((Math.max(f.a.x, f.b.x) + pad) * 0.5 * cols + cols / 2) + 1);
    const y0 = Math.max(0, Math.floor((0.5 - (Math.max(f.a.y, f.b.y) + pad) * 0.5) * rows) - 1);
    const y1 = Math.min(rows - 1, Math.ceil((0.5 - (Math.min(f.a.y, f.b.y) - pad) * 0.5) * rows) + 1);
    let cells = 0;
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      /** THE convention: the cell's centre, in the same centred coordinates `project` returns */
      const nx = ((cx + 0.5) / cols) * 2 - 1;
      const ny = 1 - ((cy + 0.5) / rows) * 2;
      if (!footprintContains(f, nx, ny)) continue;
      cells++;
      const i = cy * cols + cx;
      if (!data[i]) { data[i] = 1; count++; }
    }
    perAnchor.push({ anchor: name, cells, resolved: true });
  }
  return { data, cols, rows, count, unresolved, audit: { frame, protectedCells: count, perAnchor, cols, rows } };
}

/** Cells that are BOTH protected and painted by the typography layer — the real intersection. */
export function maskIntersection(mask: DiscreteProtectedMask, typographyCells: Uint8Array): number {
  let n = 0;
  for (let i = 0; i < mask.data.length; i++) if (mask.data[i] && typographyCells[i]) n++;
  return n;
}

/** Collect the typography layer's painted cells as a discrete mask, for a like-for-like intersection. */
export function cellsOf(canvasCells: { length: number }, isPainted: (i: number) => boolean): Uint8Array {
  const out = new Uint8Array(canvasCells.length);
  for (let i = 0; i < out.length; i++) if (isPainted(i)) out[i] = 1;
  return out;
}

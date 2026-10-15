/**
 * LINE-GRID DIFFERENCE — a diagnostic whose name describes exactly what it measures.
 *
 * ⚠ WHY THIS EXISTS. Phase 3.3H shipped a metric called `asciiChurnCells` that compared **character values
 * only**. The figure and the floor were both drawn in characters that resolved to the same ink, so the metric
 * read **0** while the figure was moving, and then read **748** while the rendered image was **byte-identical
 * on every frame**. It was wrong in both directions, and its name gave no hint of which property it measured.
 *
 * The distinction this utility makes explicit:
 *
 * | change | meaning |
 * |---|---|
 * | **position** | occupancy moved — a cell became occupied, or stopped being occupied |
 * | **glyph substitution** | a cell stayed occupied but changed character |
 *
 * **A position change is a rendered change even when the glyph class is identical**, which is exactly the
 * case the old metric could not see. Position changes are therefore reported first and separately.
 */

export interface GridDiff {
  /** cells that were occupied and are now occupied by a DIFFERENT character */
  glyphSubstitutions: number;
  /** cells newly occupied */
  addedPositions: number;
  /** cells that stopped being occupied */
  removedPositions: number;
  /** added + removed — occupancy movement, independent of glyph */
  changedPositions: number;
  /** substitutions + added + removed — every cell whose rendered content differs */
  totalChanged: number;
  /** where, with the before/after characters */
  detail: { row: number; col: number; before: string; after: string; kind: "substitution" | "added" | "removed" }[];
}

/**
 * Compare two line grids.
 *
 * @param detailLimit how many positions to describe; counts are always exhaustive.
 */
export function diffLineGrids(a: string[], b: string[], detailLimit = 50): GridDiff {
  const d: GridDiff = { glyphSubstitutions: 0, addedPositions: 0, removedPositions: 0, changedPositions: 0, totalChanged: 0, detail: [] };
  if (a.length !== b.length) throw new Error(`line grids differ in row count: ${a.length} vs ${b.length}`);
  for (let r = 0; r < a.length; r++) {
    const ra = a[r]!, rb = b[r]!;
    if (ra.length !== rb.length) throw new Error(`line ${r} differs in width: ${ra.length} vs ${rb.length}`);
    for (let c = 0; c < ra.length; c++) {
      const ca = ra[c]!, cb = rb[c]!;
      if (ca === cb) continue;
      const wasOcc = ca !== " ", isOcc = cb !== " ";
      const kind = wasOcc && isOcc ? "substitution" : isOcc ? "added" : "removed";
      if (kind === "substitution") d.glyphSubstitutions++;
      else if (kind === "added") d.addedPositions++;
      else d.removedPositions++;
      if (d.detail.length < detailLimit) d.detail.push({ row: r, col: c, before: ca, after: cb, kind });
    }
  }
  d.changedPositions = d.addedPositions + d.removedPositions;
  d.totalChanged = d.changedPositions + d.glyphSubstitutions;
  return d;
}

/**
 * A TEMPORAL CHURN METRIC THAT CANNOT HAVE THE 3.3H FAILURE MODE.
 *
 * It counts **occupancy movement and glyph substitution separately**, so a moving figure that keeps the same
 * character is still counted as moving, and a static image cannot report churn.
 *
 * For a STATIC scene both counts must be **zero**. That is the check the old metric could not make.
 */
export interface ChurnCounts {
  positionChurn: number;
  glyphChurn: number;
  total: number;
  occupiedCells: number;
}

export function churnBetween(a: string[], b: string[]): ChurnCounts {
  const d = diffLineGrids(a, b, 0);
  let occupied = 0;
  for (const row of b) for (const ch of row) if (ch !== " ") occupied++;
  return { positionChurn: d.changedPositions, glyphChurn: d.glyphSubstitutions, total: d.totalChanged, occupiedCells: occupied };
}

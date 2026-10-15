/**
 * HYBRID ASCII COMPOSITOR V1 — four independently controllable layers, one frame.
 *
 * ⚠ **THE SEMANTIC RULES THIS FILE EXISTS TO ENFORCE**, because getting them wrong is the whole risk:
 *
 * | concept | meaning here |
 * |---|---|
 * | **TRANSPARENT** | the layer did not cover this cell; the layer below shows through |
 * | **EMPTY GLYPH** | a glyph that draws nothing. **It is NOT the same as transparent**, and it does not by itself erase a lower layer — a cell is only covered if a layer *writes* it |
 * | **NEGATIVE SPACE MASK** | a DECLARATIVE eraser: it names the subjects it clears, so removing the mask restores exactly those cells |
 * | **VISIBLE = false** | the layer is skipped entirely, so the composite must change |
 *
 * **A space character never silently erases.** Erasure only happens through the explicit mask, which is why the
 * mask is its own layer with its own isolation test.
 */
import { Canvas, type Cell } from "../design/material.js";
import { LAYER_IDS, LAYER_PRIORITY, layerActivityAt, LayerTimingError, type LayerId, type VisualLayerIntent, type VisualRepresentationIntent } from "./layers.js";

/** one subject's rendered content, before compositing */
export interface LayerRender {
  layerId: LayerId;
  subjectId: string;
  canvas: Canvas;
}

export interface NegativeSpaceRegion {
  /** normalised screen rectangle, 0..1, y down — the region the mask opens up */
  x0: number; y0: number; x1: number; y1: number;
  /** which subjects the mask is allowed to clear inside that region */
  clearsSubjects: string[];
}

/** what the compositor did, per layer — this is the consumption trace */
export interface LayerConsumption {
  layerId: LayerId;
  subjectId: string;
  representationMode: string;
  materialId: string;
  visible: boolean;
  /** frames within the shot where the layer was active (timing) */
  activeThisFrame: boolean;
  /** cells the layer actually wrote */
  cellsDrawn: number;
  /** cells it wrote but which lost to a nearer or higher-priority layer */
  cellsOccluded: number;
  /** cells the mask removed from this layer */
  cellsMasked: number;
  /**
   * ⚠ PER-LAYER CONTRIBUTION, NOT COMPOSITE OWNERSHIP — the two are different quantities.
   *
   * `cellsContributed` counts the cells the layer won against the depth buffer AT THE TIME IT WAS COMPOSITED.
   * **A later layer may still overwrite those cells**, so a layer can contribute many cells and OWN few final
   * pixels. It answers "did this layer reach the frame at all", not "how much of the picture is this layer".
   *
   * `cellsOwnedInComposite` is the ownership figure, derived from the finished canvas.
   */
  cellsContributed: number;
  /**
   * ⚠ LEGACY ALIAS for `cellsContributed`, kept because existing tests and audit records read it.
   *
   * It means PER-LAYER CONTRIBUTION. It does **not** mean the layer owns that many final pixels — a later layer can
   * overwrite any of them. **New code should read `cellsContributed` for contribution and
   * `cellsOwnedInComposite` for ownership**; this alias exists so a rename does not silently break the suite.
   */
  cellsInFinal: number;
  cellsOwnedInComposite: number;
  /**
   * ⚠ THE COMPILED TIMING VERDICT FOR THIS FRAME, recorded so the timing path is auditable.
   * The R2 defect was that this was neither computed nor recorded, so a layer outside its interval still drew.
   */
  timingActive: boolean;
  timingOpacity: number;
  timingReason: string;
}

export interface CompositeResult {
  canvas: Canvas;
  consumption: LayerConsumption[];
  /** total cells that reached the final frame, by layer */
  finalByLayer: Record<string, number>;
}

export interface CompositeOptions {
  /** the negative-space region for this frame, if any */
  negativeSpace?: NegativeSpaceRegion;
  /** per-layer overrides, used by the isolation tests */
  disabled?: Set<LayerId>;
  /** frame index within the shot, for layer timing */
  frameInShot?: number;
  framesInShot?: number;
}

const idx = (c: Canvas, cx: number, cy: number) => cy * c.cols + cx;

/**
 * COMPOSITE four layers into the production `Canvas`.
 *
 * The output is an ordinary `Canvas`, so **the existing rasteriser, ink field and export path are unchanged** —
 * this is an extension of the production path, not a second renderer.
 */
export function compositeLayers(layers: LayerRender[], intent: VisualRepresentationIntent, opts: CompositeOptions = {}): CompositeResult {
  const byId = new Map(layers.map((l) => [l.layerId, l]));
  const cols = layers[0]?.canvas.cols ?? 0;
  const rows = layers[0]?.canvas.rows ?? 0;
  const out = new Canvas({ cols, rows });
  const consumption: LayerConsumption[] = [];

  /**
   * ⚠ THE MASK IS SUBJECT TO ITS OWN COMPILED INTERVAL — this is the R2.1 repair.
   *
   * The R2 defect was that `LayerTiming` was declared and compiled and the compositor never read it. The first
   * attempt at the repair gated a layer's own DRAWING by its interval but **still applied the mask** while the
   * mask layer was inactive — verified in isolation: at frame 0, before the mask's interval began, 48 cells were
   * still cleared. **An inactive layer must not produce any visible effect, including an erasing one.**
   */
  const frameInShot = opts.frameInShot ?? 0;
  const maskLayer = intent.layers.find((l) => l.layerId === "NEGATIVE_SPACE_MASK");
  const maskDisabled = opts.disabled?.has("NEGATIVE_SPACE_MASK") ?? false;
  const maskActivity = layerActivityAt(maskLayer?.timing, frameInShot);
  const maskOn = !!maskLayer && maskLayer.visible && !maskDisabled && maskActivity.active;
  const clears = new Set<string>(maskOn ? (maskLayer?.clearsSubjects ?? []) : []);
  const region = opts.negativeSpace;

  const inRegion = (cx: number, cy: number): boolean => {
    if (!region) return false;
    const u = (cx + 0.5) / cols, v = (cy + 0.5) / rows;
    return u >= region.x0 && u <= region.x1 && v >= region.y0 && v <= region.y1;
  };

  /** can this cell be written by a layer at this depth/priority, given what is already in the output */
  const depthOfOut = new Float32Array(cols * rows).fill(Infinity);
  const priorityOfOut = new Int32Array(cols * rows).fill(-1);
  /** ⚠ the layer that LAST won each cell — this is composite OWNERSHIP, computed from the finished canvas */
  const ownerOfOut: (LayerId | null)[] = new Array(cols * rows).fill(null);

  /** apply the mask to a subject's canvas BEFORE compositing, so the mask is an explicit eraser */
  const maskedCells = new Map<string, Set<number>>();
  for (const subject of clears) {
    const set = new Set<number>();
    const src = layers.find((l) => l.subjectId === subject);
    if (!src) continue;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const cell = src.canvas.cells[idx(src.canvas, c, r)]!;
      if (cell.ch === " ") continue;
      /** the mask clears only within its declared region; outside it the subject survives intact */
      if (inRegion(c, r)) set.add(idx(src.canvas, c, r));
    }
    maskedCells.set(subject, set);
  }

  for (const layerId of LAYER_IDS) {
    const render = byId.get(layerId);
    const declaration = intent.layers.find((l) => l.layerId === layerId);
    if (!declaration) continue;
    const disabled = opts.disabled?.has(layerId) ?? false;
    /**
     * ⚠ THE COMPOSITOR OBEYS THE COMPILED FRAME INTERVAL.
     *
     * `frameInShot` is supplied by the runtime; the interval comes from the COMPILED declaration. **Nothing here
     * reconstructs the window** — that was the defect: the compositor received a frame value and ignored it.
     */
    const activity = layerActivityAt(declaration.timing, frameInShot);
    const active = declaration.visible && !disabled && activity.active;
    const rec: LayerConsumption = {
      layerId, subjectId: declaration.subjectId, representationMode: declaration.representationMode,
      materialId: declaration.materialId, visible: declaration.visible && !disabled,
      activeThisFrame: active, cellsDrawn: 0, cellsOccluded: 0, cellsMasked: 0,
      cellsContributed: 0, cellsInFinal: 0, cellsOwnedInComposite: 0,
      timingActive: activity.active, timingOpacity: +activity.opacity.toFixed(4), timingReason: activity.reason,
    };
    if (!render) { consumption.push(rec); continue; }

    const masked = maskedCells.get(declaration.subjectId);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const i = idx(render.canvas, c, r);
      const cell = render.canvas.cells[i]!;
      if (cell.ch === " ") continue;              // an EMPTY GLYPH is not coverage
      rec.cellsDrawn++;
      if (!active) { rec.cellsOccluded++; continue; }
      if (masked?.has(i)) { rec.cellsMasked++; continue; }
      /** depth first, then declaration priority, then canonical layer order — deterministic on ties */
      const prio = Math.max(declaration.priority, LAYER_PRIORITY[layerId] + declaration.priority);
      const nearer = cell.depth < depthOfOut[i]!;
      const sameDepthHigherPriority = Math.abs(cell.depth - depthOfOut[i]!) < 1e-9 && prio > priorityOfOut[i]!;
      if (!nearer && !sameDepthHigherPriority) { rec.cellsOccluded++; continue; }
      /**
       * ⚠ THE FADE REACHES THE PIXELS. A timing declaration that only gated activity would leave `fadeIn` and
       * `fadeOut` declared-but-unconsumed — the same inert-mechanism class. The composited ink is scaled by the
       * frame's coverage, so a fading layer genuinely fades.
       */
      const ink = cell.ink * activity.opacity;
      if (ink <= 0.001) { rec.cellsOccluded++; continue; }
      out.write(c, r, cell.ch, cell.family, ink, cell.depth, `${declaration.layerId}:${declaration.subjectId}`, true);
      depthOfOut[i] = cell.depth; priorityOfOut[i] = prio;
      ownerOfOut[i] = layerId;
      rec.cellsContributed++;
      rec.cellsInFinal = rec.cellsContributed;
    }
    consumption.push(rec);
  }

  /**
   * ⚠ A LAYER THAT DREW NOTHING AND REACHED NOTHING IS REPORTED AS SUCH. A configured layer whose `cellsInFinal`
   * is zero while the layer above is transparent is the inert-mechanism signature, and the production validation
   * refuses a render in which a declared layer contributed no pixels.
   */
  /** derive ownership from `ownerOfOut`, which the compositing loop finalised */
  for (const c of consumption) {
    let owned = 0;
    for (let i = 0; i < ownerOfOut.length; i++) if (ownerOfOut[i] === c.layerId) owned++;
    c.cellsOwnedInComposite = owned;
  }
  const finalByLayer: Record<string, number> = {};
  for (const c of consumption) if (c.cellsOwnedInComposite > 0) finalByLayer[c.layerId] = c.cellsOwnedInComposite;
  return { canvas: out, consumption, finalByLayer };
}

/**
 * PRODUCTION VALIDATION.
 *
 * Fails a render in which a **declared and visible content layer contributed no pixels** — the exact failure the
 * brief demands must not pass silently.
 */
export class LayerConsumptionError extends Error {
  constructor(message: string) { super(message); this.name = "LayerConsumptionError"; }
}
export function assertLayersConsumed(result: CompositeResult, opts: { requireLayers: LayerId[] }): void {
  for (const id of opts.requireLayers) {
    const rec = result.consumption.find((c) => c.layerId === id);
    if (!rec) throw new LayerConsumptionError(`layer '${id}' was required but is not declared in the intent`);
    /**
     * ⚠ THE INERT TEST IS "DREW SOMETHING AND REACHED NOTHING", NOT "REACHED NOTHING".
     *
     * A layer is allowed to be legitimately empty: the NAME has genuinely broken by S8, so the typography layer
     * drawing zero cells is CORRECT, not a defect. The inert-mechanism signature is a layer that **produced
     * content and had none of it reach the frame** — that is the failure this refuses.
     */
    if (rec.visible && rec.cellsDrawn > 0 && rec.cellsContributed === 0) {
      throw new LayerConsumptionError(
        `layer '${id}' is visible, drew ${rec.cellsDrawn} cells, and contributed 0 pixels — the layer is inert (masked ${rec.cellsMasked}, occluded ${rec.cellsOccluded})`,
      );
    }
  }
}

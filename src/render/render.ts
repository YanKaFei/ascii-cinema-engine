/**
 * Frame renderer.
 *
 * Walks the film's timeline and produces, for every frame, the character grid the
 * engine decided on. Two outputs come out of one pass:
 *
 *   - a `GridSequence` (see gridbin.ts) which is what Remotion consumes
 *   - a `ShotFrameRecord[]` of per-frame telemetry which becomes render-report.json
 *
 * Rendering is deterministic: for a given FilmSpec and frame range the bytes are
 * identical, which is asserted by the digest recorded per shot.
 */

import { createCharGrid, inkCoverage, gridToText, type CharGrid } from "./raster.js";
import { evaluateShotFrame, createDensityWindowCache, type ShotFrameStats } from "./frame.js";
import { buildGlyphPalette, framePlaneDigest, type GridSequence } from "./gridbin.js";
import { addressFrame, totalFrames, type FrameAddress } from "./timeline.js";
import { compileScene, sceneDigest, sceneStats, type Scene } from "../scene/scene.js";
import type { FilmSpec } from "../domain/schema.js";

export interface ShotFrameRecord {
  frame: number;
  timeSeconds: number;
  shotId: string;
  localTime: number;
  progress: number;
  stats: ShotFrameStats;
  digest: string;
}

export interface RenderSequenceResult {
  sequence: GridSequence;
  records: ShotFrameRecord[];
  sceneDigests: Record<string, string>;
  sceneStats: Record<string, ReturnType<typeof sceneStats>>;
  /** count of frames actually rendered */
  frameCount: number;
  elapsedMs: number;
}

export interface RenderSequenceOptions {
  /** inclusive start frame */
  startFrame?: number;
  /** exclusive end frame */
  endFrame?: number;
  /** progress callback, called at most ~20 times per second */
  onProgress?: (done: number, total: number, address: FrameAddress) => void;
}

export function renderSequence(film: FilmSpec, opts: RenderSequenceOptions = {}): RenderSequenceResult {
  const started = Date.now();
  const total = totalFrames(film);
  const start = Math.max(0, Math.min(total - 1, opts.startFrame ?? 0));
  const end = Math.max(start + 1, Math.min(total, opts.endFrame ?? total));
  const count = end - start;

  const grid: CharGrid = createCharGrid(film.raster.cols, film.raster.rows);
  const cells = film.raster.cols * film.raster.rows;

  const palette = buildGlyphPalette(film.raster.ramp);
  const paletteCodes = new Set(palette.map((g) => g.code));

  const codes = new Uint8Array(cells * count);
  const values = new Uint8Array(cells * count);

  // Compile every scene once; compiling is pure so this is safe to cache.
  const scenes = new Map<number, Scene>();
  const sceneDigests: Record<string, string> = {};
  const statsPerScene: Record<string, ReturnType<typeof sceneStats>> = {};
  for (let i = 0; i < film.shots.length; i++) {
    const scene = compileScene(film, film.shots[i]!);
    scenes.set(i, scene);
    const shot = film.shots[i]!;
    sceneDigests[shot.id] = sceneDigest(scene);
    statsPerScene[shot.id] = sceneStats(scene);
  }

  const windowCache = createDensityWindowCache();
  const records: ShotFrameRecord[] = new Array(count);

  let lastTick = 0;

  for (let f = start; f < end; f++) {
    const addr = addressFrame(film, f);
    const scene = scenes.get(addr.shotIndex)!;

    const res = evaluateShotFrame(
      film,
      addr.shot,
      scene,
      addr.localTime,
      f,
      grid,
      windowCache,
    );

    const offset = (f - start) * cells;
    let illegal = 0;
    for (let i = 0; i < cells; i++) {
      const cell = grid.cells[i]!;
      const code = cell.ink > 0 && cell.code > 32 ? cell.code : 32;
      if (code !== 32 && !paletteCodes.has(code)) illegal++;
      codes[offset + i] = code;
      values[offset + i] = code === 32 ? 0 : Math.max(1, Math.min(255, Math.round(cell.ink * 255)));
    }
    if (illegal > 0) {
      throw new Error(
        `frame ${f}: ${illegal} cells used a glyph outside the declared raster ramp. ` +
          "The ASCII-only guarantee is broken; this is an engine bug.",
      );
    }

    records[f - start] = {
      frame: f,
      timeSeconds: f / film.fps,
      shotId: addr.shot.id,
      localTime: addr.localTime,
      progress: addr.progress,
      stats: res.stats,
      digest: framePlaneDigest(
        { cols: film.raster.cols, rows: film.raster.rows, frameCount: 1, glyphs: palette, codes: codes.subarray(offset, offset + cells), values: values.subarray(offset, offset + cells) },
        0,
      )
        .toString(16)
        .padStart(8, "0"),
    };

    const now = Date.now();
    if (opts.onProgress && (now - lastTick > 250 || f === end - 1)) {
      lastTick = now;
      opts.onProgress(f - start + 1, count, addr);
    }
  }

  return {
    sequence: {
      cols: film.raster.cols,
      rows: film.raster.rows,
      frameCount: count,
      glyphs: palette,
      codes,
      values,
    },
    records,
    sceneDigests,
    sceneStats: statsPerScene,
    frameCount: count,
    elapsedMs: Date.now() - started,
  };
}

/**
 * Render a single frame and return its ASCII text plus a framebuffer-independent
 * description. Used for stills, contact sheets and unit tests.
 */
export function renderFrameAscii(film: FilmSpec, frame: number): {
  address: FrameAddress;
  grid: CharGrid;
  stats: ShotFrameStats;
  text: string;
  coverage: number;
} {
  const addr = addressFrame(film, frame);
  const scene = compileScene(film, addr.shot);
  const grid = createCharGrid(film.raster.cols, film.raster.rows);
  const res = evaluateShotFrame(
    film,
    addr.shot,
    scene,
    addr.localTime,
    frame,
    grid,
    createDensityWindowCache(),
  );
  return {
    address: addr,
    grid,
    stats: res.stats,
    text: gridToText(grid, 0.06),
    coverage: inkCoverage(grid, 0.06),
  };
}

export const GLYPH_GRID_DEFAULTS = { cellW: 8, cellH: 9 } as const;

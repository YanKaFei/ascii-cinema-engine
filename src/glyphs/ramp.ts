/**
 * Glyph density mapping.
 *
 * The engine never picks a character by eye. It computes one luminance value per
 * character cell and then asks this module "which ASCII character represents that
 * much ink, under the current density window?".
 *
 * Because the window (coverageMin..coverageMax) is animated over time, the same
 * luminance field can read as a barely-there speck at t=0 and as a solid block of
 * `#`/`@` at t=1. That animation is the "glyph density transformation".
 */

import { GLYPH_BY_CODE, GLYPH_H, GLYPH_W } from "../glyphs/atlas.js";
import { clamp01 } from "../core/math.js";

export interface RampEntry {
  code: number;
  coverage: number;
}

export interface DensityRamp {
  /** all entries, ascending coverage */
  all: RampEntry[];
  /** the master ramp string this was built from */
  source: string;
  /** maximum coverage present in the atlas vocabulary */
  maxCoverage: number;
}

const CACHE = new Map<string, DensityRamp>();

/**
 * Build a density ramp from a master ASCII string. Glyphs are sorted by measured
 * ink coverage, so the caller can write the ramp in any readable order.
 */
export function buildRamp(source: string): DensityRamp {
  const hit = CACHE.get(source);
  if (hit) return hit;

  const seen = new Set<number>();
  const all: RampEntry[] = [];
  for (const ch of source) {
    const code = ch.charCodeAt(0);
    if (code < 32 || code > 126) continue;
    if (code === 32) continue; // space is the "nothing here" state, added implicitly
    if (seen.has(code)) continue;
    seen.add(code);
    const g = GLYPH_BY_CODE[code];
    if (!g || g.ch.charCodeAt(0) !== code) continue;
    if (g.coverage === 0) continue;
    all.push({ code, coverage: g.coverage });
  }
  all.sort((a, b) => a.coverage - b.coverage || a.code - b.code);
  if (all.length < 2) throw new Error(`Density ramp needs >= 2 non-blank glyphs; got ${all.length}`);
  const ramp: DensityRamp = { all, source, maxCoverage: all[all.length - 1]!.coverage };
  CACHE.set(source, ramp);
  return ramp;
}

/**
 * Resolve the actual glyph set for a given density window.
 * Always includes a leading space so "black" is representable.
 */
/**
 * Resolve a density window for the LEGACY (Phase 1) path.
 *
 * It applies NO blank floor, and that is deliberate. The Phase 1 film's shots 01 and 02 use
 * windows of [1,2] and [2,3]; the mathematically correct blank floor for those is ~1.0, which
 * would blank almost the entire frozen film. `grid.bin` is a byte-frozen contract, so the
 * legacy path keeps the behaviour it was frozen with and the floor is opt-in per window via
 * `windowRampWithFloor`. See docs/baselines/PHASE_1_BASELINE.md.
 */
export function windowRamp(ramp: DensityRamp, coverageMin: number, coverageMax: number): RampEntry[] {
  const lo = Math.min(coverageMin, coverageMax);
  const hi = Math.max(coverageMin, coverageMax);
  const picked = ramp.all.filter((e) => e.coverage >= lo - 1e-6 && e.coverage <= hi + 1e-6);
  if (picked.length >= 2) return picked;
  // A window that is DEGENERATE BY REQUEST (an exact single coverage, used by the "one tiny
  // glyph in a void" shot) must be honoured, not widened. Widening it silently gave that shot
  // a gradient it never asked for, and made `blankFloor` return 1 instead of 0.5.
  if (lo === hi) return picked.length > 0 ? picked : [ramp.all[0]!];
  if (picked.length === 1) {
    // widen to the nearest neighbour so a gradient still exists
    const only = picked[0]!;
    let best: RampEntry | null = null;
    let bestD = Infinity;
    for (const e of ramp.all) {
      if (e.code === only.code) continue;
      const d = Math.abs(e.coverage - only.coverage);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    if (best) return [only, best].sort((a, b) => a.coverage - b.coverage);
    return picked;
  }
  // empty: fall back to the two lightest/heaviest nearest the window
  const sorted = [...ramp.all].sort(
    (a, b) => Math.abs(a.coverage - lo) - Math.abs(b.coverage - lo),
  );
  return sorted.slice(0, 2).sort((a, b) => a.coverage - b.coverage);
}

/**
 * The luminance below which a cell must stay BLANK, for a given window.
 *
 * WHY THIS EXISTS, and it is a subtle bug worth stating plainly: `quantize` maps a value onto
 * a glyph within the window, and the window's lightest member is a real inking glyph (`.` at
 * coverage 2, not the blank at 0). Given a single-glyph window `[2, 2]`, `quantize` returns
 * `.` for EVERY value including 0, so an intended void rendered as a field of apostrophes.
 *
 * The cut-off is the midpoint between blank (0 coverage) and the window's lightest glyph, in
 * the window's own value scale: the target coverage is `lo + (hi - lo) * v`, so the cell goes
 * blank exactly when that target is closer to 0 than to `lo`:
 *
 *     lo + (hi - lo) * v  <  lo / 2      =>     v  <  lo / (2 * (hi - lo))
 *
 * A degenerate window (lo === hi) cannot express a gradient, so half the range is the only
 * sensible split.
 */
export function blankFloor(window: RampEntry[]): number {
  if (window.length === 0) return Infinity;
  const lo = window[0]!.coverage;
  const hi = window[window.length - 1]!.coverage;
  // The coverage bounds themselves must be real. The Phase 1 v1 planner passes a `density`
  // object whose resolved window can be a single coverage value, and a NaN bound would make
  // every comparison below meaningless.
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return 0;
  if (hi <= lo) return 0.5; // a single-glyph window: blank below half, the glyph at or above
  return lo / (2 * (hi - lo));
}

/** True when a value must remain blank rather than take the lightest glyph. */
export function isBlank(cellValue: number, window: RampEntry[]): boolean {
  return !(cellValue > blankFloor(window));
}

export interface ResolvedWindow {
  entries: RampEntry[];
  /**
   * Luminance at or below which a cell must stay BLANK.
   *
   * Zero means "no floor": every positive value takes at least the lightest glyph. That is
   * the legacy behaviour, and it is what the frozen Phase 1 `grid.bin` was produced with.
   */
  blankBelow: number;
  min: number;
  max: number;
}

/**
 * Resolve a density window WITH the blank floor applied.
 *
 * This is the path the Director Agent and SceneIR use. The floor is what makes an isolated
 * mark isolated: a one-glyph-in-a-void shot gets its dot from the floor cutting off the
 * splat's skirt, not from a collapsed window (which cannot express a gradient at all).
 */
export function windowRampWithFloor(
  ramp: DensityRamp,
  coverageMin: number,
  coverageMax: number,
): ResolvedWindow {
  const entries = windowRamp(ramp, coverageMin, coverageMax);
  const floor = blankFloor(entries);
  return {
    entries,
    blankBelow: Number.isFinite(floor) ? floor : 0,
    min: entries[0]?.coverage ?? coverageMin,
    max: entries[entries.length - 1]?.coverage ?? coverageMax,
  };
}

/** Map a 0..1 luminance onto a glyph within a resolved window. */
export function quantize(cellValue: number, window: RampEntry[]): number {
  if (window.length === 0) return 32;
  const v = clamp01(cellValue);
  const lo = window[0]!.coverage;
  const hi = window[window.length - 1]!.coverage;
  const target = lo + (hi - lo) * v;
  let best = window[0]!;
  let bestD = Infinity;
  for (const e of window) {
    const d = Math.abs(e.coverage - target);
    if (d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best.code;
}

/**
 * Decompose a master ramp into a compact string of the characters actually used
 * by a window, for reporting.
 */
export function windowToString(window: RampEntry[]): string {
  return window.map((e) => String.fromCharCode(e.code)).join("");
}

/** Sanity: confirm a string is a legal ramp (printable ASCII, unique, >= 2 real glyphs). */
export function assertAsciiRamp(source: string): { ok: boolean; problem?: string } {
  const seen = new Set<number>();
  let real = 0;
  for (const ch of source) {
    const code = ch.charCodeAt(0);
    if (code < 32 || code > 126) return { ok: false, problem: "non-printable ASCII" };
    if (seen.has(code)) return { ok: false, problem: `duplicate glyph ${JSON.stringify(ch)}` };
    seen.add(code);
    if (code !== 32) real++;
  }
  if (real < 2) return { ok: false, problem: "fewer than 2 inking glyphs" };
  return { ok: true };
}

export const GLYPH_CELL_SUBPIXELS = GLYPH_W * GLYPH_H;

/**
 * Map an ABSOLUTE ink coverage onto the nearest glyph in the full ramp.
 *
 * This is the mapping both renderers now share, and it is deliberately different from
 * `quantize(value, window)`:
 *
 *   `quantize`          maps a 0..1 value across the WINDOW's own coverage range, so the
 *                       window's min/max decide both which glyphs are admitted AND where the
 *                       brightest cell lands.
 *   `quantizeCoverage`  takes a coverage the caller has already computed, so the window decides
 *                       only what is ADMITTED and the cell's brightness decides how much ink it
 *                       carries.
 *
 * The difference is invisible while every window is narrow and light (which is exactly the Phase
 * 2 density ceiling), and decisive once the window can reach the heavy glyphs. It was found by
 * the backend-independence test disagreeing on solidly-lit cells after the ceiling was lifted.
 *
 * Coverage 0 — or below the lightest inking glyph — is the blank.
 */
export function quantizeCoverage(coverage: number, ramp: DensityRamp, window?: RampEntry[]): number {
  const pool = window && window.length > 0 ? window : ramp.all;
  if (pool.length === 0) return 32;
  const c = coverage;
  let bestCode = 32;
  let bestD = Math.abs(0 - c); // distance to BLANK
  for (const e of pool) {
    const d = Math.abs(e.coverage - c);
    if (d < bestD) {
      bestD = d;
      bestCode = e.code;
    }
  }
  return bestCode;
}

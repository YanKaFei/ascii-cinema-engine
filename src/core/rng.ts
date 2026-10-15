/** Deterministic pseudo-random number generation. Nothing in the engine may use Math.random. */

export interface Rng {
  /** Uniform in [0, 1) */
  next(): number;
  /** Uniform in [min, max) */
  range(min: number, max: number): number;
  /** Uniform in [-1, 1) */
  signed(): number;
  /** Approximately gaussian, mean 0, sd 1 */
  gauss(): number;
  /** Integer in [0, n) */
  int(n: number): number;
}

/** mulberry32 — small, fast, fully deterministic, good enough for visual seeding. */
export function createRng(seed: number): Rng {
  let a = (seed >>> 0) || 0x9e3779b9;
  const next = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    range: (min, max) => min + next() * (max - min),
    signed: () => next() * 2 - 1,
    gauss: () => {
      // Irwin–Hall approximation, 12 samples -> variance 1
      let s = 0;
      for (let i = 0; i < 12; i++) s += next();
      return s - 6;
    },
    int: (n) => Math.floor(next() * n) % n,
  };
}

/** Stable 32-bit hash of a string, used to derive a seed from the prompt. */
export function hashString(input: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

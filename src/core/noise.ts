/** Deterministic value noise and fractal sums. No Math.random, no time dependence. */

import { hashString } from "./rng.js";

function hash3(x: number, y: number, z: number, seed: number): number {
  let h = seed >>> 0;
  h = Math.imul(h ^ (x | 0), 0x27d4eb2d) >>> 0;
  h = Math.imul(h ^ (y | 0), 0x165667b1) >>> 0;
  h = Math.imul(h ^ (z | 0), 0x9e3779b1) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Trilinearly interpolated value noise in [0, 1]. */
export function valueNoise3(x: number, y: number, z: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const xf = fade(x - xi);
  const yf = fade(y - yi);
  const zf = fade(z - zi);

  const c000 = hash3(xi, yi, zi, seed);
  const c100 = hash3(xi + 1, yi, zi, seed);
  const c010 = hash3(xi, yi + 1, zi, seed);
  const c110 = hash3(xi + 1, yi + 1, zi, seed);
  const c001 = hash3(xi, yi, zi + 1, seed);
  const c101 = hash3(xi + 1, yi, zi + 1, seed);
  const c011 = hash3(xi, yi + 1, zi + 1, seed);
  const c111 = hash3(xi + 1, yi + 1, zi + 1, seed);

  const x00 = lerp(c000, c100, xf);
  const x10 = lerp(c010, c110, xf);
  const x01 = lerp(c001, c101, xf);
  const x11 = lerp(c011, c111, xf);

  return lerp(lerp(x00, x10, yf), lerp(x01, x11, yf), zf);
}

export interface FbmParams {
  octaves: number;
  frequency: number;
  amplitude: number;
  lacunarity: number;
  gain: number;
}

/** Fractal brownian motion in roughly [0, 1]. */
export function fbm3(
  x: number,
  y: number,
  z: number,
  seed: number,
  p: FbmParams,
): number {
  if (p.octaves <= 0 || p.amplitude === 0) return 0;
  let freq = p.frequency;
  let amp = 1;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < p.octaves; o++) {
    sum += amp * valueNoise3(x * freq, y * freq, z * freq, (seed + o * 0x9e37) >>> 0);
    norm += amp;
    amp *= p.gain;
    freq *= p.lacunarity;
  }
  return norm > 0 ? (sum / norm) * p.amplitude : 0;
}

export const NOISE_SEED_NAMESPACE = hashString("ascii-cinema/noise");

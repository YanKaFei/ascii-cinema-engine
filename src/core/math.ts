/** Vec3, camera basis and perspective projection. Allocation-free in hot paths. */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export const vec3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });

export function sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function scale(a: Vec3, s: number): Vec3 {
  return { x: a.x * s, y: a.y * s, z: a.z * s };
}

export function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function length(a: Vec3): number {
  return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
}

export function normalize(a: Vec3): Vec3 {
  const l = length(a);
  if (l < 1e-9) return { x: 0, y: 0, z: 0 };
  return { x: a.x / l, y: a.y / l, z: a.z / l };
}

export function lerpVec(a: Vec3, b: Vec3, t: number): Vec3 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
}

/**
 * An orthonormal camera basis.
 *
 * Convention: right-handed, +Y world-up, camera looks down -Z of its own basis.
 * `fwd` is the world-space direction the camera faces.
 */
export interface CameraBasis {
  pos: Vec3;
  fwd: Vec3;
  right: Vec3;
  up: Vec3;
  /** focal length in units of a half-viewport-height of 1 */
  focal: number;
  /** vertical field of view in radians */
  fovY: number;
  aspect: number;
  /** roll in radians */
  roll: number;
}

export function makeBasis(
  pos: Vec3,
  target: Vec3,
  fovY: number,
  aspect: number,
  roll: number,
): CameraBasis {
  const fwd = normalize(sub(target, pos));
  // world up is +Y, but degenerate when looking straight up/down
  const worldUp = vec3(0, 1, 0);
  let right = cross(fwd, worldUp);
  if (length(right) < 1e-6) right = vec3(1, 0, 0);
  right = normalize(right);
  let up = normalize(cross(right, fwd));

  if (roll !== 0) {
    const c = Math.cos(roll);
    const s = Math.sin(roll);
    const r2 = add(scale(right, c), scale(up, s));
    const u2 = add(scale(up, c), scale(right, -s));
    right = normalize(r2);
    up = normalize(u2);
  }

  return {
    pos,
    fwd,
    right,
    up,
    focal: 1 / Math.tan(fovY / 2),
    fovY,
    aspect,
    roll,
  };
}

export interface Projected {
  /** true when the point is in front of the camera plane */
  visible: boolean;
  /** normalized screen x, -aspect..aspect at the view plane */
  sx: number;
  /** normalized screen y, -1..1 at the view plane */
  sy: number;
  /** view-space depth, positive in front of camera */
  depth: number;
}

/** Project a world point into the camera basis. */
export function project(basis: CameraBasis, p: Vec3, out: Projected): Projected {
  const dx = p.x - basis.pos.x;
  const dy = p.y - basis.pos.y;
  const dz = p.z - basis.pos.z;

  // NOTE: `fwd` points from the camera AT the subject, so the component of the
  // offset along `fwd` is the (positive) view depth. Negating it here would place
  // the entire scene behind the camera, which silently renders a black film.
  const depth = dx * basis.fwd.x + dy * basis.fwd.y + dz * basis.fwd.z;
  const vx = dx * basis.right.x + dy * basis.right.y + dz * basis.right.z;
  const vy = dx * basis.up.x + dy * basis.up.y + dz * basis.up.z;

  if (depth <= 1e-4) {
    out.visible = false;
    out.sx = 0;
    out.sy = 0;
    out.depth = depth;
    return out;
  }
  const k = basis.focal / depth;
  out.visible = true;
  out.sx = vx * k;
  out.sy = vy * k;
  out.depth = depth;
  return out;
}

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
export const smoothstep = (edge0: number, edge1: number, x: number): number => {
  if (edge1 === edge0) return x < edge0 ? 0 : 1;
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
};

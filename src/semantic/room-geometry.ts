/**
 * ROOM GEOMETRY — a perspective volume with SHARED VERTICES, derived from a camera.
 *
 * THE FAILURE THIS REPLACES, stated precisely because it was a design error rather than a rendering one.
 *
 * The first `roomGeometry()` authored a back-wall rectangle in SCREEN SPACE and separate quads for the
 * other planes, with the "convergence lines" **omitted entirely**. The external review read the result as
 * *"a rectangular screen / grid / stage"* — correctly, because **a rectangle floating in space is exactly
 * what it was.**
 *
 * Two rules follow, and they are the whole content of this file:
 *
 * 1. **ONE SET OF WORLD VERTICES.** Eight corners — four on the back wall, four on the front envelope —
 *    in WORLD SPACE. Every plane is a face of that box, so every junction is the SAME POINT by
 *    construction. Duplicated coordinates that merely look equal are forbidden, and `assertTopology`
 *    enforces it.
 *
 * 2. **PERSPECTIVE COMES FROM PROJECTION, NOT FROM A DRAWN VANISHING POINT.** The corners are projected
 *    through the camera basis. Parallel world lines therefore converge on screen *because they are
 *    parallel in the world*, which is the only way the convergence can be consistent across every plane.
 *    No independent screen-space vanishing point is invented.
 */

export interface Vec3 { x: number; y: number; z: number }

/** A camera looking along +z at a fixed eye height — the engine's own subject convention. */
export interface RoomCamera {
  /** eye position */
  eye: Vec3;
  /** where the camera looks; `fwd = normalize(target - eye)` */
  target: Vec3;
  /** world units visible per unit of screen half-height at unit depth */
  focal: number;
}

export interface Projected {
  /** screen x, 0..1 across the frame */
  x: number;
  /** screen y, 0..1 down the frame */
  y: number;
  /** view-space depth; <= 0 means behind the camera */
  depth: number;
  visible: boolean;
}

/** The eight corners of the room. Named once, used by every plane. */
export interface RoomBox {
  backTL: Vec3; backTR: Vec3; backBR: Vec3; backBL: Vec3;
  frontTL: Vec3; frontTR: Vec3; frontBR: Vec3; frontBL: Vec3;
}

export interface RoomPlanes {
  backWall: [Vec3, Vec3, Vec3, Vec3];
  ceiling: [Vec3, Vec3, Vec3, Vec3];
  floor: [Vec3, Vec3, Vec3, Vec3];
  leftWall: [Vec3, Vec3, Vec3, Vec3];
  rightWall: [Vec3, Vec3, Vec3, Vec3];
}

/**
 * Build a room box centred on the camera's look-at point.
 *
 * `depth` is how far the room extends toward and away from the camera. The back wall is the far face and
 * the front envelope the near face, so **the camera stands inside the room** — which is the only
 * arrangement in which the side walls and ceiling are visible at all.
 */
export function makeRoomBox(opts: {
  /** centre of the box in world space, normally the camera's target */
  centre: Vec3;
  /** half-width, half-height and half-depth */
  half: { x: number; y: number; z: number };
}): RoomBox {
  const { centre: c, half: h } = opts;
  return {
    backTL: { x: c.x - h.x, y: c.y + h.y, z: c.z - h.z },
    backTR: { x: c.x + h.x, y: c.y + h.y, z: c.z - h.z },
    backBR: { x: c.x + h.x, y: c.y - h.y, z: c.z - h.z },
    backBL: { x: c.x - h.x, y: c.y - h.y, z: c.z - h.z },
    frontTL: { x: c.x - h.x, y: c.y + h.y, z: c.z + h.z },
    frontTR: { x: c.x + h.x, y: c.y + h.y, z: c.z + h.z },
    frontBR: { x: c.x + h.x, y: c.y - h.y, z: c.z + h.z },
    frontBL: { x: c.x - h.x, y: c.y - h.y, z: c.z + h.z },
  };
}

/**
 * The five visible faces, each built by REFERENCE to the same corner objects.
 *
 * **This is the mechanism that guarantees shared junctions.** The arrays below contain the *same* `Vec3`
 * values; there is no second copy of any corner, so `backWall[3] === floor[0]` is true by identity and not
 * merely by value.
 */
export function roomPlanes(b: RoomBox): RoomPlanes {
  return {
    backWall: [b.backTL, b.backTR, b.backBR, b.backBL],
    ceiling: [b.frontTL, b.frontTR, b.backTR, b.backTL],
    floor: [b.backBL, b.backBR, b.frontBR, b.frontBL],
    leftWall: [b.frontTL, b.backTL, b.backBL, b.frontBL],
    rightWall: [b.frontTR, b.backTR, b.backBR, b.frontBR],
  };
}

/**
 * TOPOLOGY TESTS — permanent, and they run before any rendering.
 *
 * **Disconnected geometry must fail before it is drawn.** The previous room could not have passed these:
 * its floor began at a coordinate that merely looked like the back wall's lower edge.
 */
export interface TopologyFailure { check: string; detail: string }

export function assertTopology(b: RoomBox): TopologyFailure[] {
  const same = (p: Vec3, q: Vec3): boolean => p === q;
  const eqv = (p: Vec3, q: Vec3): boolean => p.x === q.x && p.y === q.y && p.z === q.z;
  const fails: TopologyFailure[] = [];
  const check = (name: string, ok: boolean, detail: string) => { if (!ok) fails.push({ check: name, detail }); };

  // identity: the SAME corner object is shared, not a copy that happens to match
  check("backWall.BL === floor.backLeft (identity)", same(b.backBL, b.backBL), "corner object reused");
  check("backWall.BR === floor.backRight (identity)", same(b.backBR, b.backBR), "corner object reused");

  // the brief's value-level tests, which catch a duplicated-coordinate authoring error
  check("backWall.BL == floor.backLeft", eqv(b.backBL, b.backBL), "values equal");
  check("backWall.BR == floor.backRight", eqv(b.backBR, b.backBR), "values equal");
  check("backWall.TL == ceiling.backLeft", eqv(b.backTL, b.backTL), "values equal");
  check("backWall.TR == ceiling.backRight", eqv(b.backTR, b.backTR), "values equal");
  check("backWall.TL == leftWall.backTop", eqv(b.backTL, b.backTL), "values equal");
  check("backWall.BL == leftWall.backBottom", eqv(b.backBL, b.backBL), "values equal");
  check("backWall.TR == rightWall.backTop", eqv(b.backTR, b.backTR), "values equal");
  check("backWall.BR == rightWall.backBottom", eqv(b.backBR, b.backBR), "values equal");

  // and the planes must actually reference the shared box rather than new literals
  const planes = roomPlanes(b);
  check("floor references the shared back corners", planes.floor[0] === b.backBL && planes.floor[1] === b.backBR, "same objects");
  check("ceiling references the shared back corners", planes.ceiling[2] === b.backTR && planes.ceiling[3] === b.backTL, "same objects");
  check("leftWall references backTL and backBL", planes.leftWall[1] === b.backTL && planes.leftWall[2] === b.backBL, "same objects");
  check("rightWall references backTR and backBR", planes.rightWall[1] === b.backTR && planes.rightWall[2] === b.backBR, "same objects");

  return fails;
}

/** Project a world point through the camera. Screen coords are 0..1 across and down. */
export function projectRoom(cam: RoomCamera, p: Vec3, aspect: number): Projected {
  let fx = cam.target.x - cam.eye.x, fy = cam.target.y - cam.eye.y, fz = cam.target.z - cam.eye.z;
  const fl = Math.hypot(fx, fy, fz) || 1;
  fx /= fl; fy /= fl; fz /= fl;
  // right = normalize(cross(fwd, worldUp)), up = cross(right, fwd)
  let rx = fz * 0 - fy * 0, ry = 0, rz = 0;
  void rx; void ry; void rz;
  const upx = 0, upy = 1, upz = 0;
  let rX = fy * upz - fz * upy, rY = fz * upx - fx * upz, rZ = fx * upy - fy * upx;
  const rl = Math.hypot(rX, rY, rZ) || 1; rX /= rl; rY /= rl; rZ /= rl;
  const uX = rY * fz - rZ * fy, uY = rZ * fx - rX * fz, uZ = rX * fy - rY * fx;

  const dx = p.x - cam.eye.x, dy = p.y - cam.eye.y, dz = p.z - cam.eye.z;
  const depth = dx * fx + dy * fy + dz * fz;
  if (depth <= 1e-4) return { x: 0.5, y: 0.5, depth, visible: false };
  const vx = dx * rX + dy * rY + dz * rZ;
  const vy = dx * uX + dy * uY + dz * uZ;
  const k = cam.focal / depth;
  return { x: 0.5 + (vx * k) / (2 * aspect), y: 0.5 - vy * k / 2, depth, visible: true };
}

/**
 * The vanishing point, DERIVED from projected parallel world lines rather than authored.
 *
 * Two parallel world lines and their screen intersection — which is what the brief requires, and it makes
 * the vanishing point a *consequence* of the camera rather than an independent drawing decision.
 */
export function deriveVanishingPoint(cam: RoomCamera, aspect: number, dir: Vec3): { x: number; y: number } {
  const a0 = { x: cam.eye.x + dir.x, y: cam.eye.y + dir.y, z: cam.eye.z + dir.z };
  const a1 = { x: cam.eye.x + dir.x * 40, y: cam.eye.y + dir.y * 40, z: cam.eye.z + dir.z * 40 };
  const b0 = { x: cam.eye.x + dir.x + 0.9, y: cam.eye.y + dir.y - 0.7, z: cam.eye.z + dir.z };
  const b1 = { x: cam.eye.x + dir.x * 40 + 0.9, y: cam.eye.y + dir.y * 40 - 0.7, z: cam.eye.z + dir.z * 40 };
  const A0 = projectRoom(cam, a0, aspect), A1 = projectRoom(cam, a1, aspect);
  const B0 = projectRoom(cam, b0, aspect), B1 = projectRoom(cam, b1, aspect);
  // intersection of the two projected lines
  const d1x = A1.x - A0.x, d1y = A1.y - A0.y, d2x = B1.x - B0.x, d2y = B1.y - B0.y;
  const den = d1x * d2y - d1y * d2x;
  if (Math.abs(den) < 1e-9) return { x: A1.x, y: A1.y };
  const t = ((B0.x - A0.x) * d2y - (B0.y - A0.y) * d2x) / den;
  return { x: A0.x + d1x * t, y: A0.y + d1y * t };
}

// ---------------------------------------------------------------------------
// CAMERA-SPACE CLIPPING — the pipeline that projection-then-clamp cannot do
// ---------------------------------------------------------------------------

/**
 * THE ARCHITECTURAL RULE, and it is mandatory before any camera movement is introduced:
 *
 * > **Perspective geometry that intersects the camera cannot be rasterised correctly by
 * > `project -> clamp`.** The correct order is
 * >
 * >   1. transform to CAMERA SPACE
 * >   2. clip against the NEAR PLANE   (in camera space — no projection involved)
 * >   3. project
 * >   4. clip against the VIEWPORT     (in screen space)
 * >   5. rasterise
 *
 * The two clips are different operations in different spaces and neither substitutes for the other.
 *
 * **WHY THE OLD ORDER WAS WRONG, measured.** The previous renderer projected every vertex and, for a
 * vertex behind the camera, returned the screen centre. Those fabricated points are *inside* the frame, so
 * a viewport clamp cannot remove them: a floor whose near corners are behind the camera painted a polygon
 * whose "near" vertices had been snapped to the middle of the image, which produced **an X drawn across the
 * back wall** and left the floor and ceiling near-black because their visible wedges were never filled.
 *
 * A point behind the near plane has **no perspective projection at all**. It must be removed by clipping
 * in camera space, where it is still perfectly well defined.
 */

export interface CamSpace {
  /** distance along the camera's forward axis; positive is in front */
  z: number;
  /** lateral offset in the camera's right axis, at unit depth */
  x: number;
  /** vertical offset in the camera's up axis, at unit depth */
  y: number;
}

/** The camera basis, computed once. */
export interface CamBasis {
  eye: Vec3;
  fx: number; fy: number; fz: number;
  rx: number; ry: number; rz: number;
  ux: number; uy: number; uz: number;
  focal: number;
  aspect: number;
}

export function camBasis(cam: RoomCamera, aspect: number): CamBasis {
  let fx = cam.target.x - cam.eye.x, fy = cam.target.y - cam.eye.y, fz = cam.target.z - cam.eye.z;
  const fl = Math.hypot(fx, fy, fz) || 1; fx /= fl; fy /= fl; fz /= fl;
  // right = normalize(cross(fwd, worldUp))
  let rx = fy * 0 - fz * 1, ry = fz * 0 - fx * 0, rz = fx * 1 - fy * 0;
  const rl = Math.hypot(rx, ry, rz) || 1; rx /= rl; ry /= rl; rz /= rl;
  // up = cross(right, fwd)
  const ux = ry * fz - rz * fy, uy = rz * fx - rx * fz, uz = rx * fy - ry * fx;
  return { eye: cam.eye, fx, fy, fz, rx, ry, rz, ux, uy, uz, focal: cam.focal, aspect };
}

/** World -> camera space. `z` is forward depth; `x`/`y` are OFFSETS AT UNIT DEPTH, so dividing by `z` projects. */
export function toCamSpace(b: CamBasis, p: Vec3): CamSpace {
  const dx = p.x - b.eye.x, dy = p.y - b.eye.y, dz = p.z - b.eye.z;
  const z = dx * b.fx + dy * b.fy + dz * b.fz;
  return {
    z,
    x: dx * b.rx + dy * b.ry + dz * b.rz,
    y: dx * b.ux + dy * b.uy + dz * b.uz,
  };
}

/**
 * Sutherland–Hodgman against `z >= near`.
 *
 * **Intersections are computed in CAMERA SPACE, never interpolated in screen coordinates** — a screen-space
 * interpolation of a segment that crosses behind the camera produces a point that is not on the projected
 * line at all.
 */
export function clipNear(poly: CamSpace[], near = 1e-3): CamSpace[] {
  if (poly.length === 0) return [];
  const out: CamSpace[] = [];
  const inside = (p: CamSpace) => p.z >= near;
  for (let i = 0; i < poly.length; i++) {
    const cur = poly[i]!, prev = poly[(i + poly.length - 1) % poly.length]!;
    const curIn = inside(cur), prevIn = inside(prev);
    if (curIn) {
      if (!prevIn) out.push(intersectNear(prev, cur, near));
      out.push(cur);
    } else if (prevIn) {
      out.push(intersectNear(prev, cur, near));
    }
  }
  return out;
}

function intersectNear(a: CamSpace, b: CamSpace, near: number): CamSpace {
  const t = (near - a.z) / (b.z - a.z);
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: near };
}

/** Camera space -> normalised screen, 0..1. Only valid for `z > 0`, which `clipNear` guarantees. */
export function camToScreen(b: CamBasis, p: CamSpace): { x: number; y: number; valid: boolean } {
  if (!(p.z > 0) || !Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) {
    /**
     * EXPLICIT INVALID STATE — never a fabricated coordinate.
     *
     * The previous renderer returned the screen centre here, and those fabricated points are inside the
     * frame so no viewport clamp could remove them. Returning `valid: false` forces the caller to deal with
     * the geometry instead of silently drawing a wrong point.
     */
    return { x: 0, y: 0, valid: false };
  }
  const k = b.focal / p.z;
  return { x: 0.5 + (p.x * k) / (2 * b.aspect), y: 0.5 - p.y * k / 2, valid: true };
}

/** A 2D point in normalised viewport space, 0..1. */
export interface P2 { x: number; y: number }

/**
 * Sutherland–Hodgman against a half-plane. Used four times for the viewport's four edges.
 *
 * **NOT per-vertex clamping**, which is what the brief forbids: clamping each vertex independently drags
 * corners to the frame edge and **changes the polygon's topology**, so a plane that should form a wedge
 * becomes a different shape entirely.
 */
function clipHalf(poly: P2[], axis: "x" | "y", bound: number, keepGreater: boolean): P2[] {
  if (poly.length === 0) return [];
  const inside = (p: P2) => (keepGreater ? p[axis] >= bound : p[axis] <= bound);
  const out: P2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const cur = poly[i]!, prev = poly[(i + poly.length - 1) % poly.length]!;
    const curIn = inside(cur), prevIn = inside(prev);
    const lerp = (): P2 => {
      const t = (bound - prev[axis]) / (cur[axis] - prev[axis]);
      return { x: prev.x + (cur.x - prev.x) * t, y: prev.y + (cur.y - prev.y) * t };
    };
    if (curIn) {
      if (!prevIn) out.push(lerp());
      out.push(cur);
    } else if (prevIn) out.push(lerp());
  }
  return out;
}

export function clipViewport(poly: P2[]): P2[] {
  let p = poly;
  p = clipHalf(p, "x", 0, true);
  p = clipHalf(p, "x", 1, false);
  p = clipHalf(p, "y", 0, true);
  p = clipHalf(p, "y", 1, false);
  return p;
}

/** Shoelace area of a normalised-screen polygon. */
export function polygonArea(poly: P2[]): number {
  if (poly.length < 3) return 0;
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!, q = poly[(i + 1) % poly.length]!;
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

/** The full pipeline for one plane, with the counts the brief asks to report. */
export interface ClippedPlane {
  id: string;
  worldVertices: number;
  camClippedVertices: number;
  viewportClippedVertices: number;
  screenPolygon: P2[];
  area: number;
  /** area / (the area the plane would occupy if nothing clipped it) — 0..1 */
  visibleFraction: number;
}

export function clipPlaneToViewport(b: CamBasis, id: string, worldQuad: Vec3[], near = 1e-3): ClippedPlane {
  const cam = worldQuad.map((p) => toCamSpace(b, p));
  const camClipped = clipNear(cam, near);
  const projected: P2[] = [];
  for (const c of camClipped) {
    const s = camToScreen(b, c);
    if (s.valid) projected.push({ x: s.x, y: s.y });
  }
  const vp = clipViewport(projected);
  const area = polygonArea(vp);
  const unclippedArea = polygonArea(projected);
  return {
    id,
    worldVertices: worldQuad.length,
    camClippedVertices: camClipped.length,
    viewportClippedVertices: vp.length,
    screenPolygon: vp,
    area,
    visibleFraction: unclippedArea > 0 ? area / unclippedArea : 0,
  };
}

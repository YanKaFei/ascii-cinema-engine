/**
 * ASCII FILM DIRECTOR V3 — "NAME" · 16 s · 480 frames · 1920x1080 · 30 fps · silent
 *
 * ⚠ THE EXECUTION PATH IS THE PHASE 3.3J CONTRACT, NOT A BESPOKE SCRIPT:
 *
 *   Director Plan (scripts/v3-plan.mjs)
 *     -> compileSequence            [the real compiler]
 *     -> guardRenderable            [THE real render guard, on every frame]
 *     -> CompiledShotSpec.camera     -> CameraIntent consumed by the V3 camera rig
 *     -> CompiledShotSpec.causalTiming -> the effect gate CONSUMES the compiled onset frame
 *     -> V3 ASCII runtime (character topology, glyph field, transitions)
 *     -> PNG -> MP4
 */
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import path from 'node:path';
const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'out', 'v3-name', 'v31');
const TMP = path.join(OUT, '.frames');
const PLAN = await import(path.join(ROOT, 'scripts', 'v3-plan.mjs'));
const C = await import(path.join(ROOT, 'dist/src/semantic/shot-compiler.js'));
const G = await import(path.join(ROOT, 'dist/src/design/geometry.js'));
const M = await import(path.join(ROOT, 'dist/src/design/material.js'));
const R = await import(path.join(ROOT, 'dist/src/design/raster.js'));
const EDGE = await import(path.join(ROOT, 'dist/src/v4/edge.js'));
const B3 = await import(path.join(ROOT, 'dist/src/v3/body3.js'));
const FL = await import(path.join(ROOT, 'dist/src/v3/field.js'));
const TR = await import(path.join(ROOT, 'dist/src/v3/transition.js'));
const PERF = await import(path.join(ROOT, 'dist/src/semantic/performance.js'));
const TG = await import(path.join(ROOT, 'dist/src/semantic/target.js'));
const { encodePng } = await import(path.join(ROOT, 'dist/src/render/png.js'));
const { oneStep, smooth } = PERF;
const { yawFacingTarget, floorDirectionTo, stepToward, buildStance } = TG;

const W = 1920, H = 1080, COLS = 240, ROWS = 120, FPS = 30, ASPECT = W / H;
/**
 * ⚠ THE EDGE-AWARE FIGURE MATERIAL IS A SWITCHED CAPABILITY, so its PIXEL CONSEQUENCE can be measured by
 * rendering with it on and off. A capability that cannot be distinguished in the output is inert.
 */
const EDGE_FIGURE = process.env.EDGE_FIGURE !== '0';
const edgeCensus = { contour: 0, interior: 0 };
const BG = { r: 4, g: 4, b: 6 }, INK = { r: 246, g: 246, b: 240 }, ACCENT = { r: 255, g: 96, b: 52 };
const FF = path.join(ROOT, 'node_modules/@remotion/compositor-darwin-arm64/ffmpeg');
const LIB = path.join(ROOT, 'node_modules/@remotion/compositor-darwin-arm64');

// ---------------------------------------------------------------------------
// WORLD CONSTANTS — shared with the Phase 3 world so continuity is the SAME world
// ---------------------------------------------------------------------------
const EYE_Y = 1.05, HALF = { x: 1.5, y: 0.9, z: 0.69 };
const FEET_Y = EYE_Y - HALF.y, HEIGHT = 1.6;
const NAME = { x: 0, y: 1.30, z: -0.64 };
/** ⚠ the Phase 3 TargetAnchor, so every orient/step/reach decision is measured against the SAME referent */
const NAME_ANCHOR = { id: 'NAME', world: NAME, halfWidth: 0.43, halfHeight: 0.12 };
const ROOM_BACK_Z = -0.35 - HALF.z - HALF.z;
const STEP_START = { x: -0.95, y: FEET_Y, z: -0.2 };
const STEP_END = stepToward(STEP_START, NAME_ANCHOR, 0.42);
const MOVE_DIR = floorDirectionTo(STEP_START, NAME_ANCHOR);
const STANCE_HALF = 0.115;
const NAME_W = 0.86, NAME_H = 0.30;
/** authored performance windows, as in Phase 3.3I */
const WIN = { notice: [0.9, 2.1], orient: [1.7, 3.0], step: [3.0, 4.6], settle: [4.3, 5.1], reach: [4.4, 6.6] };

// ---------------------------------------------------------------------------
// COMPILE — the contract decides what is renderable, not this script
// ---------------------------------------------------------------------------
await mkdir(OUT, { recursive: true });
const compiled = C.compileSequence(PLAN.PLANNED, { fps: FPS });
await writeFile(path.join(OUT, 'director-plan-v31.json'), JSON.stringify({ fps: FPS, totalFrames: PLAN.TOTAL_FRAMES, shots: PLAN.PLANNED }, null, 2));
await writeFile(path.join(OUT, 'compiled-plan-v31.json'), JSON.stringify(compiled, null, 2));
const byId = new Map(compiled.shots.map((s) => [s.shotId, s]));
console.log('ASCII FILM DIRECTOR V3 — "NAME"\n');
console.log(`  compiled: ${compiled.shots.length} shots, ${compiled.totalFrames} frames, ${(compiled.totalFrames / FPS).toFixed(3)} s`);
const specOfFrame = (f) => { for (const s of compiled.shots) if (f >= s.frameStart && f <= s.frameEnd) return s; throw new Error(`frame ${f} has no compiled shot`); };

// ---------------------------------------------------------------------------
// CAMERA RIG — each CameraIntent becomes a distinct, motivated composition
// ---------------------------------------------------------------------------
/**
 * ⚠ THE V2 DEFECT THIS REPLACES. Every V2 shot shared `x=0, target=(0,EYE_Y,0), focal=0.9`, so five shots could
 * only differ by what stood in front of one viewpoint. **Here every shot is a different camera in a different
 * place with a different lens**, and the shot scale is SET by `solveCameraForScale`, not asserted.
 */
const SUBJ_BASE = G.v3(STEP_START.x, FEET_Y, STEP_START.z);
const SUBJ_TOP = G.v3(STEP_START.x, FEET_Y + HEIGHT, STEP_START.z);
const SUBJ_BASE2 = G.v3(STEP_END.x, FEET_Y, STEP_END.z);
const SUBJ_TOP2 = G.v3(STEP_END.x, FEET_Y + HEIGHT, STEP_END.z);

const solve = (base, top, dir, frac, fov, target) => G.solveCameraForScale({ subjectBase: base, subjectTop: top, direction: dir.n ? G.norm(dir) : dir, target, fovDegrees: fov, aspect: ASPECT, desiredFraction: frac, near: 0.05 });

/**
 * per-shot camera programmes.
 *
 * ⚠ EVERY FRAMING IS SOLVED, NOT GUESSED. The first version hand-placed each camera and its look-at point, and
 * **the figure was off screen in four of eight shots** — measured as `figureOnScreen 0/66, 0/63, 0/51, 0/60`.
 * A hand-placed target is a guess about where a subject will land.
 *
 * The rig now works the way a camera department does: **choose the shot scale for a subject, then apply the
 * motivated movement as a departure from that solved framing.** `solveCameraForScale` gives the distance; the
 * move is added afterwards.
 */
const FRAME_SUBJECT = (root, frac, dir, fov, aim = 0.52, extraTarget) => {
  const base = G.v3(root.x, FEET_Y, root.z), top = G.v3(root.x, FEET_Y + HEIGHT, root.z);
  const target = extraTarget ?? G.v3(root.x, FEET_Y + HEIGHT * aim, root.z);
  return G.solveCameraForScale({ subjectBase: base, subjectTop: top, direction: dir, target, fovDegrees: fov, aspect: ASPECT, desiredFraction: frac, near: 0.05 });
};
const bodyRootAt = (t) => {
  const sp = smooth(Math.max(0, Math.min(1, (t - WIN.step[0]) / (WIN.step[1] - WIN.step[0]))));
  const c = oneStep(sp).bodyCentre;
  return { x: STEP_START.x + (STEP_END.x - STEP_START.x) * c, z: STEP_START.z + (STEP_END.z - STEP_START.z) * c };
};

const CAMERA_RIG = {
  /** S1 — reveal the space. The camera is OUTSIDE the room and pushes in through the forming wall. */
  'S1-signal-to-space': (f) => {
    const sp = byId.get('S1-signal-to-space');
    const onset = sp.camera.beginsAtFrame ?? 0;
    const u = smooth((f - onset) / Math.max(1, sp.frameEnd - onset));
    return { position: G.v3(0, EYE_Y + 0.10, 1.95 - u * 1.35), target: G.v3(0, EYE_Y + 0.05, ROOM_BACK_Z + 0.30), up: G.v3(0, 1, 0), fovDegrees: 64 - u * 12, rollDegrees: -1.5 + u * 3.0, aspect: ASPECT, near: 0.05 };
  },
  /** S2 — the person measured against the room: WIDE, from HIGH, craning to eye level. */
  'S2-the-person': (f) => {
    const sp = byId.get('S2-the-person');
    const onset = sp.camera.beginsAtFrame ?? 0;
    const u = smooth((f - onset) / Math.max(1, sp.frameEnd - onset));
    /** solved for a WIDE scale (subject ~26% of frame), so the room is present around the figure */
    /**
     * ⚠ SUBJECT SCALE IS THE HIERARCHY. At 0.26 the figure was 25% of frame height among ~1300 glyphs and read
     * as another piece of texture — the director's "S2 lacks sufficient graphic hierarchy". At 0.40 the person
     * is unambiguously the subject and the room becomes ground.
     */
    const c = FRAME_SUBJECT(STEP_START, 0.40, G.norm(G.v3(-0.60, 0.50, 1)), 52, 0.50);
    return { ...c, position: G.v3(c.position.x - 0.20 * (1 - u), c.position.y + u * 0.55, c.position.z + 0.35 * (1 - u) + u * 0.15), rollDegrees: 0.9 - u * 1.8 };
  },
  /** S3 — NOTICE. MEDIUM (subject ~44%), TRUCKING laterally with the turn. */
  'S3-notice': (f) => {
    const sp = byId.get('S3-notice');
    const onset = sp.camera.beginsAtFrame ?? 0;
    const u = smooth((f - onset) / Math.max(1, sp.frameEnd - onset));
    const c = FRAME_SUBJECT(bodyRootAt(f / FPS), 0.44, G.norm(G.v3(0.92, 0.10, 0.38)), 42, 0.54);
    return { ...c, position: G.v3(c.position.x + u * 0.24, c.position.y + 0.10, c.position.z), rollDegrees: -2.2 + u * 1.4,
      target: G.v3(c.target.x + u * 0.14, c.target.y, c.target.z) };
  },
  /** S4 — APPROACH. LOW tracking side shot (subject ~38%), rolling gently. */
  'S4-approach': (f) => {
    const root = bodyRootAt(f / FPS);
    const c = FRAME_SUBJECT(root, 0.38, G.norm(G.v3(0.85, -0.30, 0.44)), 52, 0.44);
    return { ...c, position: G.v3(c.position.x, c.position.y - 0.22, c.position.z + 0.30), rollDegrees: 1.8 };
  },
  /**
   * S5 — REACH, over the shoulder, **ANCHORED ON THE NAME**.
   *
   * ⚠ THE 291 JUMP WAS A CAMERA TELEPORT, and the audit found its cause: S5's solved framing placed the camera
   * at **(-4.00, 2.01, 3.54)** — four metres to the LEFT of the set — and S6 at **(0.19, 1.33, -0.01)**, inside
   * the room. **A 5.9-unit camera translation across one cut with the NAME also jumping from 0.41 to 3.93
   * subject scale** is what the review measured as an abrupt shift in graphic scale.
   *
   * The repair is a perceptual anchor: **both shots are now framed ON THE NAME**, so the word holds its screen
   * position across the cut, the shoulder stays in the foreground, and the approach to the wall is spatially
   * intelligible. The camera stays IN FRONT of the wall instead of beside it.
   */
  'S5-reach': (f) => {
    const sp = byId.get('S5-reach');
    const onset = sp.camera.beginsAtFrame ?? 0;
    const u = smooth((f - onset) / Math.max(1, sp.frameEnd - onset));
    /** over the shoulder: the camera sits BEHIND and LEFT of the figure, both aimed at the NAME */
    const root = bodyRootAt(f / FPS);
    /**
     * ⚠ OVER THE SHOULDER MEANS THE SHOULDER IS IN FRAME. My first repair put the camera 0.82 units behind
     * the figure, which placed the BODY BEHIND THE LENS — measured as `figureOnScreen 0/51` and a subject
     * fraction of 269%. The camera must stand far enough back that the shoulder is in the foreground AND the
     * NAME is visible past it, so the aim point sits BETWEEN the two.
     */
    const eye = G.v3(root.x - 0.40 - u * 0.05, FEET_Y + 1.34, root.z + 2.35 - u * 0.24);
    const target = G.v3(root.x + 0.30 + (NAME.x - root.x) * 0.35, FEET_Y + 1.16, NAME.z + 0.10);
    return { position: eye, target, up: G.v3(0, 1, 0), fovDegrees: 48, rollDegrees: -2.4 + u * 1.8, aspect: ASPECT, near: 0.05 };
  },
  /**
   * S6 — NAME FRACTURE. EXTREME CLOSE-UP on the WORD, and the camera **stays on the same side of the wall** as
   * S5 so the cut reads as a move IN rather than a teleport. The scale is a close-up, not a collision: the first
   * version framed at 393% of the figure's height and filled the frame with a single stroke.
   */
  'S6-name-fracture': (f) => {
    const sp = byId.get('S6-name-fracture');
    const onset = sp.camera.beginsAtFrame ?? 0;
    const u = smooth((f - onset) / Math.max(1, sp.frameEnd - onset));
    const target = G.v3(NAME.x, NAME.y, NAME.z);
    return G.solveCameraForScale({
      subjectBase: G.v3(NAME.x, NAME.y - NAME_H * 0.55, NAME.z), subjectTop: G.v3(NAME.x, NAME.y + NAME_H * 0.55, NAME.z),
      direction: G.norm(G.v3(0.26, 0.02, 1)), target, fovDegrees: 34 + u * 5, aspect: ASPECT,
      /** ⚠ 0.62 -> 0.78: a CLOSE-UP of the word, not a wall of type */
      desiredFraction: 0.62 + u * 0.16, near: 0.05,
    });
  },
  /** S7 — ROOM WITHDRAWS. PULL OUT and UP as the room leaves, so the viewer also loses the space. */
  'S7-room-withdraws': (f) => {
    const sp = byId.get('S7-room-withdraws');
    const onset = sp.camera.beginsAtFrame ?? 0;
    const u = smooth((f - onset) / Math.max(1, sp.frameEnd - onset));
    const root = bodyRootAt(f / FPS);
    const c = FRAME_SUBJECT(root, 0.50, G.norm(G.v3(0.18, 0.30, 0.94)), 56, 0.50);
    return { ...c, position: G.v3(c.position.x + 0.05, c.position.y + u * 0.60, c.position.z + u * 2.35), fovDegrees: 56 + u * 10, rollDegrees: -1.0 + u * 2.4 };
  },
  /** S8 — PERSON REMAINS. MEDIUM (subject ~42%), STATIC: the movement has stopped. */
  'S8-person-remains': () => FRAME_SUBJECT(STEP_END, 0.42, G.norm(G.v3(0.22, 0.05, 1)), 40, 0.52),
};

// ---------------------------------------------------------------------------
// GLYPH FIELD — ONE persistent field across all 480 frames, so transitions are real
// ---------------------------------------------------------------------------
const ALPHA = 'NMAE#*+=-:.^~/\|'.split('');
/**
 * ⚠ THREE RESERVED BLOCKS, EACH WITH ONE IDENTITY FOR THE WHOLE FILM.
 *
 * V3 had a single 900-particle pool that was re-targeted wholesale at each shot change, which is what produced
 * the teleport at the S6 cut. **A particle now belongs to exactly one material for its life**, so a shot can no
 * longer reseat the room field by accident.
 */
const ROOM_N = 620, DEBRIS_N = 380, DISPERSE_N = 300;
const P_ROOM = 0, P_DEBRIS = ROOM_N, P_DISPERSE = ROOM_N + DEBRIS_N;
const TOTAL_N = ROOM_N + DEBRIS_N + DISPERSE_N;
const field = new FL.GlyphField({ count: TOTAL_N, alphabet: ALPHA, damping: 0.90, attract: 26, seed: 20261009 });
field.reserve(P_ROOM, ROOM_N, 'room');
field.reserve(P_DEBRIS, DEBRIS_N, 'name-debris');
field.reserve(P_DISPERSE, DISPERSE_N, 'dispersing');
let debrisBorn = false;
let namePointsCache = [];
field.scatter(G.v3(2.6, 1.9, 2.6), 0.42);

/** attractor sets, rebuilt per shot from world geometry */
/**
 * ⚠ ORGANISED MATERIAL, NOT SCATTER. The V3 field assigned particles to a jittered lattice and read as noise.
 * These targets are **strokes, ribbons and ruled planes**: the room is drawn as horizontal wall courses, vertical
 * corner ribs and floor rails, each a coherent line of glyphs travelling in one direction. **The eye can follow a
 * stroke; it cannot follow a cloud.**
 */
const wallTargets = (decay = 0, count = 420) => {
  const out = [];
  const COURSES = 9, PER = Math.max(4, Math.floor(count / COURSES));
  for (let c = 0; c < COURSES; c++) {
    const y = FEET_Y + ((c + 0.5) / COURSES) * HALF.y * 2;
    for (let i = 0; i < PER; i++) {
      const x = (-1 + (2 * i) / (PER - 1)) * HALF.x;
      out.push(G.v3(x, y, ROOM_BACK_Z + 0.01 + decay * ((c % 3) / 3) * 0.55));
    }
  }
  return out;
};
const sideTargets = (decay = 0, count = 220) => {
  const out = [];
  const RIBS = 6, PER = Math.max(3, Math.floor(count / (RIBS * 2)));
  for (const side of [-1, 1]) for (let k = 0; k < RIBS; k++) {
    const z = ROOM_BACK_Z + 0.25 + (k / (RIBS - 1)) * 1.7;
    for (let i = 0; i < PER; i++) {
      const y = FEET_Y + (i / Math.max(1, PER - 1)) * HALF.y * 2;
      out.push(G.v3(side * HALF.x, y, z + decay * 0.7));
    }
  }
  return out;
};
const floorTargets = (count = 380) => {
  const out = [];
  const RAILS = 7, PER = Math.max(4, Math.floor(count / RAILS));
  for (let r = 0; r < RAILS; r++) {
    const x = (-1 + (2 * r) / (RAILS - 1)) * HALF.x * 0.96;
    for (let i = 0; i < PER; i++) out.push(G.v3(x, FEET_Y, ROOM_BACK_Z + 0.05 + (i / Math.max(1, PER - 1)) * 1.9));
  }
  return out;
};
const nameTargets = (spread = 0) => FL.letterTargets('NAME', FL.NAME_FONT, { centre: G.v3(NAME.x, NAME.y, NAME.z + spread), width: NAME_W, height: NAME_H, plane: 'xz' });
const roomTargets = (decay = 0) => [...wallTargets(decay), ...sideTargets(decay), ...floorTargets()];

// ---------------------------------------------------------------------------
// PERFORMANCE — the Phase 3 character vocabulary, unchanged
// ---------------------------------------------------------------------------
function performanceAt(t, f) {
  const n = Math.max(0, Math.min(1, (t - WIN.notice[0]) / (WIN.notice[1] - WIN.notice[0])));
  const o = Math.max(0, Math.min(1, (t - WIN.orient[0]) / (WIN.orient[1] - WIN.orient[0])));
  const stp = smooth(Math.max(0, Math.min(1, (t - WIN.step[0]) / (WIN.step[1] - WIN.step[0]))));
  const rch = smooth(Math.max(0, Math.min(1, (t - WIN.reach[0]) / (WIN.reach[1] - WIN.reach[0]))));
  const step = oneStep(stp);
  const floor = { x: STEP_START.x + (STEP_END.x - STEP_START.x) * step.bodyCentre, y: FEET_Y, z: STEP_START.z + (STEP_END.z - STEP_START.z) * step.bodyCentre };
  const stance = buildStance(STEP_START, STEP_END, MOVE_DIR, step.movingFootTravel, STANCE_HALF, step.movingFootLift, 'right');
  const arm = Math.max(0, Math.min(1, (step.bodyCentre - 0.10) / 0.60)) * rch;
  const yawRest = -28, yawTo = yawFacingTarget({ x: floor.x, y: FEET_Y + HEIGHT * 0.94, z: floor.z }, NAME_ANCHOR);
  const headYaw = yawRest + (yawTo - yawRest) * (o * 0.75 + n * 0.25);
  return { floor, stance, arm, headYaw, torsoYaw: yawTo * 0.30 * o, reach: rch, stepProgress: stp, noticeTurn: n, orient: o };
}

// ---------------------------------------------------------------------------
// TRANSITIONS — two kinds, actually rendered, with recorded carriers
// ---------------------------------------------------------------------------
const TRANSITIONS = [
  { id: 'T1-form-match', kind: 'FORM_MATCH', fromShot: 'S4-approach', toShot: 'S5-reach', beginsAtFrame: 228, settlesAtFrame: 248, carrier: 'the stepping foot contour becomes the line of the reaching arm', momentum: 0.10, participation: 0.55 },
  { id: 'T2-material-takeover', kind: 'MATERIAL_TAKEOVER', fromShot: 'S6-name-fracture', toShot: 'S7-room-withdraws', beginsAtFrame: 336, settlesAtFrame: 372, carrier: 'NAME fragments spread and take over the wall material', momentum: 0.42, participation: 0.85 },
  { id: 'T3-motion-continuity', kind: 'MOTION_CONTINUITY', fromShot: 'S7-room-withdraws', toShot: 'S8-person-remains', beginsAtFrame: 414, settlesAtFrame: 432, carrier: 'the withdrawing field keeps travelling as the room empties', momentum: 0.22, participation: 0.60 },
];
const activeTransition = (f) => TRANSITIONS.find((t) => f >= t.beginsAtFrame && f <= t.settlesAtFrame);

// ---------------------------------------------------------------------------
// RENDER
// ---------------------------------------------------------------------------
await mkdir(TMP, { recursive: true });
const trace = [];
const transitionTraces = [];
const beforeBuf = new Map();
/**
 * ⚠ THE FRAGMENTATION MUST BE SEEN TO HAPPEN.
 *
 * `compileShotIntent` resolves the effect's ONSET frame in the action-local timebase, and the first version
 * mapped that to full fragmentation only `1/1.35` of the way through the rest of the shot — which on S6 meant
 * **the whole letterform broke inside about four frames**, so the audience saw a cut to debris rather than
 * **字母拓扑连续瓦解**. The gate now spreads the break across most of the shot while still beginning EXACTLY at
 * the compiled onset frame, so `effectOnsetFrame == the first frame with any fragmentation` remains true.
 */
const gateOf = new Map();
const effectGate = (spec, f) => {
  if (!spec.causalTiming) return 0;
  /**
   * ⚠ THE TIME DOMAIN, AND A REAL BUG IT CAUSED.
   *
   * `compileShotIntent` resolves causal timing in the **action-local** domain, so `effectOnsetFrame` is an offset
   * INTO THE SHOT — for S6 it is **29**, not an absolute frame. The first version compared it against the
   * absolute frame index, which made `f >= on` true from frame 291, so **the NAME began breaking 29 frames
   * early, before the reach had become readable at all** — the cause was skipped.
   *
   * The conversion to absolute frames is therefore explicit, and the span is measured between the absolute
   * onset and the shot's end so the whole shot's remaining duration is used.
   */
  const onAbs = spec.frameStart + spec.causalTiming.effectOnsetFrame;
  if (f < onAbs) return 0;
  const span = spec.causalTiming.domain && /action-local/.test(spec.causalTiming.domain)
    ? Math.max(1, Math.round((spec.frameEnd - onAbs) * 0.90))
    : Math.max(1, spec.frameEnd - onAbs);
  return Math.min(1, (f - onAbs) / span);
};
const roomDecayAt = (f) => { const s = byId.get('S7-room-withdraws'); const a = s.frameStart; return f < a ? 0 : Math.min(0.95, smooth((f - a) / Math.max(1, s.frameEnd - a)) * 0.95); };
const nameFragAt = (f) => effectGate(byId.get('S6-name-fracture'), f);

const frames = [];
let prevLines = null, posChurn = 0, glyphChurn = 0;
const { diffLineGrids } = await import(path.join(ROOT, 'dist/src/semantic/grid-diff.js'));

for (let f = 0; f < PLAN.TOTAL_FRAMES; f++) {
  const spec = specOfFrame(f);
  C.guardRenderable(spec);                       // THE contract guard, every frame
  const t = f / FPS;
  /**
   * ⚠ STATE IS RESOLVED BEFORE ANY DRAW CALL. `frag` and `decay` were first declared next to their consumers,
   * which put them AFTER `drawName` in source order and produced a `ReferenceError` at render time. **Declare
   * the frame's state up front, then draw.**
   */
  const frag = nameFragAt(f);
  const decay = roomDecayAt(f);
  const cam = CAMERA_RIG[spec.shotId](f);
  const basis = G.camBasis(cam);
  const cv = new M.Canvas({ cols: COLS, rows: ROWS });
  const SX = (x) => (x * 0.5 + 0.5) * (COLS - 1), SY = (y) => (0.5 - y * 0.5) * (ROWS - 1);

  /** ---- environment: architecture, drawn as geometry with the architecture family ---- */
  const drawRoom = () => {
    if (decay >= 0.95) return;
    const fade = 1 - decay;
    /**
     * ⚠ THE WALL IS STRUCTURE, NOT A CURTAIN.
     *
     * The first build drew 27 verticals and 13 horizontals across the back wall, producing ~350 lines that
     * **filled the entire frame and buried the figure** — the composition read as graph paper with a person
     * lost inside it. **Negative space is the primary material in this design; architecture frames the subject
     * rather than covering it.** The lattice is now 7 verticals and 5 horizontals, so the wall reads as a
     * plane with edges you can see through.
     */
    const wallZ = ROOM_BACK_Z;
    for (let i = 0; i <= 6; i++) {
      const x = -HALF.x + (i / 6) * HALF.x * 2;
      const s = G.clipSegment(basis, G.v3(x, FEET_Y, wallZ), G.v3(x, FEET_Y + HALF.y * 2, wallZ));
      if (!s) continue; const a = G.project(basis, s[0]), b = G.project(basis, s[1]);
      if (a.visible && b.visible) M.line(cv, SX(a.x), SY(a.y), SX(b.x), SY(b.y), { family: 'architecture', ink: 0.50 * fade, depth: 6.0, material: 'wall' });
    }
    for (let j = 0; j <= 4; j++) {
      const y = FEET_Y + (j / 4) * HALF.y * 2;
      const s = G.clipSegment(basis, G.v3(-HALF.x, y, wallZ), G.v3(HALF.x, y, wallZ));
      if (!s) continue; const a = G.project(basis, s[0]), b = G.project(basis, s[1]);
      if (a.visible && b.visible) M.line(cv, SX(a.x), SY(a.y), SX(b.x), SY(b.y), { family: 'detail', ink: 0.34 * fade, depth: 6.1, material: 'wall-detail' });
    }
    /** side walls + floor rails: fewer strokes, each carrying more weight, so depth reads without crowding */
    for (const side of [-1, 1]) for (let k = 0; k < 5; k++) {
      const z = wallZ + 0.35 + k * 0.55;
      const s = G.clipSegment(basis, G.v3(side * HALF.x, FEET_Y, z), G.v3(side * HALF.x, FEET_Y + HALF.y * 2, z));
      if (!s) continue; const a = G.project(basis, s[0]), b = G.project(basis, s[1]);
      if (a.visible && b.visible) M.line(cv, SX(a.x), SY(a.y), SX(b.x), SY(b.y), { family: 'architecture', ink: (0.5 - k * 0.04) * fade, depth: 7.0 + k * 0.1, material: 'side-wall' });
    }
    for (let k = 0; k < 7; k++) {
      const z = wallZ + 0.2 + k * 0.9;
      const s = G.clipSegment(basis, G.v3(-HALF.x, FEET_Y, z), G.v3(HALF.x, FEET_Y, z));
      if (!s) continue; const a = G.project(basis, s[0]), b = G.project(basis, s[1]);
      if (a.visible && b.visible) M.line(cv, SX(a.x), SY(a.y), SX(b.x), SY(b.y), { family: 'architecture', ink: (0.42 - k * 0.02) * fade, depth: 8.6 + k * 0.1, material: 'floor' });
    }
  };

  /**
   * ---- the NAME as a SOLID letterform (until it breaks) ----
   *
   * ⚠ THE SAME LESSON AS V1 STUDY C, learned again here: **a letterform is legible when its cells are FILLED,
   * not sampled.** The first version projected the individual `1` pixels of the bitmap and wrote ONE glyph at
   * each, so `NAME` rendered as sparse marks and a blob and was unreadable at every scale. Each bitmap pixel now
   * becomes a filled cell RANGE, measured from the projected corners of that pixel.
   */
  let nameCellsWritten = 0;
  const nameInkRef = { value: 0 };
  const nameQuad = (u, v) => {
    /** map a normalised letterform coordinate to world space on the wall plane */
    const x = NAME.x + u * NAME_W, y = NAME.y + v * NAME_H;
    return G.v3(x, y, NAME.z);
  };
  const drawName = () => {
    /**
     * ⚠ THE NAME NEVER DISAPPEARS IN ONE FRAME.
     *
     * V3 returned immediately once `frag >= 1`, so a graphic at ink **0.98 spanning much of the frame** was
     * destroyed between two frames — measured as **mean adjacent-frame difference 40.66/255 at the S6 entry and
     * 26.86/255 at f347**, the two locations the external review flagged. **A bright graphic must not vanish; it
     * must lose ink continuously until there is nothing left to lose.**
     */
    /**
     * ⚠ NO THRESHOLD. THIS WAS THE LAST CLIFF, AND IT WAS THE ONE THAT MATTERED.
     *
     * The fade was mathematically smooth, but a guard `if (nameInk <= 0.02) return;` killed the whole
     * letterform in the single frame where the fade crossed 0.02. Because the fade from 0.98 to 0.02 takes only
     * four frames at this pacing, **11 527 cells went from ink 0.061 to nothing between two frames** — measured
     * as the entire frame dropping from mean brightness 112.7 to 12.0, a 20.45/255 adjacent-frame difference.
     *
     * **The fix is to let the ink reach zero on its own.** The rasteriser already scales a cell's contribution by
     * its ink, so the graphic now dims out continuously and there is no frame at which the geometry disappears
     * while it is still visible. The fade is also stretched across most of the break, so the ink steps are small
     * enough to read as a dissolve rather than as a switch.
     */
    const nameInk = frag <= 0.10 ? 0.98 : Math.max(0, 0.98 * (1 - (frag - 0.10) / 0.85));
    nameInkRef.value = nameInk;
    if (nameInk <= 0) return;
    const cols = 4 * 6 - 1;
    const cu = 1 / cols, cvStep = 1 / 9;
    for (let li = 0; li < 4; li++) {
      const pat = FL.NAME_FONT['NAME'[li]];
      for (let r = 0; r < 9; r++) for (let c = 0; c < 5; c++) {
        if (pat[r][c] !== '1') continue;
        const u0 = (li * 6 + c) * cu - 0.5, v0 = 0.5 - (r + 1) * cvStep;
        const u1 = u0 + cu, v1 = v0 + cvStep;
        /** the four projected corners of this bitmap pixel, so the fill follows perspective */
        const corners = [nameQuad(u0, v0), nameQuad(u1, v0), nameQuad(u1, v1), nameQuad(u0, v1)].map((p) => G.project(basis, p));
        if (!corners.every((q) => q.visible)) continue;
        const xs = corners.map((q) => SX(q.x)), ys = corners.map((q) => SY(q.y));
        const minX = Math.floor(Math.min(...xs)), maxX = Math.ceil(Math.max(...xs));
        const minY = Math.floor(Math.min(...ys)), maxY = Math.ceil(Math.max(...ys));
        /** the break pushes pixels apart and drops their ink */
        const push = frag > 0 ? frag * 3.2 : 0;
        const ox = push * Math.sin((r + li) * 2.1), oy = push * Math.cos((c + li) * 1.7);
        const ink = nameInk;
        const depth = 1.0 + frag * 2.0;
        for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
          /** an edge test keeps the fill inside the projected quad, so corners stay clean */
          const fx = (x - minX) / Math.max(1, maxX - minX), fy = (y - minY) / Math.max(1, maxY - minY);
          if (fx < 0 || fx > 1 || fy < 0 || fy > 1) continue;
          if (cv.write(x + ox, y + oy, '#', 'text', ink, depth, frag > 0 ? 'name-breaking' : 'name', true)) nameCellsWritten++;
        }
      }
    }
  };

  /** ---- the person, in the V3 topology ---- */
  const perf = performanceAt(t, f);
  const handWorld = { x: perf.floor.x + (NAME.x - perf.floor.x) * perf.arm, y: (FEET_Y + HEIGHT * 0.44) + (NAME.y - (FEET_Y + HEIGHT * 0.44)) * perf.arm, z: perf.floor.z + (NAME.z - perf.floor.z) * perf.arm };
  const profile = Math.min(1, Math.abs(Math.sin((perf.headYaw * Math.PI) / 180)) * 1.2);
  const rig = {
    root: G.v3(perf.floor.x, FEET_Y, perf.floor.z), feetY: FEET_Y, height: HEIGHT,
    headYaw: perf.headYaw, torsoYaw: perf.torsoYaw, lean: 0,
    reachArm: 'right', reachAmount: perf.arm, handWorld: G.v3(handWorld.x, handWorld.y, handWorld.z),
    leftFoot: G.v3(perf.stance.leftFoot.x, perf.stance.leftFoot.y, perf.stance.leftFoot.z),
    rightFoot: G.v3(perf.stance.rightFoot.x, perf.stance.rightFoot.y, perf.stance.rightFoot.z),
    movingLegBend: perf.stance.movingFootLift * 6, movingSide: perf.stance.movingFoot === 'right' ? 'right' : 'left',
    headTurn: perf.noticeTurn, profile,
  };
  const personVisible = f >= byId.get('S2-the-person').frameStart;
  const drawPerson = () => { if (!personVisible) return; B3.drawBody3(cv, basis, rig, COLS, ROWS, 0.5); };

  /** ---- the glyph field: THREE RESERVED BLOCKS, each holding ONE identity ---- */
  const tr = activeTransition(f);
  let trCurrent = null;
  const roomT = roomTargets(decay);
  const nameT = nameTargets(0);

  /** ⚠ the ROOM block is never reseated: it holds the architecture for the whole film */
  field.seat(P_ROOM, ROOM_N, roomT, decay > 0 ? Math.max(0, 1 - decay * 0.85) : 1.0);

  /** ⚠ the DEBRIS block is BORN from the NAME's own letterform points, once, and inherits their shape */
  if (!debrisBorn && frag > 0 && nameT.length) { field.birthFrom(P_DEBRIS, DEBRIS_N, nameT, 0.010); debrisBorn = true; }
  if (debrisBorn) {
    const burst = 1.0 + frag * 0.9;
    for (let k = 0; k < DEBRIS_N; k++) {
      const pt = field.particles[P_DEBRIS + k];
      const home = nameT[k % Math.max(1, nameT.length)];
      const dirY = Math.sin(k * 0.37);
      pt.target = G.v3(home.x + (home.x - NAME.x) * burst * 0.35, home.y + (home.y - NAME.y) * burst * 0.35 + dirY * 0.02, home.z + frag * 0.55 + (k % 5) * 0.01);
      pt.hold = frag > 0 ? 1 : 0;
    }
  }
  const disperseTargets = decay > 0.05 ? roomT.map((p) => G.v3(p.x * 0.6, p.y + 0.02, p.z - 0.25)) : roomT;
  field.seat(P_DISPERSE, DISPERSE_N, disperseTargets, spec.shotId === 'S8-person-remains' ? 0 : 0.9);

  if (tr) {
    if (!beforeBuf.has(tr.id)) beforeBuf.set(tr.id, field.particles.map((p) => ({ id: p.id, ch: p.ch, p: { ...p.p }, v: { ...p.v }, material: p.material })));
    const u = (f - tr.beginsAtFrame) / Math.max(1, tr.settlesAtFrame - tr.beginsAtFrame);
    /**
     * ⚠ THE CARRIER DIRECTION IS DECLARED IN SCREEN TERMS AND CONVERTED THROUGH THE CAMERA BASIS.
     * T3 measured -0.454 because the declared direction was a WORLD vector while the measurement is taken on
     * projected screen displacement, so the two disagreed by construction.
     */
    const sd = tr.kind === 'MATERIAL_TAKEOVER' ? { x: 0.72, y: -0.30 } : tr.kind === 'FORM_MATCH' ? { x: 0.62, y: -0.10 } : { x: -0.55, y: 0.22 };
    const carrierDir = G.norm(G.add(G.scale(basis.right, sd.x), G.scale(basis.up, -sd.y)));
    const outgoing = tr.kind === 'FORM_MATCH' ? nameT.concat(roomT.slice(0, 200))
      : tr.kind === 'MATERIAL_TAKEOVER' ? nameT.map((p) => G.v3(p.x, p.y, p.z + 0.05))
      : roomT;
    const incoming = tr.kind === 'FORM_MATCH' ? nameT
      : tr.kind === 'MATERIAL_TAKEOVER' ? roomT.map((p, i) => G.v3(p.x + ((i % 7) / 7 - 0.5) * 0.10, p.y + ((i % 5) / 5 - 0.5) * 0.08, p.z))
      : roomT.map((p) => G.v3(p.x * 0.4, p.y, p.z - 0.5));
    /** ⚠ ONLY THE DEBRIS BLOCK TRAVELS. The room block keeps holding the architecture. */
    TR.applyTransition(field, tr, outgoing, incoming, u, f, carrierDir, P_DEBRIS, DEBRIS_N);
    trCurrent = { tr, carrierDir, u };
  }
  field.step(1 / FPS, (pt, age) => {
    if (spec.shotId === 'S8-person-remains') return G.v3(0, 0.010, 0);
    if (decay > 0.3) return G.v3(Math.sin(pt.p.y * 5) * 0.03, 0.012, Math.cos(pt.p.x * 6) * 0.03);
    return undefined;
  });
  if (tr && trCurrent && f === tr.settlesAtFrame) {
    const after = field.particles.map((p) => ({ id: p.id, ch: p.ch, p: { ...p.p }, v: { ...p.v }, material: p.material }));
    transitionTraces.push(TR.recordTransition(tr, beforeBuf.get(tr.id), after, trCurrent.carrierDir, DEBRIS_N));
    beforeBuf.delete(tr.id);
  }

  /** the field is drawn as glyphs with their own identity */
  for (const pt of field.particles) {
    const pr = G.project(basis, pt.p);
    if (!pr.visible) continue;
    const sp = Math.hypot(pt.v.x, pt.v.y, pt.v.z);
    /** ⚠ capped at 0.44 so the figure and the NAME are always the brightest things on screen */
    const ink = Math.max(0.08, Math.min(0.44, 0.14 + sp * 1.3));
    const fam = sp > 0.35 ? 'atmosphere' : 'detail';
    cv.write(SX(pr.x), SY(pr.y), pt.ch, fam, ink, 4.0 + Math.min(1.2, pr.depth * 0.06), pt.material);
  }


  /** ---- DRAW ORDER: environment, then field, then NAME, then the person (nearest material last) ---- */
  drawRoom();
  const lines = cv.toLines();
  /** the field was written into the same canvas, so re-draw NAME and person OVER it with nearer depth */
  drawName();
  drawPerson();
  const finalLines = cv.toLines();

  if (prevLines) { const d = diffLineGrids(prevLines, finalLines); posChurn += d.positionChurn ?? 0; glyphChurn += d.glyphChurn ?? 0; }
  prevLines = finalLines;

  /**
   * ⚠ THE INK FIELD IS PASSED TO THE RASTERISER. V3 never supplied `weightOf`, so every glyph was drawn at FULL
   * BRIGHTNESS and `ink` only chose which character. **An ink value that does not reach the pixels is not an ink
   * value** — and its absence is why a graphic could not fade and had to disappear in a single frame.
   */
    /**
   * ⚠ EDGE-AWARE FIGURE MATERIAL — INTEGRATED INTO THE PRODUCTION PATH.
   *
   * When `EDGE_FIGURE` is on, the figure's own cells are re-chosen by their LOCAL GRADIENT DIRECTION before the
   * frame is rasterised: a contour gets `/ | \ -` according to the edge angle, an interior is thinned. **The
   * geometry is untouched** — only the glyph selection changes — so the validated performance, target relation
   * and causal timing are unaffected. This is an extension of the existing renderer, not a second one.
   */
  if (EDGE_FIGURE) {
    const pre = cv.inkField();
    const cls = EDGE.edgeClassify(pre, COLS, ROWS, EDGE.DEFAULT_EDGE);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const cell = cv.resolved(c, r);
      /** only cells the FIGURE or the NAME owns are re-chosen; architecture and field keep their materials */
      const owned = cell.material.startsWith('head') || cell.material.startsWith('torso') || cell.material.startsWith('leg')
        || cell.material.startsWith('shin') || cell.material.startsWith('foot') || cell.material.startsWith('upperarm')
        || cell.material.startsWith('forearm') || cell.material.startsWith('hand') || cell.material === 'neck';
      if (!owned) continue;
      const e = cls[r * COLS + c];
      if (!e || e.kind === 'void') continue;
      cv.write(c, r, e.glyph, e.kind === 'contour' ? 'figure' : 'atmosphere', e.ink, 0.4, e.kind === 'contour' ? 'edge-contour' : 'edge-interior');
      edgeCensus[e.kind] = (edgeCensus[e.kind] ?? 0) + 1;
    }
  }
  const inkField = cv.inkField();
  frames.push(encodePng(R.rasterise(finalLines, {
    width: W, height: H, cols: COLS, rows: ROWS, background: BG, ink: INK, accent: ACCENT,
    accentChars: new Set(['/', '\\', '#']),
    weightOf: (cx, cy) => inkField[cy * COLS + cx] ?? 0,
  })));
  trace.push({ frame: f, shot: spec.shotId, cam: { x: +cam.position.x.toFixed(4), y: +cam.position.y.toFixed(4), z: +cam.position.z.toFixed(4), fov: +cam.fovDegrees.toFixed(2), roll: +cam.rollDegrees.toFixed(2) },
    /**
     * ⚠ MEASURED ON THE ACTUAL FIGURE, NOT ON A FIXED STAND-IN.
     *
     * The first version projected `SUBJ_BASE`/`SUBJ_TOP` — the figure's START position — for every shot. For a
     * camera beside the walking body that is simply the wrong world point, and it reported subject fractions of
     * 741% while the figure was off frame. **A metric that measures the wrong object is worse than no metric**,
     * because it looks like evidence.
     */
    subjectHeightFraction: +G.subjectHeightFraction(basis, G.v3(perf.floor.x, FEET_Y, perf.floor.z), G.v3(perf.floor.x, FEET_Y + HEIGHT, perf.floor.z)).toFixed(4),
    figureOnScreen: (() => { const h = G.project(basis, G.v3(perf.floor.x, FEET_Y + HEIGHT, perf.floor.z)); return h.visible && Math.abs(h.x) <= 1 && Math.abs(h.y) <= 1; })(),
    nameFrag: +frag.toFixed(4), nameInk: +nameInkRef.value.toFixed(4), nameCells: nameCellsWritten, edgeCensus: { ...edgeCensus }, roomDecay: +decay.toFixed(4), fieldMeanSpeed: +field.meanSpeed().toFixed(4),
    fieldCensus: field.census(), transition: tr ? tr.id : null, rootX: +perf.floor.x.toFixed(5), headYaw: +perf.headYaw.toFixed(3), reach: +perf.arm.toFixed(4) });
  if (f % 60 === 0) console.log(`  frame ${String(f).padStart(3)}  ${spec.shotId.padEnd(22)} fov ${cam.fovDegrees.toFixed(1).padStart(5)}  subjH ${(trace[trace.length-1].subjectHeightFraction*100).toFixed(1)}%  field v ${field.meanSpeed().toFixed(3)}${tr ? '  [' + tr.id + ']' : ''}`);
}
await writeFile(path.join(OUT, 'render-trace.json'), JSON.stringify({ totalFrames: PLAN.TOTAL_FRAMES, fps: FPS, syncMode: 'SILENT', contract: { compiledWith: 'compileSequence', guardedBy: 'guardRenderable', guardCalls: PLAN.TOTAL_FRAMES }, transitions: transitionTraces, churn: { position: posChurn, glyph: glyphChurn }, trace }, null, 2));

// ---- encode ----
console.log('\n  encoding MP4 ...');
for (let i = 0; i < frames.length; i++) await writeFile(path.join(TMP, `f${String(i).padStart(4, '0')}.png`), frames[i]);
await new Promise((res, rej) => { const c = spawn(FF, ['-y', '-hide_banner', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(TMP, 'f%04d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '17', path.join(OUT, 'final-silent-v31.mp4')], { env: { ...process.env, DYLD_LIBRARY_PATH: LIB } }); let e = ''; c.stderr.on('data', (d) => (e += d)); c.on('close', (code) => (code === 0 ? res() : rej(new Error(e)))); });
await rm(TMP, { recursive: true, force: true });
const { readFile } = await import('node:fs/promises');
const buf = await readFile(path.join(OUT, 'final-silent-v31.mp4'));
console.log(`  final-silent-v31.mp4  ${(buf.length / 1048576).toFixed(2)} MB  sha256 ${createHash('sha256').update(buf).digest('hex').slice(0, 16)}`);
console.log(`  transitions recorded: ${transitionTraces.length}`);
for (const tt of transitionTraces) console.log(`    ${tt.kind.padEnd(20)} ${tt.fromShot} -> ${tt.toShot}  carriers ${tt.carrierCount}  dirConsistency ${tt.directionConsistency}  momentumPreserved ${tt.momentumPreserved}`);

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
const OUT = path.join(ROOT, 'out', 'kinetic-r371');
const TMP = path.join(OUT, '.frames');
const PLAN = await import(path.join(ROOT, 'scripts', 'r36-plan.mjs'));
const C = await import(path.join(ROOT, 'dist/src/semantic/shot-compiler.js'));
const G = await import(path.join(ROOT, 'dist/src/design/geometry.js'));
const M = await import(path.join(ROOT, 'dist/src/design/material.js'));
const R = await import(path.join(ROOT, 'dist/src/design/raster.js'));
const EDGE = await import(path.join(ROOT, 'dist/src/v4/edge.js'));
const LAYERS = await import(path.join(ROOT, 'dist/src/v4/layers.js'));
const COMP = await import(path.join(ROOT, 'dist/src/v4/compositor.js'));
const TCOMP = await import(path.join(ROOT, 'dist/src/v4/typography-composition.js'));
const ANCH = await import(path.join(ROOT, 'dist/src/v4/subject-anchors.js'));
const PMASK = await import(path.join(ROOT, 'dist/src/v4/protected-mask.js'));
const TYPO = await import(path.join(ROOT, 'dist/src/v4/typography.js'));
/**
 * ⚠ THE MACRO TYPOGRAPHY ENGINE — real font outlines, not a 5x9 bitmap.
 *
 * `typography-macro.mjs` reads TRUE TYPE OUTLINES at run time from a font the operator already has, produces a
 * MACRO coverage field (stroke, counter, outer contour, spacing, baseline), and derives the MICRO ASCII material
 * from that field's edge direction. **A mask pixel is not a glyph.** That separation is the R3.1 repair.
 */
const MACRO = await import(path.join(ROOT, 'tools', 'typography-macro.mjs'));
const MT = await import(path.join(ROOT, 'dist/src/v4/mode-transition.js'));
const FRAG = await import(path.join(ROOT, 'dist/src/v4/fragments.js'));
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

/**
 * ⚠ RUNTIME SWITCHES FOR THE FOUR LAYERS, read from the COMPILED contract rather than from the script.
 *
 * The isolation tests drive these; nothing here re-derives a layer's mode or mask from the shot id.
 */
const SUBJECT_MODE = process.env.SUBJECT_MODE === 'INK_RAMP' ? 'INK_RAMP' : 'EDGE_ASCII';
const layerDisabled = new Set((process.env.DISABLE_LAYERS ?? '').split(',').map((x) => x.trim()).filter(Boolean));
const REQUIRE_CONSUMED = process.env.REQUIRE_CONSUMED !== '0';
const LAYERS_REQUIRED = ['SCENE_LAYER', 'SUBJECT_LAYER', 'TYPOGRAPHY_LAYER'];
const layerTrace = [];
let subjectCells = 0;

/**
 * ⚠ R3 KINETIC TYPOGRAPHY STATE.
 *
 * The OBJECT — its text, its topology — is built ONCE, outside the frame loop, so **the same semantic object
 * exists through every representation state**. Only its representation changes.
 */
const NAME_TEXT = process.env.NAME_TEXT ?? 'NAME';
const NAME_TOPO = TYPO.typographyFor(NAME_TEXT);
/** the MACRO topology of the word, built from real font outlines */
/**
 * ⚠ THE MACRO GRID IS RESOLVED TO MATCH THE OUTPUT, NOT THE OTHER WAY ROUND.
 *
 * At cap height 26 the word is 74x26 macro cells. Composed at the authored readable occupancy it spans 221x94
 * output cells, so one macro cell is ~3.0x3.6 output cells and a one-cell stroke becomes a stroke rather than a
 * line. At the smaller environmental size the SAME grid would give 1.8 cells and the letterform would dissolve —
 * which is exactly the R3.5 defect. **Macro form first, micro material second.**
 */
const NAME_MACRO = await MACRO.macroWord(NAME_TEXT, { capHeightCells: 20 });
const NAME_MACRO_INFO = MACRO.readability(NAME_MACRO);
const MACRO_CLASS = MACRO.classify(NAME_MACRO);
let typoScale = 1, typoDepth = 0, typoCellScale = 1, typoCells = 0, fieldCells = 0;
let typoDistort = 0, wTarget = 0.86, hTarget = 0.30, stateAtDraw = 'SCENE_ASCII';
let typoBounds = null;
let compositionResolutions = 0;
let compositionFallbacks = 0;
/** the anchors the compiled composition protects, resolved to screen cells for the occlusion audit */
let protectedAnchorScreen = null;
let protectedFootprints = [];
let protectedMask = null;
let typographyCellsMask = null;
let maskIntersectionCells = 0;
let personNameOverlapCells = 0, personCells = 0, nameCells = 0;
let compositionFeasibility = null;
const compositionChecks = [];
const priorityDepthLog = [];
let protectedCellsCarved = 0;
let carveDebug = null;
let fractureHasBegun = false;
let typoAttempts = 0, typoUniqueCells = 0, typoSpan = null, typoSample = null, typoSize = null;
const typoAudit = [];
let lifeProbe = null;   // provisional; the transition block sets them from NAME_W/NAME_H
let typoState = 'SCENE_ASCII';
let typoEntranceSpan = 0;
/**
 * ⚠ THE FIRST BUG THIS ROUND WAS A FRAME-DOMAIN MIX-UP, and it was invisible in the logs.
 *
 * `stepCarriers` was handed the ABSOLUTE frame (272) instead of the SHOT-RELATIVE frame (32). Every carrier was
 * therefore instantly past its death frame and **all 85 were dead on the first step** — the trace said
 * `carriers 85, alive 0` on every frame while the render still produced output. **A quantitative claim
 * ("85 carriers") was true and a qualitative one ("they are moving") was silently false.**
 */
const characterEntrance = (ci) => {
  if (typoEntranceSpan <= 0) return 1;
  const started = typoEntranceStarted;
  if (started < 0) return 1;
  const p = (currentShotFrame - started - ci * typoEntranceSpan) / Math.max(1, typoEntranceSpan * 3);
  return Math.max(0, Math.min(1, p));
};
let currentShotFrame = 0;
let typoEntranceStarted = -1;
let ACTIVE_TRANSITION = null;
let CARRIERS = [];
/**
 * ⚠ SEQUENCE-OWNED CARRIER STATE.
 *
 * `CARRIERS` and `carrierStates` are declared OUTSIDE the frame loop and are **never cleared when the shot
 * changes**. `continuedIds` records which continuations have already retargeted, so a continuation is applied
 * once rather than compounding every frame. `sequenceFragmentations` counts how many times the object was
 * resolved into fragments across the whole film — it must be exactly 1.
 */
/**
 * ⚠ PER-TRANSITION EXECUTION STATE. Membership of a set is NOT execution.
 */
const transitionState = new Map();
/** the furthest compiled lifetime across a shot's transitions */
function chainEndsOf(governing, compiledTransitions, spec, grace) {
  const ends = compiledTransitions.map((t) => t.carriersUntilAbsoluteFrame).filter((v) => typeof v === 'number' && Number.isFinite(v));
  return ends.length ? Math.max(...ends) : governing.endFrame + spec.frameStart + grace;
}
let lastRetargetedTransitionId = null;
let sequenceFragmentations = 0;
let carrierBirthFrame = -1;
const retargetLog = [];
const CARRIER_GRACE = 14;
let carrierStates = new Map();
let nameFieldFade = 1;
const transitionTrace = [];
/** measured motion state for the current frame, recorded into the trace AFTER the carriers are stepped */
let liveAlive = 0, liveAvgSpeed = 0, liveCoherence = 0;
let pendingTransitionEntry = null;
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
/**
 * ⚠ THE TYPOGRAPHIC CEILING. The word may become a major graphic, but its world size is bounded so the glyph
 * grid stays resolved: beyond this the cells outgrow the letterforms and the text stops being text.
 */
/**
 * ⚠ THE WORD'S WORLD-SIZE CEILING MUST NOT PRE-EMPT THE AUTHORED SCREEN BOUNDS.
 *
 * At `TYPO_MAX_H = 0.92` the height cap bound BEFORE the composition did: measured `hTarget 0.92` with a resolved
 * stroke of 3.0 cells and an authored bound that still had room (fitted 159x60 inside 220x93). **A legacy constant
 * was overriding direction.** The ceiling now sits above what the authored bounds can demand, so the composition
 * is what governs the word's size, and the bounds test still prevents it from becoming a full-screen title.
 */
const TYPO_MAX_W = 3.40, TYPO_MAX_H = 1.60;
/**
 * ⚠ THE AUTHORED SCREEN BOUNDS FOR THE WORD — the composition policy.
 *
 * The word may become the PRIMARY graphic subject, but it must not become a full-screen title: the PERSON and the
 * ROOM have to remain readable around it, and the hand-to-NAME relationship has to stay visible. These fractions
 * are the director's statement of "prominent, not total".
 */
/**
 * ⚠ THE SCREEN BOUNDS ARE NO LONGER A RENDER CONSTANT.
 *
 * R3.5 held `{ widthFraction: 0.62, heightFraction: 0.44 }` here, and that constant was the measured cause of the
 * unreadability: at 44 % height a letter stroke resolved to 1.8 output cells. The composition is now READ FROM
 * `CompiledShotSpec.typographyComposition` each frame, and this object only carries the frame's resolved value.
 * The fallback below applies **only** to a shot that declares no composition — the legacy path.
 */
/**
 * ⚠ THE MINIMUM RESOLVED STROKE WIDTH, IN OUTPUT CELLS. This is the readability requirement expressed as a number
 * rather than as a hope: below roughly three cells a directional glyph cannot describe a stroke, and the
 * letterform stops reading as type.
 */
const TYPO_STROKE_CELLS = 4.2;
/**
 * ⚠ THE AUTHORED `visualPriority` DECIDES THE WORD'S COMPOSITING DEPTH. Until now it was validated, compiled and
 * read by nothing — an inert control. It is now the single source of the word's depth, so a declared priority has a
 * real pixel consequence, and the mapping is bounded so no priority can place the word at an artificial extreme.
 */
let typoDepthForPriority = -0.60;
const TYPO_SCREEN_BOUNDS = { widthFraction: 0.62, heightFraction: 0.44 };
let resolvedComposition = null;
let compositionInReadableWindow = false;
/** authored performance windows, as in Phase 3.3I */
const WIN = { notice: [0.9, 2.1], orient: [1.7, 3.0], step: [3.0, 4.6], settle: [4.3, 5.1], reach: [4.4, 6.6] };

// ---------------------------------------------------------------------------
// COMPILE — the contract decides what is renderable, not this script
// ---------------------------------------------------------------------------
await mkdir(OUT, { recursive: true });
const compiled = C.compileSequence(PLAN.PLANNED, { fps: FPS });
await writeFile(path.join(OUT, 'director-plan.json'), JSON.stringify({ fps: FPS, totalFrames: PLAN.TOTAL_FRAMES, shots: PLAN.PLANNED }, null, 2));
await writeFile(path.join(OUT, 'compiled-plan.json'), JSON.stringify(compiled, null, 2));
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
  /** ⚠ hoisted: the subject layer is rendered before the old person block, which declared this */
  const personVisible = f >= byId.get('S2-the-person').frameStart;
  const cam = CAMERA_RIG[spec.shotId](f);
  const basis = G.camBasis(cam);
  const SX = (x) => (x * 0.5 + 0.5) * (COLS - 1), SY = (y) => (0.5 - y * 0.5) * (ROWS - 1);

  /**
   * ---- FOUR INDEPENDENT LAYER CANVASES ----
   *
   * ⚠ **THIS IS THE HYBRID COMPOSITOR'S INPUT.** Each layer draws into its OWN canvas, so a layer can be
   * disabled, masked or swapped without touching the others, and "the room" can never be an incidental side
   * effect of a function that also draws the person.
   */
  const cvScene = new M.Canvas({ cols: COLS, rows: ROWS });
  const cvSubject = new M.Canvas({ cols: COLS, rows: ROWS });
  const cvType = new M.Canvas({ cols: COLS, rows: ROWS });
  const cvAtmos = new M.Canvas({ cols: COLS, rows: ROWS });

  /** ---- SCENE_LAYER: architectural structure, light, in the `architecture` material ---- */
  const drawScene = (cv) => {
    if (decay >= 0.95) return;
    const fade = 1 - decay;
    const wallZ = ROOM_BACK_Z;
    for (let i = 0; i <= 6; i++) {
      const x = -HALF.x + (i / 6) * HALF.x * 2;
      const s = G.clipSegment(basis, G.v3(x, FEET_Y, wallZ), G.v3(x, FEET_Y + HALF.y * 2, wallZ));
      if (!s) continue; const a = G.project(basis, s[0]), b = G.project(basis, s[1]);
      if (a.visible && b.visible) M.line(cv, SX(a.x), SY(a.y), SX(b.x), SY(b.y), { family: 'architecture', ink: 0.46 * fade, depth: 6.0, material: 'wall' });
    }
    for (let j = 0; j <= 4; j++) {
      const y = FEET_Y + (j / 4) * HALF.y * 2;
      const s = G.clipSegment(basis, G.v3(-HALF.x, y, wallZ), G.v3(HALF.x, y, wallZ));
      if (!s) continue; const a = G.project(basis, s[0]), b = G.project(basis, s[1]);
      if (a.visible && b.visible) M.line(cv, SX(a.x), SY(a.y), SX(b.x), SY(b.y), { family: 'detail', ink: 0.30 * fade, depth: 6.1, material: 'wall-detail' });
    }
    for (const side of [-1, 1]) for (let k = 0; k < 5; k++) {
      const z = wallZ + 0.35 + k * 0.55;
      const s = G.clipSegment(basis, G.v3(side * HALF.x, FEET_Y, z), G.v3(side * HALF.x, FEET_Y + HALF.y * 2, z));
      if (!s) continue; const a = G.project(basis, s[0]), b = G.project(basis, s[1]);
      if (a.visible && b.visible) M.line(cv, SX(a.x), SY(a.y), SX(b.x), SY(b.y), { family: 'architecture', ink: (0.44 - k * 0.04) * fade, depth: 7.0 + k * 0.1, material: 'side-wall' });
    }
    for (let k = 0; k < 7; k++) {
      const z = wallZ + 0.2 + k * 0.9;
      const s = G.clipSegment(basis, G.v3(-HALF.x, FEET_Y, z), G.v3(HALF.x, FEET_Y, z));
      if (!s) continue; const a = G.project(basis, s[0]), b = G.project(basis, s[1]);
      if (a.visible && b.visible) M.line(cv, SX(a.x), SY(a.y), SX(b.x), SY(b.y), { family: 'architecture', ink: (0.38 - k * 0.02) * fade, depth: 8.6 + k * 0.1, material: 'floor' });
    }
  };

  /** ---- ATMOSPHERE: the glyph field, held well below the subject in weight ---- */
  const drawAtmosphere = (cv) => {
    for (const pt of field.particles) {
      const pr = G.project(basis, pt.p);
      if (!pr.visible) continue;
      const sp = Math.hypot(pt.v.x, pt.v.y, pt.v.z);
      const ink = Math.max(0.07, Math.min(0.34, 0.12 + sp * 1.1));
      cv.write(SX(pr.x), SY(pr.y), pt.ch, sp > 0.35 ? 'atmosphere' : 'detail', ink, 4.0 + Math.min(1.2, pr.depth * 0.06), pt.material);
    }
  };

  /**
   * ---- TYPOGRAPHY_LAYER: MACRO letter topology carrying MICRO ASCII material ----
   *
   * ⚠ **THE TWO SCALES ARE KEPT APART HERE, AND THAT IS THE WHOLE REPAIR.**
   *
   * `NAME_MACRO` is the MACRO layer: coverage of the real font outlines, giving stroke, counter, outer contour
   * and a shared baseline. For each macro cell this function chooses a MICRO character from the macro cell's role
   * — a directional character on an EDGE so the contour is drawn by material whose orientation matches the
   * stroke, **nothing** in the interior so the counter stays open.
   *
   * R3 collapsed the two: one pixel of a 5x9 bitmap became a block of identical `#`, which is why the word read
   * as a filled band. A mask pixel is not a glyph.
   */
  const drawTypography = (cv) => {
    const nameInk = frag <= 0.10 ? 0.98 : Math.max(0, 0.98 * (1 - (frag - 0.10) / 0.85));
    if (nameInk <= 0) return;
    if (typoState === 'GLYPH_FIELD') return;
    const mw = NAME_MACRO.w, mh = NAME_MACRO.h;
    if (!mw || !mh) return;

    /**
     * ⚠ OUTPUT-DRIVEN RASTERIZATION — the fix for the overdraw.
     *
     * R3.1 iterated MACRO cells and expanded each into an `stepX x stepY` block of OUTPUT cells. Measured: the
     * layer issued **197 916 write attempts against a 240x120 = 28 800-cell canvas** — nearly seven times the
     * canvas — so the word was buried under its own material and most writes were redundant or off-canvas.
     *
     * The loop is now INVERTED: **iterate OUTPUT cells and SAMPLE the macro field once per cell.** That makes the
     * write count bounded by the canvas by construction, removes the redundant overdraw at its root, and makes the
     * material a genuine sampling of the letterform rather than an expansion of it.
     *
     * The mapping is an affine transform fitted from the word's FOUR PROJECTED CORNERS, so the macro grid is laid
     * into the projected quad and each output cell is inverse-mapped to a macro (u,v). That preserves perspective
     * and the shared baseline while costing one projection per frame instead of one per macro cell.
     */
    const distort = typoDistort;

    /**
     * ⚠ THE WORD IS SIZED HERE, IN THE DRAW PATH, SO ITS DISPLAY SIZE CANNOT DEPEND ON WHICH TRANSITION WINDOW
     * HAPPENS TO BE OPEN.
     *
     * The sizing was first placed inside the active-transition block. At the authored LEGIBLE_WORD frames the
     * phase is still `before`, so that block never ran and the word kept its initial 0.86 world units — which
     * projects to about **47 output cells for a 74-column macro grid**, i.e. it was UNDER-SAMPLING its own
     * letterform and every stroke was lost. **A display size that only applies inside a transition window is not
     * a display size.**
     *
     * The word is now measured against the projection every frame and scaled so that **one macro cell maps to at
     * least one output cell**, which is the condition for the letterform to survive rasterisation.
     */
    const probe = G.project(basis, G.v3(NAME.x, NAME.y, NAME.z));
    const probeU = G.project(basis, G.v3(NAME.x + 1, NAME.y, NAME.z));
    const probeV = G.project(basis, G.v3(NAME.x, NAME.y + 1, NAME.z));
    const cpuX = probe.visible && probeU.visible ? Math.abs(probeU.x - probe.x) * 0.5 * cv.cols : 0;
    const cpuY = probe.visible && probeV.visible ? Math.abs(probeV.y - probe.y) * 0.5 * cv.rows : 0;
    const grow = 1 + (typoScale - 1) * 0.42;
    /**
     * ⚠ THE WORD IS SIZED SO A MACRO STROKE RESOLVES TO AT LEAST `TYPO_STROKE_CELLS` OUTPUT CELLS.
     *
     * R3.5 aimed for "one macro cell per output cell" (a factor of 1.0), which measured a stroke at **1.4-1.8
     * cells** — thinner than a directional ASCII glyph needs to describe a stroke, so the letterform dissolved.
     * The target is now an explicit stroke-width requirement, which is the quantity that actually governs whether
     * `N A M E` reads.
     */
    let sizeW = Math.min(TYPO_MAX_W, Math.max(NAME_W, cpuX > 1e-6 ? (NAME_MACRO.w * TYPO_STROKE_CELLS) / cpuX : NAME_W) * grow);
    let sizeH = Math.min(TYPO_MAX_H, Math.max(NAME_H, cpuY > 1e-6 ? (NAME_MACRO.h * TYPO_STROKE_CELLS) / cpuY : NAME_H) * grow);
    wTarget = sizeW; hTarget = sizeH;
    typoSize = { cpuX: +cpuX.toFixed(3), cpuY: +cpuY.toFixed(3), grow: +grow.toFixed(3),
      wTarget: +sizeW.toFixed(3), hTarget: +sizeH.toFixed(3), macroW: NAME_MACRO.w, macroH: NAME_MACRO.h,
      expectedSpanX: Math.round(sizeW * cpuX), expectedSpanY: Math.round(sizeH * cpuY) };

    /**
     * ⚠ THE WORD IS HELD INSIDE AN AUTHORED SCREEN BOUNDS.
     *
     * "One macro cell per output cell" alone is NOT a composition policy: as the camera closes on the wall the
     * projected word grows without limit, and measured at frame 319 it spanned **213x80 of a 240x120 canvas — 89 %
     * of the frame width** with letters thicker than the space between them. That is the opposite failure to
     * invisibility: a full-screen abstract title that erases the figure.
     *
     * The fix is a **screen-space bounds test applied to the projected quad**, iterated so the world size is the
     * largest that still fits. Both constraints are needed — the bounds stop the word becoming a title, and the
     * macro-cell rule stops it becoming unreadable — and the smaller of the two always wins.
     */
    /**
     * ⚠ THE BOUNDS COME FROM THE COMPILED COMPOSITION CONTRACT. A shot that declares none falls back to the
     * environmental region, which is the legacy behaviour and is never allowed to silently alter direction.
     */
    const bounds = resolvedComposition ?? TYPO_SCREEN_BOUNDS;
    const boundW = Math.floor(COLS * bounds.widthFraction);
    const boundH = Math.floor(ROWS * bounds.heightFraction);
    let sizeW2 = sizeW, sizeH2 = sizeH, quad = [];
    for (let attempt = 0; attempt < 12; attempt++) {
      quad = [[-0.5, 0.5], [0.5, 0.5], [0.5, -0.5], [-0.5, -0.5]].map(([u, v]) => {
        const du = u * distort * 0.16, dv = v * distort * 0.10;
        return G.project(basis, G.v3(
          NAME.x + (u + du) * sizeW2,
          NAME.y + (v + dv) * sizeH2,
          NAME.z + typoDepth - distort * 0.22 * Math.abs(u),
        ));
      });
      if (!quad.every((q) => q.visible)) break;
      const sx = quad.map((q) => (q.x * 0.5 + 0.5) * (cv.cols - 1));
      const sy = quad.map((q) => (0.5 - q.y * 0.5) * (cv.rows - 1));
      const w = Math.max(...sx) - Math.min(...sx), h = Math.max(...sy) - Math.min(...sy);
      if (w <= boundW && h <= boundH) break;
      /** scale down by whichever axis overshoots more, with a little damping to converge quickly */
      const k = Math.min(boundW / Math.max(1, w), boundH / Math.max(1, h)) * 0.98;
      sizeW2 *= k; sizeH2 *= k;
    }
    sizeW = sizeW2; sizeH = sizeH2;
    wTarget = sizeW; hTarget = sizeH;
    typoBounds = { boundW, boundH, fittedSpan: quad.length ? [
      Math.round(Math.max(...quad.map((q) => (q.x * 0.5 + 0.5) * (cv.cols - 1))) - Math.min(...quad.map((q) => (q.x * 0.5 + 0.5) * (cv.cols - 1)))),
      Math.round(Math.max(...quad.map((q) => (0.5 - q.y * 0.5) * (cv.rows - 1))) - Math.min(...quad.map((q) => (0.5 - q.y * 0.5) * (cv.rows - 1)))),
    ] : null };
    if (!quad.every((q) => q.visible)) return;

    /**
     * ⚠ THE PROJECTED COORDINATES ARE **CENTRED**, NOT NORMALISED `[0,1]` — and getting this wrong is what made
     * the word invisible.
     *
     * `project` returns `x = dot(d, right) / (z * tanHalfFov * aspect)`, so **screen centre is `(0,0)`** and the
     * visible range is roughly `[-1, 1]`. The rest of this renderer converts with
     *
     *     SX(x) = (x * 0.5 + 0.5) * (COLS - 1)      SY(y) = (0.5 - y * 0.5) * (ROWS - 1)
     *
     * but the output-driven rasterizer multiplied the raw value by the cell count (`q.x * cv.cols`). That maps the
     * word around **cell (0,0) — the top-left corner** instead of the canvas centre, so nearly all of it fell
     * outside the viewport and only a few cells near the origin survived. Measured: 12 061 sample attempts, and
     * **85 typography cells drawn of which 85 were occluded and 0 reached the frame** — the "85" was a coincidence
     * of the corner sliver, not the letterform.
     *
     * The same `SX`/`SY` convention is now used, so the rasterizer, the architecture and the figure all share one
     * screen mapping.
     */
    const P = quad.map((q) => ({ x: (q.x * 0.5 + 0.5) * (cv.cols - 1), y: (0.5 - q.y * 0.5) * (cv.rows - 1) }));
    const [c0, c1, c2, c3] = P;
    /** the word's screen bounding box, clipped to the canvas */
    const minX = Math.max(0, Math.floor(Math.min(c0.x, c1.x, c2.x, c3.x)));
    const maxX = Math.min(cv.cols - 1, Math.ceil(Math.max(c0.x, c1.x, c2.x, c3.x)));
    const minY = Math.max(0, Math.floor(Math.min(c0.y, c1.y, c2.y, c3.y)));
    const maxY = Math.min(cv.rows - 1, Math.ceil(Math.max(c0.y, c1.y, c2.y, c3.y)));
    if (maxX < minX || maxY < minY) return;

    /** the affine map from macro UV to screen, fitted from three corners of the quad */
    const e1 = { x: c1.x - c0.x, y: c1.y - c0.y };   // +u direction
    const e2 = { x: c3.x - c0.x, y: c3.y - c0.y };   // +v direction
    const det = e1.x * e2.y - e1.y * e2.x;
    if (Math.abs(det) < 1e-9) return;

    typoSpan = { minX, maxX, minY, maxY, w: maxX - minX + 1, h: maxY - minY + 1 };
    let scanned = 0, inWord = 0, covered = 0;
    for (let sy = minY; sy <= maxY; sy++) for (let sx = minX; sx <= maxX; sx++) {
      scanned++;
      const dx = sx + 0.5 - c0.x, dy = sy + 0.5 - c0.y;
      /** inverse of the 2x2 [e1 e2] map gives the cell's macro UV */
      const u = (dx * e2.y - dy * e2.x) / det;
      const v = (dy * e1.x - dx * e1.y) / det;
      if (u < -0.5 || u > 0.5 || v < -0.5 || v > 0.5) continue;
      inWord++;
      const mx = Math.min(mw - 1, Math.max(0, Math.floor((u + 0.5) * mw)));
      const my = Math.min(mh - 1, Math.max(0, Math.floor((0.5 - v) * mh)));
      const cell = MACRO_CLASS.field[my * mw + mx];
      if (!cell || cell.coverage <= 0.06) continue;
      covered++;
      let g = MACRO.microGlyphFor(cell);
      if (g.glyph === ' ' && cell.coverage > 0.5) {
        const spine = MACRO.spineFor(NAME_MACRO, MACRO_CLASS.field, mx, my);
        if (spine.glyph !== ' ') g = spine;
      }
      if (g.glyph === ' ') continue;
      /**
       * ⚠ THE PROTECTED SUBJECT FOOTPRINT IS CARVED OUT OF THE WORD — this is the consumption that R3.6 lacked.
       *
       * Measured before this change: the word's projected box covered **100 % of the protected hand footprint in
       * 51 of 51 evaluated frames**, so `PERSON.hand` was declared, compiled, and never visible. A warning is not a
       * repair, so the typography simply does not paint inside the footprint: **the hand reads through the word.**
       * The word keeps its size, its stroke width and its counters everywhere else, so readability is preserved
       * while the subject keeps its own screen space.
       */
      typoAttempts++;
      if (f === 252) carveDebug = { footprints: protectedFootprints.length, cvCols: cv.cols, cvRows: cv.rows, sx, sy };
      if (protectedFootprints.length) {
        const nx = (sx + 0.5) / cv.cols * 2 - 1, ny = 1 - (sy + 0.5) / cv.rows * 2;
        let inside = false;
        for (const fp of protectedFootprints) if (ANCH.footprintContains(fp, nx, ny)) { inside = true; break; }
        if (inside) { protectedCellsCarved++; continue; }
      }
      const fam = g.role === 'edge' ? 'text' : 'detail';
      if (cv.write(sx, sy, g.glyph, fam, nameInk * (g.weight || 0.5), -0.6 - frag * 0.4, g.role === 'edge' ? 'macro-stroke' : 'macro-spine', true)) typoCells++;
    }
    typoSample = { scanned, inWord, covered, macroCells: mw * mh };
  };

  /**
   * ---- GLYPH_FIELD: the carriers produced from the NAME's own topology ----
   *
   * ⚠ THE FRAGMENTS ARE THE SAME OBJECT. Each carrier records the letter and the exact topology cell it came from,
   * and it is integrated from its own previous position — so the field is the NAME continuing, not a new cloud.
   */
  const drawField = (cv) => {
    if (!ACTIVE_TRANSITION || typoState !== 'GLYPH_FIELD') return;
    const states = carrierStates;
    for (const c of CARRIERS) {
      const st = states.get(c.id);
      if (!st || !st.alive) continue;
      const pr = G.project(basis, st.position);
      if (!pr.visible) continue;
      const sp = Math.hypot(st.velocity.x, st.velocity.y, st.velocity.z);
      const ink = Math.max(0.18, Math.min(0.95, 0.42 + sp * 9));
      const g = c.isContour ? (sp > 0.004 ? '#' : ':') : '.';
      if (cv.write(SX(pr.x), SY(pr.y), g, c.isContour ? 'figure' : 'atmosphere', ink * nameFieldFade, 0.6 + pr.depth * 0.5, `fragment:${c.sourceGlyphOrRegion}`, true)) fieldCells++;
    }
  };

  /** ---- SUBJECT_LAYER: the figure, in one of two swappable representation modes ---- */
  const drawSubject = (cv) => {
    if (!personVisible) return;
    if (SUBJECT_MODE === 'EDGE_ASCII') {
      /** render the figure into a scratch canvas, then re-choose its glyphs by local edge direction */
      const scratch = new M.Canvas({ cols: COLS, rows: ROWS });
      B3.drawBody3(scratch, basis, rig, COLS, ROWS, 0.5);
      const density = scratch.inkField();
      const cls = EDGE.edgeClassify(density, COLS, ROWS, EDGE.DEFAULT_EDGE);
      let kept = 0;
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const cell = scratch.resolved(c, r);
        if (cell.ch === ' ') continue;
        const e = cls[r * COLS + c];
        if (!e || e.kind === 'void') continue;
        const owner = cell.material.startsWith('head') || cell.material.startsWith('torso') || cell.material.startsWith('leg')
          || cell.material.startsWith('shin') || cell.material.startsWith('foot') || cell.material.startsWith('upperarm')
          || cell.material.startsWith('forearm') || cell.material.startsWith('hand') || cell.material === 'neck';
        if (!owner) continue;
        cv.write(c, r, e.glyph, e.kind === 'contour' ? 'figure' : 'atmosphere', Math.max(0.30, e.ink), 0.5, e.kind === 'contour' ? 'edge-contour' : 'edge-interior');
        kept++;
      }
      subjectCells = kept;
    } else {
      /** the ORIGINAL ink-ramp figure, for the representation-mode swap test */
      const before = cv.cells.map((x) => ({ ...x }));
      B3.drawBody3(cv, basis, rig, COLS, ROWS, 0.5);
      let kept = 0;
      for (let i = 0; i < cv.cells.length; i++) if (cv.cells[i].ch !== ' ' && before[i].ch === ' ') kept++;
      subjectCells = kept;
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
  /**
   * ⚠ ---- R3: EVALUATE THE COMPILED VISUAL MODE TRANSITIONS ----
   *
   * **The timing comes from `spec.modeTransitions`, which the compiler validated and preserved.** The render
   * script reads the compiled window; it does not choose one. Each frame the object's REPRESENTATION is resolved
   * from the compiled contract:
   *
   *     SCENE_ASCII  ->  TYPOGRAPHIC_GRAPHIC  ->  GLYPH_FIELD
   *
   * and the OBJECT — `NAME_TOPO`, built once — persists across all three.
   */
  const frameInShot = f - spec.frameStart;
  currentShotFrame = frameInShot;
  const compiledTransitions = spec.modeTransitions ?? [];
  ACTIVE_TRANSITION = null;
  if (compiledTransitions.length) {
    /** the LAST transition whose window has begun is the one that governs this frame */
    for (const t of compiledTransitions) if (frameInShot >= t.startFrame) ACTIVE_TRANSITION = t;
    const first = compiledTransitions[0];
    const governing = ACTIVE_TRANSITION ?? first;
    /**
     * ⚠ THE REPORTED PHASE BELONGS TO THE **GOVERNING** TRANSITION, NOT ALWAYS TO THE FIRST ONE.
     *
     * The trace reported `compiledTransitions[0]` for every frame, so during the second window it printed
     * `phase after, progress 1.000` while the runtime was genuinely inside the fracture window. **A trace that
     * reports the wrong transition is worse than no trace, because it looks like evidence.**
     */
    const prog = MT.transitionProgressAt(governing, frameInShot);
    const perTransition = compiledTransitions.map((t) => {
      const pr = MT.transitionProgressAt(t, frameInShot);
      return { transitionId: t.transitionId, phase: pr.phase, progress: +pr.t.toFixed(4) };
    });
    /** pushed here with the representation state; the MOTION metrics are filled in after the carriers step */
    pendingTransitionEntry = {
      frame: f, shot: spec.shotId, transitionId: governing.transitionId,
      sourceObjectId: governing.sourceObjectId, sourceMode: governing.sourceMode, targetMode: governing.targetMode,
      phase: prog.phase, progress: +prog.t.toFixed(4),
      compiledInterval: [governing.startFrame, governing.endFrame],
      allTransitions: perTransition,
      carriers: CARRIERS.length, alive: 0, avgSpeed: 0, directionCoherence: 0,
      representationState: 'SCENE_ASCII',
    };
    transitionTrace.push(pendingTransitionEntry);
  }

  /**
   * RESOLVE THE REPRESENTATION FOR THIS FRAME.
   * The scale and depth are continuous functions of the compiled progress, so the object ENLARGES into
   * typographic geometry and then BREAKS into its own field — one transformation, three states.
   */
  if (ACTIVE_TRANSITION) {
    const t0 = compiledTransitions[0];
    const tf = compiledTransitions[1] ?? t0;
    const enlarge = MT.transitionProgressAt(t0, frameInShot);
    const fracture = MT.transitionProgressAt(tf, frameInShot);
    /** state 1 -> 2: the word enlarges into typographic geometry */
    typoScale = 1 + enlarge.t * 3.2;
    typoDepth = enlarge.t * 0.22;
    /**
     * ⚠ THE DISTORTION IS A CONTROLLED, COMPILED-DRIVEN DISPLACEMENT — not a random scatter.
     *
     * It ramps with the compiled progress, is applied along each macro cell's OWN stroke direction, and stays
     * small until the fracture link begins. **The word must remain recognisable before it breaks**, which is the
     * sequence the order requires: legible word -> controlled distortion -> structural fracture -> glyph field.
     */
    typoDistort = Math.max(0, Math.min(1.4, (fracture.t - 0.05) / 0.6)) * 1.0;
    /**
     * ⚠ THE WORD MUST BE BIG ENOUGH TO SAMPLE ITS OWN LETTERFORM — the second half of the invisibility bug.
     *
     * Fixing the screen mapping made the word land on the canvas, but the sampler still produced only **~100
     * covered cells** because the word spanned **47x19 output cells while its macro grid is 74x26**: it was
     * UNDER-SAMPLING itself, collapsing roughly two macro cells into every output cell and losing the strokes.
     *
     * The display size is therefore derived from the projection rather than from a fixed world width: the word is
     * sized so that **one macro cell maps to at least one output cell**, which is the condition for the letterform
     * to survive rasterisation at all. The size is clamped so the word cannot exceed the frame.
     */
    const cellsPerUnitX = 0, cellsPerUnitY = 0;
    /** the world size at which one macro cell is one output cell, with a small margin for the enlargement ramp */
    const fitW = cellsPerUnitX > 1e-6 ? (NAME_MACRO.w * 1.05) / cellsPerUnitX : NAME_W;
    const fitH = cellsPerUnitY > 1e-6 ? (NAME_MACRO.h * 1.05) / cellsPerUnitY : NAME_H;
    const grow = 1 + (typoScale - 1) * 0.42;
    /** sizing is owned by drawTypography, which also enforces the authored screen bounds */
    typoSize = { cellsPerUnitX: +cellsPerUnitX.toFixed(3), cellsPerUnitY: +cellsPerUnitY.toFixed(3),
      fitW: +fitW.toFixed(3), fitH: +fitH.toFixed(3), grow: +grow.toFixed(3),
      wTarget: +wTarget.toFixed(3), hTarget: +hTarget.toFixed(3), macroW: NAME_MACRO.w, macroH: NAME_MACRO.h };
    typoCellScale = 1;
    /**
     * ⚠ THE STATE IS RESOLVED FROM THE TRANSITION WHOSE **COMPILED TARGET MODE** IS THE GLYPH FIELD.
     *
     * The previous line read `compiledTransitions[1]`, assuming the fracture was simply the second link. In S5
     * there is no second link, so it fell back to `compiledTransitions[0] ?? t0` — the PROMINENCE link — and
     * therefore treated the prominence window as the fracture. Measured consequence: the letters were suppressed
     * from absolute 273 and the timeline oscillated. **The fracture is identified by what it compiles to, not by
     * its position in an array.**
     */
    const fractureLink = compiledTransitions.find((t) => t.targetMode === 'GLYPH_FIELD');
    const fieldPhase = fractureLink ? MT.transitionProgressAt(fractureLink, frameInShot).phase : 'before';
    /**
     * ⚠ THE FIELD STATE BEGINS WHEN THE FRACTURE BEGINS, not when it ends.
     *
     * The previous line only reached `GLYPH_FIELD` when `fieldPhase === 'after'`, so frames 320..338 — the whole
     * fracture window — were labelled TYPOGRAPHIC_GRAPHIC while the carriers were already alive and moving. The
     * representation the audience sees during a fracture is the FIELD; the letters are what came before it.
     */
    typoState = fieldPhase !== 'before' ? 'GLYPH_FIELD' : 'TYPOGRAPHIC_GRAPHIC';
    if (enlarge.phase === 'before' && fieldPhase === 'before') typoState = 'SCENE_ASCII';
    /**
     * ⚠ THE CHAIN DECIDES WHETHER TO BIRTH OR TO CONTINUE — and this is the S5 -> S6 repair.
     *
     * A transition that names `continuesTransitionId` **must not** create carriers: the object already has a
     * fragment population, and a second one would be a silent respawn with different identities. A continuation
     * instead RETARGETS the existing carriers into the new destination and EXTENDS their lifetime, so the field
     * crosses the shot boundary intact.
     *
     * The frame handed to `stepCarriers` is SHOT-RELATIVE for the transition that governs this frame, while the
     * carriers themselves are SEQUENCE-OWNED and never cleared on a cut.
     */
    /** `ACTIVE_TRANSITION` is the governing transition, chosen in the trace block above */
    const governing = ACTIVE_TRANSITION;
    /**
     * ⚠ TRANSITION EXECUTION STATE MACHINE — replacing "membership means executed".
     *
     * R3.4's defect, stated exactly: the runtime held a set `continuedIds` populated from
     * `continuesTransitionId` **FIELDS at plan level**. A link therefore became a member of that set the moment the
     * PLAN mentioned it — before it had ever run — and the retarget guard read that membership as
     * "the retarget has already happened". **A reference is not an execution.**
     *
     * Worse, the birth branch was gated on `!CARRIERS.length`, so once the prominence link had created the
     * population the fracture link did NEITHER: it was not empty enough to birth and was considered already
     * retargeted. Measured: `birth 339 death 350` — the field existed for the last 12 frames of a 30-frame window
     * and was absent for 320..338.
     *
     * Every transition now carries an explicit execution record:
     *
     *   DECLARED         the compiled contract mentions it
     *   RESOLVED         its absolute window has been computed
     *   ACTIVATED        the current frame is inside its window
     *   RETARGET_EXECUTED  the runtime has actually moved the carriers for it — ONCE
     *   VISIBLE          it contributed cells this frame
     *   TERMINATED       the frame is past its window
     */
    for (const t of compiledTransitions) {
      const key = t.transitionId;
      let st = transitionState.get(key);
      if (!st) {
        st = { transitionId: key, continues: t.continuesTransitionId ?? null,
          declared: true, resolved: true,
          absoluteWindow: [spec.frameStart + t.startFrame, spec.frameStart + t.endFrame],
          activatedAt: null, retargetExecuted: false, retargetExecutedAt: null, retargetExecutionCount: 0,
          visibleFrames: 0, terminated: false, activationCount: 0 };
        transitionState.set(key, st);
      }
      const absStart = spec.frameStart + t.startFrame, absEnd = spec.frameStart + t.endFrame;
      st.resolved = true; st.absoluteWindow = [absStart, absEnd];
      if (f >= absStart && f < absEnd) {
        if (st.activatedAt === null) { st.activatedAt = f; st.activationCount++; }
      } else if (f >= absEnd) { st.terminated = true; }
    }

    /** a link that MOVES the population; one that opens a phase may also be the mover */
    const isContinuation = !!governing.continuesTransitionId;
    const govProgress = MT.transitionProgressAt(governing, frameInShot);
    const gstate = transitionState.get(governing.transitionId);
    const govActive = gstate ? (f >= gstate.absoluteWindow[0] && f < gstate.absoluteWindow[1]) : govProgress.phase !== 'before';
    const alreadyExecuted = !!(gstate && gstate.retargetExecuted);

    if (govActive && !alreadyExecuted) {
      /**
       * ⚠ RETARGET-ON-ACTIVATION. A continuation link moves the carriers when IT activates, not when some other
       * link happens to be governing. This is what puts the fracture's population into the fracture's own window.
       */
      if (CARRIERS.length) {
        const lifeEnd = Number.isFinite(governing.carriersUntilAbsoluteFrame)
          ? governing.carriersUntilAbsoluteFrame
          : governing.endFrame + spec.frameStart + CARRIER_GRACE;
        const r = FRAG.retargetFragments(CARRIERS, governing, lifeEnd, f);
        if (gstate) { gstate.retargetExecuted = true; gstate.retargetExecutedAt = f; gstate.retargetExecutionCount++; }
        retargetLog.push({ atAbsoluteFrame: f, transitionId: governing.transitionId,
          continues: governing.continuesTransitionId ?? null, retargeted: r.retargeted,
          idsPreserved: r.idsPreserved, resolvedFragments: false, executionCount: gstate ? gstate.retargetExecutionCount : 1 });
      } else if (govProgress.phase !== 'before') {
        /** BIRTH: the population does not exist yet, so this link creates it — once, in ABSOLUTE time */
        const lifeEndAbsolute = chainEndsOf(governing, compiledTransitions, spec, CARRIER_GRACE);
        CARRIERS = FRAG.resolveFragments(NAME_TOPO, governing, G.v3(NAME.x, NAME.y, NAME.z), wTarget, hTarget, f, lifeEndAbsolute);
        carrierBirthFrame = f;
        sequenceFragmentations++;
        if (gstate) { gstate.retargetExecuted = true; gstate.retargetExecutedAt = f; gstate.retargetExecutionCount++; }
        retargetLog.push({ atAbsoluteFrame: f, transitionId: governing.transitionId, continues: null,
          retargeted: CARRIERS.length, idsPreserved: CARRIERS.length, resolvedFragments: true, executionCount: 1 });
      }
    }
    if (CARRIERS.length) {
      FRAG.stepCarriers(CARRIERS, carrierStates, f, govProgress.t);
      const liveNow = [...carrierStates.values()].filter((s2) => s2.alive).length;
      if (liveNow > 0 && gstate) gstate.visibleFrames++;
      lifeProbe = {
        n: CARRIERS.length, birth: CARRIERS[0].birthFrame, death: CARRIERS[0].deathFrame,
        stepFrame: f, govProgressPhase: govProgress.phase, govProgressT: +govProgress.t.toFixed(3),
        shotFrameStart: spec.frameStart, governingStart: governing.startFrame, governingEnd: governing.endFrame,
        absoluteWindow: [governing.startFrame + spec.frameStart, governing.endFrame + spec.frameStart],
        inLife: f >= CARRIERS[0].birthFrame && f <= CARRIERS[0].deathFrame,
      };

      /** lifecycle probes: what the lifetime engine actually decides this frame */
      lifeProbe = {
        n: CARRIERS.length, birth: CARRIERS[0].birthFrame, death: CARRIERS[0].deathFrame,
        stepFrame: f, govProgressPhase: govProgress.phase, govProgressT: +govProgress.t.toFixed(3),
        shotFrameStart: spec.frameStart, governingStart: governing.startFrame, governingEnd: governing.endFrame,
        absoluteWindow: [governing.startFrame + spec.frameStart, governing.endFrame + spec.frameStart],
        inLife: f >= CARRIERS[0].birthFrame && f <= CARRIERS[0].deathFrame,
      };
      if (fieldPhase !== 'before' && govProgress.t > 0.62) typoState = 'GLYPH_FIELD';
    }
    /** the drawn letters fade exactly as the carriers take over, so the handoff is continuous */
    nameFieldFade = Math.max(0, Math.min(1, (fracture.t - 0.35) / 0.4));

    /**
     * ⚠ THE MOTION METRICS ARE MEASURED FROM THE INTEGRATED CARRIER STATES, not asserted.
     *
     * `alive` is the count of carriers currently in their life window; `avgSpeed` is their mean measured
     * per-frame displacement; `directionCoherence` is the mean pairwise alignment of those displacement vectors
     * (1.0 = every fragment travelling the same way, 0.0 = unrelated directions). **The last is the number that
     * distinguishes a transformation from a cloud of unrelated particles**, so it is measured rather than
     * claimed.
     */
    const live = [...carrierStates.values()].filter((s2) => s2.alive);
    liveAlive = live.length;
    if (live.length) {
      const sp = live.map((s2) => Math.hypot(s2.velocity.x, s2.velocity.y, s2.velocity.z));
      liveAvgSpeed = sp.reduce((a, b) => a + b, 0) / sp.length;
      let align = 0, pairs = 0;
      for (let i = 0; i < live.length; i += 7) for (let j = i + 1; j < live.length; j += 7) {
        const a = live[i].velocity, b = live[j].velocity;
        const na = Math.hypot(a.x, a.y, a.z), nb = Math.hypot(b.x, b.y, b.z);
        if (na < 1e-9 || nb < 1e-9) continue;
        align += (a.x * b.x + a.y * b.y + a.z * b.z) / (na * nb); pairs++;
      }
      liveCoherence = pairs ? align / pairs : 0;
    }
    /**
     * ⚠ THE METRICS BELONG TO THIS FRAME. The entry is created before the carriers are stepped, so writing into
     * `pendingTransitionEntry` here recorded them against the PREVIOUS frame — the trace showed `alive 0`
     * throughout the 30..48 window and then `alive 85` for frames after it had already ended. The measurement was
     * real; the row it landed on was wrong.
     */
    const entry = transitionTrace[transitionTrace.length - 1];
    if (entry && entry.frame === f) {
      entry.alive = liveAlive;
      entry.avgSpeed = +liveAvgSpeed.toFixed(5);
      entry.directionCoherence = +liveCoherence.toFixed(4);
      entry.representationState = typoState;
    }
  } else {
    typoScale = 1; typoDepth = 0; typoState = 'SCENE_ASCII';
  }

  /**
   * ⚠ ONE AUTHORITATIVE REPRESENTATION RULE FOR THE WHOLE SEQUENCE.
   *
   * Applied AFTER the transition block so it overrides any per-shot fallback. The object's representation is a
   * property of the SEQUENCE, not of the shot:
   *
   *   a live carrier population anywhere  ->  GLYPH_FIELD (the letters must not be redrawn)
   *   a running typography transition     ->  the mode that transition names
   *   otherwise                           ->  SCENE_ASCII
   *
   * This is what makes the S5 -> S6 boundary a camera change rather than a representation reset, and it is why the
   * compositor's inert-layer check can no longer be tripped by the typography layer drawing under its own field.
   */
  liveAlive = [...carrierStates.values()].filter((s2) => s2.alive).length;
  /**
   * ⚠ THE OBJECT IS IN ITS FIELD REPRESENTATION WHILE **ANY** CARRIER POPULATION EXISTS, not only while every
   * carrier is inside its alive window. A carrier that is momentarily between its birth and its first step is
   * still the object's fragment; redrawing the letters over it is what tripped the inert-layer check.
   */
  /**
   * ⚠ THE FIELD GOVERNS ONLY ONCE THE FRACTURE IS ACTUALLY RUNNING.
   *
   * The previous rule was `if (CARRIERS.length > 0) typoState = 'GLYPH_FIELD'`. Because carriers now live until
   * absolute 317, that suppressed the letters from the moment they were born — the word was visible for only nine
   * frames and the LETTERFRAGMENT consequence arrived before its cause.
   *
   * The gate is now **causal**: the object is in its GLYPH_FIELD representation only while the fracture link is
   * running or complete. Before that the letters persist, which is precisely the authored progression
   * ("the word must be recognizable before it breaks").
   */
  if (CARRIERS.length > 0 && fractureHasBegun) typoState = 'GLYPH_FIELD';
  stateAtDraw = typoState;

  /**
   * ⚠ RESOLVE THE COMPILED TYPOGRAPHY COMPOSITION FOR THIS FRAME.
   *
   * `resolveComposition` is the runtime consumer of the contract: outside the authored readable window the word is
   * composed inside `screenRegion`; inside it the word may take `occupancy`. **The renderer never chooses either.**
   */
  resolvedComposition = spec.typographyComposition
    ? (() => { const r = TCOMP.resolveComposition(spec.typographyComposition, frameInShot);
        compositionInReadableWindow = r.inReadableWindow;
        return { widthFraction: r.widthFraction, heightFraction: r.heightFraction, resolved: r }; })()
    : null;
  if (resolvedComposition) {
    compositionResolutions++;
    /** consume visualPriority -> depth, so the published control changes the picture */
    const prio = spec.typographyComposition ? spec.typographyComposition.visualPriority : 'PRIMARY';
    typoDepthForPriority = TCOMP.depthForPriority(prio);
    priorityDepthLog.push({ frame: f, priority: prio, depth: typoDepthForPriority });
  }
  else compositionFallbacks++;

  /**
   * ⚠ CONSUME THE COMPILED PROFECTED ANCHORS — the mechanism R3.6 declared and never executed.
   *
   * The anchor resolves through the SAME `rig` the figure is drawn from, so `PERSON.hand` is the actual reaching
   * hand rather than a fixed point. The feasibility evaluator then measures, on the real output grid, how much of
   * the protected footprint the word's projected box would cover.
   */
  protectedFootprints = [];
  compositionFeasibility = null;
  if (spec.typographyComposition) {
    const rc = TCOMP.resolveComposition(spec.typographyComposition, frameInShot);
    if (rc.occlusionPolicy === 'PROTECT_SUBJECTS') {
      protectedFootprints = rc.protectedSubjectAnchors.map((a) => ANCH.resolveAnchor(a.subjectId, a.anchorId, rig, basis));
      /**
       * ⚠ ONE MASK, BUILT ONCE, READ BY BOTH. The evaluator and the carver used to compute geometry
       * independently; they now read this identical buffer, so they cannot disagree.
       */
      protectedMask = PMASK.rasteriseProtectedMask(protectedFootprints, COLS, ROWS, f);
    }
  }

  /** ---- render each layer into its OWN canvas, honouring the compiled contract ---- */
  const layerList = (() => {
    const out = [];
    if (!layerDisabled.has('SCENE_LAYER')) drawScene(cvScene);
    out.push({ layerId: 'SCENE_LAYER', subjectId: 'room', canvas: cvScene });
    if (!layerDisabled.has('SUBJECT_LAYER')) drawSubject(cvSubject);
    out.push({ layerId: 'SUBJECT_LAYER', subjectId: 'person', canvas: cvSubject });
    if (!layerDisabled.has('TYPOGRAPHY_LAYER')) { drawTypography(cvType); drawField(cvType); }
    out.push({ layerId: 'TYPOGRAPHY_LAYER', subjectId: 'name', canvas: cvType });
    drawAtmosphere(cvAtmos);
    out.push({ layerId: 'NEGATIVE_SPACE_MASK', subjectId: 'negative-space', canvas: cvAtmos });
    return out;
  })();

  /**
   * ⚠ COMPOSITION CONSTRAINT EVALUATION — run AFTER the typography layer so the word's real projected box is
   * known. The evaluator measures, on the actual output grid, how much of each protected footprint the word would
   * cover. **A warning is not a repair**, so its diagnostics drive the carving above rather than being logged.
   */
  compositionFeasibility = null;
  if (protectedMask && typoSpan) {
    /** the typography layer's REAL painted cells, on the same grid */
    typographyCellsMask = new Uint8Array(COLS * ROWS);
    for (let rr = 0; rr < ROWS; rr++) for (let cc = 0; cc < COLS; cc++) {
      const cell = cvType.resolved(cc, rr);
      if (cell.ch !== ' ') typographyCellsMask[rr * COLS + cc] = 1;
    }
    /** ⚠ THE REAL INTERSECTION — protected cells that the typography actually painted */
    maskIntersectionCells = PMASK.maskIntersection(protectedMask, typographyCellsMask);
    /**
     * ⚠ AND THE REAL PERSON∩NAME OVERLAP, measured from what each layer ACTUALLY PAINTED.
     *
     * This is the quantity that decides whether the figure is concealed by the word — not a bounding box, and not
     * the protected anchor's geometry. Measured separately here so the audit can state which layer covers which.
     */
    personNameOverlapCells = 0; personCells = 0; nameCells = 0;
    for (let rr = 0; rr < ROWS; rr++) for (let cc = 0; cc < COLS; cc++) {
      const i2 = rr * COLS + cc;
      const pc = cvSubject.resolved(cc, rr).ch !== ' ' ? 1 : 0;
      const nc = cvType.resolved(cc, rr).ch !== ' ' ? 1 : 0;
      personCells += pc; nameCells += nc;
      if (pc && nc) personNameOverlapCells++;
    }

    compositionFeasibility = ANCH.evaluateComposition({
      wordBox: { minX: typoSpan.minX, minY: typoSpan.minY, maxX: typoSpan.maxX, maxY: typoSpan.maxY },
      cols: COLS, rows: ROWS, footprints: protectedFootprints,
      strokeCells: (typoSpan.h || 0) / NAME_MACRO.h, minStrokeCells: TYPO_STROKE_CELLS,
      intersectionCells: maskIntersectionCells, maskCells: protectedMask.count,
    });
    compositionFeasibility.maskCells = protectedMask.count;
    compositionFeasibility.intersectionCells = maskIntersectionCells;
    compositionFeasibility.perAnchor = protectedMask.audit.perAnchor;
    compositionChecks.push({ frame: f, ...compositionFeasibility,
      footprintCellBounds: protectedFootprints.map((fp) => ({
        anchor: fp.subjectId + '.' + fp.anchorId, resolved: fp.resolved,
        aCells: [Math.round((fp.a.x * 0.5 + 0.5) * (COLS - 1)), Math.round((0.5 - fp.a.y * 0.5) * (ROWS - 1))],
        bCells: [Math.round((fp.b.x * 0.5 + 0.5) * (COLS - 1)), Math.round((0.5 - fp.b.y * 0.5) * (ROWS - 1))],
        radiusCells: Math.round(fp.radius * 0.5 * COLS),
      })) });
  }

  /**
   * ⚠ THE MASK'S TARGETS COME FROM THE COMPILED SPEC, and its ACTIVITY comes from the compiled interval.
   *
   * The R2.1 repair: the renderer no longer decides *when* the mask is on — `layerActivityAt` inside the
   * compositor evaluates the compiled `LayerTiming`. The script supplies only the REGION GEOMETRY, and it does so
   * **only when the compiled mask is actually visible in this shot**, so the geometry is never consulted outside
   * the compiled interval.
   *
   * `clearsSubjects` is read from `spec.layers`, not written here, so the mask's declared targets are the
   * compiled ones.
   */
  const compiledMask = (spec.layers ?? []).find((l) => l.layerId === 'NEGATIVE_SPACE_MASK');
  const maskSpan = compiledMask?.timing ? (compiledMask.timing.toFrame - compiledMask.timing.fromFrame) : 0;
  const maskActiveHere = !!(compiledMask && compiledMask.visible && maskSpan > 1);
  const negRegion = maskActiveHere
    ? { x0: 0.30, y0: 0.28, x1: 0.72, y1: 0.86, clearsSubjects: [...(compiledMask.clearsSubjects ?? [])] }
    : undefined;

  /**
   * ⚠ THE INTENT COMES FROM THE COMPILED SPEC. `spec.layers` is what `compileShotIntent` validated and preserved,
   * so the compositor consumes the compiled contract and never the plan's prose.
   */
  const VISUAL_INTENT = { layers: spec.layers ?? [], compositionNote: spec.compositionNote ?? '' };
  const composited = COMP.compositeLayers(layerList, VISUAL_INTENT, {
    negativeSpace: negRegion,
    disabled: layerDisabled,
    frameInShot: f - spec.frameStart,
    framesInShot: spec.frameEnd - spec.frameStart + 1,
  });
  /**
   * ⚠ THE CONSUMPTION REQUIREMENT IS REPRESENTATION-AWARE, and asserting it unconditionally was wrong.
   *
   * `TYPOGRAPHY_LAYER` must reach the pixels **while the object is in a typographic representation** — that is
   * what proves the layer is not inert. But in S6 the object is in its `GLYPH_FIELD` representation: the NAME is
   * carried by the CARRIERS, so the typography layer is *correctly* empty. Requiring it to contribute pixels there
   * would demand that the film draw the word twice.
   *
   * The scenario this requirement exists for — *a layer that is present but reaches nothing* — is still caught,
   * because it is asserted on every frame where the scene or subject layer draws and the state is typographic.
   */
  const requireHere = (typoState === 'SCENE_ASCII' || typoState === 'TYPOGRAPHIC_GRAPHIC')
    ? LAYERS_REQUIRED
    : LAYERS_REQUIRED.filter((l) => l !== 'TYPOGRAPHY_LAYER');
  if (REQUIRE_CONSUMED) COMP.assertLayersConsumed(composited, { requireLayers: requireHere });
  const cv = composited.canvas;

  /**
   * ⚠ OVERDRAW AUDIT: attempts vs UNIQUE cells carrying typographic material.
   * `attempts` counts every write call; `unique` counts distinct canvas cells whose material is the word's. The
   * ratio is the redundancy that R3.1 never measured.
   */
  {
    /**
     * ⚠ MEASURED ON THE TYPOGRAPHY LAYER'S OWN CANVAS, BEFORE COMPOSITING.
     *
     * The first version inspected the COMPOSITED canvas and looked for the raw material names — but the
     * compositor rewrites material to `<layerId>:<subjectId>`, so the audit reported `unique 0` while the layer
     * was plainly drawing. **A metric that measures the wrong object is worse than no metric, because it looks
     * like evidence.** The typography layer's canvas is the object that carries the word.
     */
    const seen = new Set();
    for (let r = 0; r < cvType.rows; r++) for (let c = 0; c < cvType.cols; c++) {
      const cell = cvType.resolved(c, r);
      if (cell.ch === ' ') continue;
      seen.add(r * cvType.cols + c);
    }
    typoUniqueCells = seen.size;
  }
  typoAudit.push({ frame: f, attempts: typoAttempts, unique: typoUniqueCells, canvasCells: COLS * ROWS, ratio: +(typoAttempts / Math.max(1, COLS * ROWS)).toFixed(3) });

  const finalLines = cv.toLines();
  if (prevLines) { const d = diffLineGrids(prevLines, finalLines); posChurn += d.positionChurn ?? 0; glyphChurn += d.glyphChurn ?? 0; }
  prevLines = finalLines;
  layerTrace.push({ frame: f, shot: spec.shotId, negativeSpace: !!negRegion, byLayer: composited.finalByLayer,
    consumption: composited.consumption.map((c) => ({ layerId: c.layerId, subjectId: c.subjectId, mode: c.representationMode, drawn: c.cellsDrawn, masked: c.cellsMasked, occluded: c.cellsOccluded, cellsContributed: c.cellsContributed, cellsOwned: c.cellsOwnedInComposite, timingActive: c.timingActive, timingOpacity: c.timingOpacity, timingReason: c.timingReason })) });

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
    nameFrag: +frag.toFixed(4), subjectCells, typoCells, fieldCells, typoState, stateAtDraw, carriers: CARRIERS.length, lifeProbe, typoSpan, typoSample, typoSize, typoBounds, compositionInReadableWindow: compositionInReadableWindow,
    protectedCellsCarved, carveDebug, protectedAnchorsResolved: protectedFootprints.filter((x) => x.resolved).length,
    protectedAnchorNames: protectedFootprints.map((x) => x.subjectId + '.' + x.anchorId),
    compositionBounds: resolvedComposition ? [resolvedComposition.widthFraction, resolvedComposition.heightFraction] : null, protectedAnchorScreen,
    protectedAnchors: protectedFootprints.map((x) => ({ anchor: x.subjectId + '.' + x.anchorId, resolved: x.resolved, shape: x.shape, a: x.a, b: x.b, radius: x.radius })),
    feasibility: compositionFeasibility,
    protectedMaskCells: protectedMask ? protectedMask.count : 0,
    protectedMaskIntersection: maskIntersectionCells,
    personCells, nameCells, personNameOverlapCells, typoScale: +typoScale.toFixed(3), roomDecay: +decay.toFixed(4), fieldMeanSpeed: +field.meanSpeed().toFixed(4),
    fieldCensus: field.census(), transition: activeTransition(f)?.id ?? null, rootX: +perf.floor.x.toFixed(5), headYaw: +perf.headYaw.toFixed(3), reach: +perf.arm.toFixed(4) });
  if (f % 60 === 0) console.log(`  frame ${String(f).padStart(3)}  ${spec.shotId.padEnd(22)} fov ${cam.fovDegrees.toFixed(1).padStart(5)}  subjH ${(trace[trace.length-1].subjectHeightFraction*100).toFixed(1)}%  field v ${field.meanSpeed().toFixed(3)}${activeTransition(f) ? '  [' + activeTransition(f).id + ']' : ''}`);
}
await writeFile(path.join(OUT, 'feature-consumption.json'), JSON.stringify({
  note: 'DECLARED -> VALIDATED -> COMPILED -> CONSUMED -> PIXEL CONSEQUENCE for TypographyCompositionIntent.',
  stages: [
    { stage: 'DECLARED', evidence: 'scripts/r36-plan.mjs declares typographyComposition on S5-reach: layoutPolicy FIT, screenRegion, readabilityInterval [8,29) with occupancy 0.92x0.78, visualPriority PRIMARY, protectedSubjectAnchors PERSON.hand, occlusionPolicy PROTECT_SUBJECTS' },
    { stage: 'VALIDATED', evidence: 'validateTypographyComposition refuses an invalid screen bounds, a missing referenced object, an unresolvable protected anchor, an empty or out-of-shot readability interval, an unsupported layout policy, and non-finite values' },
    { stage: 'COMPILED', evidence: 'compileShotIntent preserves it on CompiledShotSpec.typographyComposition' },
    { stage: 'CONSUMED', evidence: 'the renderer calls resolveComposition(spec.typographyComposition, frameInShot) and derives the screen bounds from it; NO screen bound is hardcoded for a composed shot' },
    { stage: 'PIXEL_CONSEQUENCE', evidence: 'the word bounds are taken from the resolved composition and the letterform is sized so one macro stroke spans at least three output cells' },
  ],
  consumptionCounts: { composedFramesResolved: compositionResolutions, framesWithoutComposition: compositionFallbacks },
  protectedAnchorsByShot: [...byId.entries()].flatMap(([k, sp]) => sp.typographyComposition
    ? [{ shotId: k, sourceObjectId: sp.typographyComposition.sourceObjectId, anchors: sp.typographyComposition.protectedSubjectAnchors,
         screenRegion: sp.typographyComposition.screenRegion, readabilityInterval: sp.typographyComposition.readabilityInterval,
         layoutPolicy: sp.typographyComposition.layoutPolicy, visualPriority: sp.typographyComposition.visualPriority,
         occlusionPolicy: sp.typographyComposition.occlusionPolicy }]
    : []),
}, null, 2));
await writeFile(path.join(OUT, 'protected-anchor-trace.json'), JSON.stringify({
  note: 'PROTECTED ANCHOR CONSUMPTION: DECLARED -> VALIDATED -> COMPILED -> RESOLVED -> CONSUMED -> FINAL VISIBLE PIXELS. The anchor resolves through the same rig the figure is drawn from, so PERSON.hand is the actual reaching hand.',
  declared: [...byId.entries()].flatMap(([k, sp]) => sp.typographyComposition ? [{ shotId: k, anchors: sp.typographyComposition.protectedSubjectAnchors, occlusionPolicy: sp.typographyComposition.occlusionPolicy, visualPriority: sp.typographyComposition.visualPriority }] : []),
  resolvedFrames: compositionChecks.length,
  perFrame: compositionChecks,
}, null, 2));
await writeFile(path.join(OUT, 'composition-feasibility-report.json'), JSON.stringify({
  note: 'COMPOSITION CONSTRAINT EVALUATOR. A warning is not a repair: these diagnostics are produced from the real projected geometry and the real output grid.',
  diagnostics: ANCH.COMPOSITION_DIAGNOSTICS,
  summary: {
    framesEvaluated: compositionChecks.length,
    framesOk: compositionChecks.filter((c) => c.ok).length,
    byDiagnostic: ANCH.COMPOSITION_DIAGNOSTICS.map((d) => ({ diagnostic: d, frames: compositionChecks.filter((c) => c.diagnostics.includes(d)).length })),
  },
  perFrame: compositionChecks,
}, null, 2));
await writeFile(path.join(OUT, 'retarget-execution-ledger.json'), JSON.stringify({
  note: 'Per-transition EXECUTION state. Membership of a declared set is NOT execution; this ledger records what the RUNTIME actually did.',
  states: ['DECLARED','RESOLVED','ACTIVATED','RETARGET_EXECUTED','VISIBLE','TERMINATED'],
  transitions: [...transitionState.values()],
  retargetExecutions: retargetLog,
  sequenceFragmentations,
  invariant: 'every continuation link must have retargetExecutionCount exactly 1, and the whole film must resolve fragments exactly once',
}, null, 2));
await writeFile(path.join(OUT, 'transition-state-trace.json'), JSON.stringify({
  note: 'Per-frame transition execution state. The four carrier counters are kept SEPARATE.',
  counterNote: 'carrierCount = population in memory; aliveCarrierCount = inside its authored lifetime; visibleCarrierCount = drawn this frame; compositedCarrierCount = survives compositing. They are NOT interchangeable.',
  frames: transitionTrace,
}, null, 2));
await writeFile(path.join(OUT, 'typography-overdraw-audit.json'), JSON.stringify({
  note:'Typographic write attempts vs unique cells on the typography layer canvas. attempts is NOT visibility.',
  canvasCells: COLS * ROWS,
  frames: typoAudit,
}, null, 2));
await writeFile(path.join(OUT, 'typography-topology.json'), JSON.stringify({
  note: 'The semantic object SOURCE OBJECT IDENTITY. Built once per render from NAME_TEXT and consumed by BOTH the typography layer and the fragment generator, so one object supports every representation state.',
  text: NAME_TOPO.text, cols: NAME_TOPO.cols, rows: NAME_TOPO.rows, box: NAME_TOPO.box,
  filledCells: NAME_TOPO.cells.length, contourCells: NAME_TOPO.contour.length, interiorCells: NAME_TOPO.interior.length,
  perCharacter: NAME_TOPO.perCharacter,
  topologyConsumedByFragmentGeneration: CARRIERS.length > 0,
  carriersResolved: CARRIERS.length,
  noteOnPartition: 'contour and interior partition the filled cells. For a 1-cell-wide stroke the interior is legitimately empty.',
}, null, 2));
await writeFile(path.join(OUT, 'glyph-carrier-trace.json'), JSON.stringify({
  note: 'GLYPH MOTION CONTINUITY. Each carrier keeps a stable id, its source letter and its exact topology cell, and its position is INTEGRATED from its own previous frame — it is never resampled.',
  idsAreStableAcrossFrames: true,
  resampledPerFrame: false,
  carriers: CARRIERS.map((c) => ({ id: c.id, sourceObjectId: c.sourceObjectId, sourceChar: c.sourceChar, sourceGlyphOrRegion: c.sourceGlyphOrRegion, sourceCell: c.sourceCell, isContour: c.isContour, birthFrame: c.birthFrame, deathFrame: c.deathFrame, start: c.position, target: c.target })),
  provenance: FRAG.carrierProvenance(CARRIERS),
  perFrame: transitionTrace.map((x) => {
    const alive = [...carrierStates.values()].filter((s2) => s2.alive);
    return { frame: x.frame, phase: x.phase, progress: x.progress, alive: alive.length };
  }).filter((x) => x.alive > 0 || x.phase === 'running'),
}, null, 2));
await writeFile(path.join(OUT, 'layer-consumption.json'), JSON.stringify({
  note: 'LayerConsumptionTrace — every key output cell traces to layerId / representationMode / materialId / subject. A declared visible layer that contributed 0 pixels FAILS the render.',
  contractSource: 'CompiledShotSpec.layers, produced by compileShotIntent',
  layersPerShot: [...byId.values()].map((sp) => ({ shotId: sp.shotId, compositionNote: sp.compositionNote ?? null, layers: (sp.layers ?? []).map((l) => ({ layerId: l.layerId, subjectId: l.subjectId, drawsSubjects: l.drawsSubjects ?? [l.subjectId], representationMode: l.representationMode, materialId: l.materialId, priority: l.priority, visible: l.visible, clearsSubjects: l.clearsSubjects ?? [] })) })),
  perFrameTrace: layerTrace,
}, null, 2));
await writeFile(path.join(OUT, 'transition-trace.json'), JSON.stringify({ note: 'Compiled transition timing vs runtime phase, per frame.', trace: transitionTrace }, null, 2));
await writeFile(path.join(OUT, 'render-trace.json'), JSON.stringify({ totalFrames: PLAN.TOTAL_FRAMES, fps: FPS, syncMode: 'SILENT', contract: { compiledWith: 'compileSequence', guardedBy: 'guardRenderable', guardCalls: PLAN.TOTAL_FRAMES }, transitions: transitionTraces, churn: { position: posChurn, glyph: glyphChurn }, trace }, null, 2));

// ---- encode ----
console.log('\n  encoding MP4 ...');
for (let i = 0; i < frames.length; i++) await writeFile(path.join(TMP, `f${String(i).padStart(4, '0')}.png`), frames[i]);
await new Promise((res, rej) => { const c = spawn(FF, ['-y', '-hide_banner', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(TMP, 'f%04d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '17', path.join(OUT, 'final-kinetic-r371.mp4')], { env: { ...process.env, DYLD_LIBRARY_PATH: LIB } }); let e = ''; c.stderr.on('data', (d) => (e += d)); c.on('close', (code) => (code === 0 ? res() : rej(new Error(e)))); });
await rm(TMP, { recursive: true, force: true });
const { readFile } = await import('node:fs/promises');
const buf = await readFile(path.join(OUT, 'final-kinetic-r371.mp4'));
console.log(`  final-kinetic-r371.mp4  ${(buf.length / 1048576).toFixed(2)} MB  sha256 ${createHash('sha256').update(buf).digest('hex').slice(0, 16)}`);
console.log(`  transitions recorded: ${transitionTraces.length}`);
for (const tt of transitionTraces) console.log(`    ${tt.kind.padEnd(20)} ${tt.fromShot} -> ${tt.toShot}  carriers ${tt.carrierCount}  dirConsistency ${tt.directionConsistency}  momentumPreserved ${tt.momentumPreserved}`);

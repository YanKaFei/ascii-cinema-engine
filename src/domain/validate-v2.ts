/**
 * FilmSpec v2 / ShotSpec v2 validation — the LLM boundary, made enforceable.
 *
 * The rule that matters: **an LLM's output is data, and data is not trusted.**
 *
 * Stage 10 of the Phase 2 workflow says invalid fields must be rejected, repaired or
 * defaulted — never silently ignored. This module is where that happens. It produces:
 *
 *   - hard `errors`, which mean the spec cannot be compiled or rendered;
 *   - `repairs`, which name the path, the problem and the action taken, and are copied
 *     into `FilmSpecV2.provenance.repairs` so every repair is visible in
 *     director-report.json. A repair is not a warning to be scrolled past; it is a
 *     recorded deviation from what the interpreter asked for.
 *
 * The validator deliberately does NOT fix things quietly. If a planner emits a
 * transformation not in the grammar, that is an error — the grammar is closed precisely
 * so that an unknown term is a bug rather than a no-op.
 */

import {
  COMPOSITION_KINDS,
  CAMERA_REASONS,
  MOTION_KINDS,
  NARRATIVE_FUNCTIONS,
  OCCLUSION_POLICIES,
  SPACE_KINDS,
  SUBJECT_KINDS,
  SUBJECT_ROLES,
  TRANSITION_KINDS,
  isCameraReason,
  isCompositionKind,
  isMotionKind,
  isNarrativeFunction,
  isOcclusionPolicy,
  isSpaceKind,
  isSubjectKind,
  isSubjectRole,
  isTransformationKind,
  isTransitionKind,
  TRANSFORMATION_KINDS,
  type CameraReason,
  type CompositionKind,
  type MotionKind,
  type NarrativeFunction,
  type OcclusionPolicy,
  type SpaceKind,
  type SubjectKind,
  type SubjectRole,
  type TransformationKind,
  type TransitionKind,
} from "../director/grammar/vocabulary.js";
import type { FilmSpecV2, InputMode, Interpretation, RhythmPlan } from "./film-spec-v2.js";
import { INPUT_MODES } from "./film-spec-v2.js";
import type { ShotSpecV2, SpaceSpec, SubjectSpec } from "./shot-spec-v2.js";
import { GLYPH_BY_CODE } from "../glyphs/atlas.js";

export interface V2Issue {
  level: "error" | "warning";
  path: string;
  message: string;
}

export interface V2Repair {
  path: string;
  problem: string;
  action: "repaired" | "defaulted" | "dropped";
}

export interface V2ValidationResult {
  ok: boolean;
  issues: V2Issue[];
  repairs: V2Repair[];
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

class Collector {
  issues: V2Issue[] = [];
  repairs: V2Repair[] = [];

  error(path: string, message: string): void {
    this.issues.push({ level: "error", path, message });
  }
  warn(path: string, message: string): void {
    this.issues.push({ level: "warning", path, message });
  }
  repair(path: string, problem: string, action: V2Repair["action"] = "repaired"): void {
    this.repairs.push({ path, problem, action });
    this.warn(path, `${problem} (${action})`);
  }

  /** Returns the value if it is a member of `allowed`, otherwise undefined. */
  member<T extends string>(path: string, value: unknown, allowed: readonly T[]): T | undefined {
    if (typeof value === "string" && (allowed as readonly string[]).includes(value)) return value as T;
    this.error(path, `"${String(value)}" is not in the grammar [${allowed.join(", ")}]`);
    return undefined;
  }

  nonEmptyString(path: string, value: unknown): string | undefined {
    if (typeof value === "string" && value.trim().length > 0) return value;
    this.error(path, "must be a non-empty string");
    return undefined;
  }

  unit(path: string, value: unknown): number | undefined {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      this.error(path, `must be a finite number, got ${String(value)}`);
      return undefined;
    }
    if (value < 0 || value > 1) {
      this.error(path, `${value} is outside 0..1`);
      return undefined;
    }
    return value;
  }
}

/** Curves must be non-empty, sorted, and inside the unit square. */
function validateCurve(c: Collector, path: string, curve: unknown): boolean {
  if (!Array.isArray(curve) || curve.length === 0) {
    c.error(path, "curve must be a non-empty array of [at, value] pairs");
    return false;
  }
  let lastAt = -Infinity;
  let ok = true;
  curve.forEach((pair, i) => {
    if (!Array.isArray(pair) || pair.length !== 2) {
      c.error(`${path}[${i}]`, "must be [at, value]");
      ok = false;
      return;
    }
    const [at, v] = pair as [unknown, unknown];
    if (typeof at !== "number" || !Number.isFinite(at) || at < 0 || at > 1) {
      c.error(`${path}[${i}][0]`, `at must be within 0..1, got ${String(at)}`);
      ok = false;
    } else {
      if (at < lastAt) {
        c.error(`${path}[${i}][0]`, `curve is not sorted by 'at' (${at} after ${lastAt})`);
        ok = false;
      }
      lastAt = at;
    }
    if (typeof v !== "number" || !Number.isFinite(v) || v < 0 || v > 1) {
      c.error(`${path}[${i}][1]`, `value must be within 0..1, got ${String(v)}`);
      ok = false;
    }
  });
  return ok;
}

function validateRhythm(c: Collector, path: string, plan: unknown): boolean {
  if (typeof plan !== "object" || plan === null) {
    c.error(path, "rhythm plan is required");
    return false;
  }
  const p = plan as Partial<RhythmPlan>;
  let ok = true;
  for (const k of ["energy", "tension", "informationDensity", "motionDensity"] as const) {
    if (!validateCurve(c, `${path}.${k}`, p[k])) ok = false;
  }
  if (typeof p.rationale !== "string" || p.rationale.trim().length === 0) {
    c.error(`${path}.rationale`, "rhythm plan must state its rationale");
    ok = false;
  }
  return ok;
}

function validateSpace(c: Collector, path: string, s: unknown): SpaceSpec | undefined {
  if (typeof s !== "object" || s === null) {
    c.error(path, "space is required (a film must know what kind of space it is in)");
    return undefined;
  }
  const sp = s as Partial<SpaceSpec>;
  const kind = c.member<SpaceKind>(`${path}.kind`, sp.kind, SPACE_VALUES);
  c.nonEmptyString(`${path}.description`, sp.description);
  const policy = c.member<OcclusionPolicy>(`${path}.occlusionPolicy`, sp.occlusionPolicy, OCCLUSION_VALUES);
  if (typeof sp.boundaryVisible !== "boolean") {
    c.error(`${path}.boundaryVisible`, "must be a boolean");
  }
  if (kind === undefined || policy === undefined) return undefined;
  return sp as SpaceSpec;
}

function validateSubject(c: Collector, path: string, s: unknown): SubjectSpec | undefined {
  if (typeof s !== "object" || s === null) {
    c.error(path, "subject must be an object");
    return undefined;
  }
  const sub = s as Partial<SubjectSpec>;
  c.nonEmptyString(`${path}.id`, sub.id);
  c.nonEmptyString(`${path}.description`, sub.description);
  const form = c.member<SubjectKind>(`${path}.visualForm`, sub.visualForm, SUBJECT_KIND_VALUES);
  const role = c.member<SubjectRole>(`${path}.role`, sub.role, SUBJECT_ROLE_VALUES);
  c.unit(`${path}.prominence`, sub.prominence);

  // A word/glyph subject must carry ASCII text: the medium is ASCII-only.
  if (form === "word" || form === "glyph") {
    if (typeof sub.text !== "string" || sub.text.length === 0) {
      c.error(`${path}.text`, `a subject with visualForm "${form}" must carry ASCII text`);
    } else {
      const bad = Array.from(sub.text).filter((ch) => {
        const code = ch.charCodeAt(0);
        return code < 32 || code > 126;
      });
      if (bad.length > 0) {
        c.error(
          `${path}.text`,
          `text contains non-printable-ASCII characters ${JSON.stringify(bad.join(""))}; ` +
            "the visual language is ASCII-only",
        );
      }
    }
  }
  if (form === undefined || role === undefined) return undefined;
  return sub as SubjectSpec;
}

// NOTE: these are imported from the grammar rather than restated. An earlier revision
// kept a local copy, which had already drifted from the grammar by omitting "tunnel" —
// exactly the class of bug a closed vocabulary is supposed to prevent.
const SPACE_VALUES = SPACE_KINDS;
const OCCLUSION_VALUES = OCCLUSION_POLICIES;
const SUBJECT_KIND_VALUES = SUBJECT_KINDS;
const SUBJECT_ROLE_VALUES = SUBJECT_ROLES;

// ---------------------------------------------------------------------------
// shot
// ---------------------------------------------------------------------------

export function validateShotV2(shot: ShotSpecV2, index: number, c: Collector): void {
  const p = `shots[${index}]`;
  c.nonEmptyString(`${p}.id`, shot.id);
  c.nonEmptyString(`${p}.title`, shot.title);

  // --- the three fields that make a shot a directorial decision ---------------
  c.member<NarrativeFunction>(`${p}.narrativeFunction`, shot.narrativeFunction, NARRATIVE_FUNCTION_VALUES);
  c.nonEmptyString(`${p}.intention`, shot.intention);
  c.nonEmptyString(`${p}.visualReason`, shot.visualReason);
  c.nonEmptyString(`${p}.cameraReason`, shot.cameraReason);

  // --- timing ---------------------------------------------------------------
  if (typeof shot.start !== "number" || !Number.isFinite(shot.start) || shot.start < 0) {
    c.error(`${p}.start`, "must be a finite number >= 0");
  }
  if (typeof shot.duration !== "number" || !Number.isFinite(shot.duration) || shot.duration <= 0) {
    c.error(`${p}.duration`, "must be a finite number > 0");
  }
  if (typeof shot.background !== "number" || shot.background < 0 || shot.background > 1) {
    c.error(`${p}.background`, "must be within 0..1");
  }

  // --- subjects -------------------------------------------------------------
  if (!Array.isArray(shot.subjects) || shot.subjects.length === 0) {
    c.error(`${p}.subjects`, "a shot must have at least one subject");
  } else {
    const ids = new Set<string>();
    shot.subjects.forEach((s, i) => {
      const parsed = validateSubject(c, `${p}.subjects[${i}]`, s);
      if (parsed?.id) {
        if (ids.has(parsed.id)) c.error(`${p}.subjects[${i}].id`, `duplicate subject id "${parsed.id}"`);
        ids.add(parsed.id);
      }
    });
  }

  // --- space ----------------------------------------------------------------
  validateSpace(c, `${p}.space`, shot.space);

  // --- composition ----------------------------------------------------------
  if (typeof shot.composition !== "object" || shot.composition === null) {
    c.error(`${p}.composition`, "composition is required");
  } else {
    const comp = shot.composition;
    c.member<CompositionKind>(`${p}.composition.primary`, comp.primary, COMPOSITION_VALUES);
    if (comp.secondary !== undefined) {
      if (!Array.isArray(comp.secondary)) {
        c.error(`${p}.composition.secondary`, "must be an array");
      } else {
        comp.secondary.forEach((k, i) =>
          c.member<CompositionKind>(`${p}.composition.secondary[${i}]`, k, COMPOSITION_VALUES),
        );
      }
    }
    const pl = comp.subjectPlacement;
    if (
      typeof pl !== "object" ||
      pl === null ||
      typeof pl.x !== "number" ||
      typeof pl.y !== "number" ||
      !Number.isFinite(pl.x) ||
      !Number.isFinite(pl.y)
    ) {
      c.error(`${p}.composition.subjectPlacement`, "must be { x, y } finite numbers");
    }
    c.unit(`${p}.composition.negativeSpaceRatio`, comp.negativeSpaceRatio);
    c.nonEmptyString(`${p}.composition.reason`, comp.reason);
  }

  // --- camera ---------------------------------------------------------------
  if (typeof shot.camera !== "object" || shot.camera === null) {
    c.error(`${p}.camera`, "camera is required");
  } else {
    c.member<CameraReason>(`${p}.camera.reason`, shot.camera.reason, CAMERA_REASON_VALUES);
    c.nonEmptyString(`${p}.camera.reasonDetail`, shot.camera.reasonDetail);
    const mv = shot.camera.move;
    if (typeof mv !== "object" || mv === null) {
      c.error(`${p}.camera.move`, "camera.move is required");
    } else {
      c.nonEmptyString(`${p}.camera.move.kind`, mv.kind);
      if (typeof mv.focusDistance !== "number" || !(mv.focusDistance > 0)) {
        c.error(`${p}.camera.move.focusDistance`, "must be > 0 (it IS the framing)");
      }
      // `focal` is deliberately NOT a field of CameraMoveSpec: the pinhole ratio is
      // fixed at 1 and the framing control is focusDistance. A spec that carries one is
      // reaching for the Phase 1 bug, so reject it structurally.
      if (typeof (mv as unknown as Record<string, unknown>).focal !== "undefined") {
        c.error(
          `${p}.camera.move.focal`,
          "camera.move must not carry `focal`; the pinhole ratio is fixed at 1 and " +
            "focusDistance is the framing control",
        );
      }
    }
    c.member(`${p}.camera.rhythmCoupling`, shot.camera.rhythmCoupling, ["follows-curve", "against-curve", "independent"] as const);
  }

  // --- motion ---------------------------------------------------------------
  if (!Array.isArray(shot.motion)) {
    c.error(`${p}.motion`, "motion must be an array (possibly empty)");
  } else {
    const subjectIds = new Set(shot.subjects?.map((s) => s.id) ?? []);
    shot.motion.forEach((m, i) => {
      c.member<MotionKind>(`${p}.motion[${i}].kind`, m.kind, MOTION_VALUES);
      c.nonEmptyString(`${p}.motion[${i}].purpose`, m.purpose);
      c.unit(`${p}.motion[${i}].intensity`, m.intensity);
      if (m.subjectId && subjectIds.size > 0 && !subjectIds.has(m.subjectId)) {
        c.error(`${p}.motion[${i}].subjectId`, `"${m.subjectId}" is not a subject of this shot`);
      }
    });
  }

  // --- transformation -------------------------------------------------------
  if (shot.transformation !== undefined) {
    const t = shot.transformation;
    c.member<TransformationKind>(`${p}.transformation.kind`, t.kind, TRANSFORMATION_KINDS);
    c.member(`${p}.transformation.causedBy`, t.causedBy, [
      "camera", "subject", "environment", "time", "external",
    ] as const);
    c.nonEmptyString(`${p}.transformation.becomes`, t.becomes);
    c.nonEmptyString(`${p}.transformation.dramaticPurpose`, t.dramaticPurpose);
    c.unit(`${p}.transformation.from`, t.from);
    c.unit(`${p}.transformation.to`, t.to);
    if (typeof t.to === "number" && typeof t.from === "number" && t.to <= t.from) {
      c.error(`${p}.transformation`, `to (${t.to}) must be greater than from (${t.from})`);
    }
    const subjectIds = new Set(shot.subjects?.map((s) => s.id) ?? []);
    if (t.subjectId && subjectIds.size > 0 && !subjectIds.has(t.subjectId)) {
      c.error(`${p}.transformation.subjectId`, `"${t.subjectId}" is not a subject of this shot`);
    }
  }

  // --- transitions ----------------------------------------------------------
  for (const key of ["transitionIn", "transitionOut"] as const) {
    const tr = shot[key];
    if (tr === undefined) continue;
    c.member<TransitionKind>(`${p}.${key}.kind`, tr.kind, TRANSITION_VALUES);
    if (typeof tr.duration !== "number" || tr.duration < 0) {
      c.error(`${p}.${key}.duration`, "must be >= 0");
    }
    c.nonEmptyString(`${p}.${key}.reason`, tr.reason);
    if (tr.kind === "cut" && tr.duration > 0) {
      c.error(`${p}.${key}`, "a cut cannot have a nonzero duration");
    }
  }

  // --- rhythm ---------------------------------------------------------------
  if (typeof shot.rhythm !== "object" || shot.rhythm === null) {
    c.error(`${p}.rhythm`, "rhythm is required");
  } else {
    for (const k of ["energy", "tension", "informationDensity", "motionDensity"] as const) {
      c.unit(`${p}.rhythm.${k}`, shot.rhythm[k]);
    }
    c.member(`${p}.rhythm.source`, shot.rhythm.source, ["curve", "override"] as const);
    if (shot.rhythm.source === "override") {
      c.nonEmptyString(`${p}.rhythm.overrideReason`, shot.rhythm.overrideReason);
    }
  }

  // --- realisation ----------------------------------------------------------
  if (!Array.isArray(shot.layers) || shot.layers.length === 0) {
    c.error(`${p}.layers`, "a shot must have at least one layer");
  } else {
    shot.layers.forEach((l, i) => {
      if (typeof l.count !== "number" || !(l.count > 0)) c.error(`${p}.layers[${i}].count`, "must be > 0");
      if (typeof l.glyphRadius !== "number" || !(l.glyphRadius > 0)) {
        c.error(`${p}.layers[${i}].glyphRadius`, "must be > 0 (in glyph cells)");
      }
      if (typeof l.intensity !== "number" || !(l.intensity >= 0)) {
        c.error(`${p}.layers[${i}].intensity`, "must be >= 0");
      }
      if (typeof l.focus !== "number" || !(l.focus >= 0.1)) c.error(`${p}.layers[${i}].focus`, "must be >= 0.1");
    });
  }
  if (!Array.isArray(shot.techniques)) {
    c.error(`${p}.techniques`, "techniques must be an array (kept for the v1 report and baseline)");
  }

  // --- density --------------------------------------------------------------
  if (typeof shot.density !== "object" || shot.density === null) {
    c.error(`${p}.density`, "density is required");
  } else {
    const d = shot.density;
    for (const k of [
      "coverageMinStart", "coverageMinEnd", "coverageMaxStart", "coverageMaxEnd",
    ] as const) {
      if (typeof d[k] !== "number" || !Number.isFinite(d[k])) {
        c.error(`${p}.density.${k}`, "must be a finite number");
      }
    }
    if (d.coverageMinStart >= d.coverageMaxStart) {
      c.error(`${p}.density`, "first-frame coverageMin must be < coverageMax");
    }
    if (d.coverageMinEnd >= d.coverageMaxEnd) {
      c.error(`${p}.density`, "last-frame coverageMin must be < coverageMax");
    }
  }
}

const COMPOSITION_VALUES = COMPOSITION_KINDS;
const MOTION_VALUES = MOTION_KINDS;
const TRANSITION_VALUES = TRANSITION_KINDS;
const NARRATIVE_FUNCTION_VALUES = NARRATIVE_FUNCTIONS;
const CAMERA_REASON_VALUES = CAMERA_REASONS;

// ---------------------------------------------------------------------------
// film
// ---------------------------------------------------------------------------

export function validateFilmSpecV2(input: FilmSpecV2): V2ValidationResult {
  const c = new Collector();

  // Defensive: this validator is the LLM boundary, so its input may be arbitrarily
  // malformed. It must REJECT bad shapes rather than throw, because a throw loses the
  // whole repair ledger and tells the caller nothing about what to fix.
  if (input === null || typeof input !== "object") {
    c.error("(root)", `spec must be an object, got ${input === null ? "null" : typeof input}`);
    return { ok: false, issues: c.issues, repairs: c.repairs };
  }
  const film = input;

  eq(c, "version", film.version, "2");
  c.nonEmptyString("slug", film.slug);
  c.nonEmptyString("title", film.title);

  // --- input ----------------------------------------------------------------
  if (typeof film.input !== "object" || film.input === null) {
    c.error("input", "input is required");
  } else {
    c.nonEmptyString("input.raw", film.input.raw);
    c.member<InputMode>("input.mode", film.input.mode, INPUT_MODES);
    c.nonEmptyString("input.modeRationale", film.input.modeRationale);
    if (film.input.mode === "script") {
      if (!Array.isArray(film.input.scriptUnits) || film.input.scriptUnits.length === 0) {
        c.error("input.scriptUnits", "script mode requires at least one parsed script unit");
      }
    }
  }

  // --- interpretation -------------------------------------------------------
  const interp = film.interpretation;
  if (typeof interp !== "object" || interp === null) {
    c.error("interpretation", "interpretation is required");
  } else {
    validateInterpretation(c, interp);
  }

  // --- direction ------------------------------------------------------------
  const dir = film.direction;
  if (typeof dir !== "object" || dir === null) {
    c.error("direction", "direction is required");
  } else {
    if (typeof dir.duration !== "number" || !(dir.duration > 0)) c.error("direction.duration", "must be > 0");
    if (typeof dir.fps !== "number" || !Number.isInteger(dir.fps) || dir.fps <= 0) {
      c.error("direction.fps", "must be a positive integer");
    }
    const res = dir.resolution;
    if (!Array.isArray(res) || res.length !== 2 || typeof res[0] !== "number" || typeof res[1] !== "number") {
      c.error("direction.resolution", "must be [width, height]");
    } else {
      if (res[0] % 8 !== 0) c.error("direction.resolution", `width ${res[0]} is not divisible by the 8px cell`);
      if (res[1] % 9 !== 0) c.error("direction.resolution", `height ${res[1]} is not divisible by the 9px cell`);
    }
    for (const k of [
      "visualStrategy", "densityStrategy", "cameraStrategy", "editingStrategy",
      "rhythmStrategy", "openingImage", "closingImage",
    ] as const) {
      c.nonEmptyString(`direction.${k}`, dir[k]);
    }
    validateRhythm(c, "direction.rhythm", dir.rhythm);
    if (typeof dir.look !== "object" || dir.look === null) c.error("direction.look", "look is required");
    if (typeof dir.raster !== "object" || dir.raster === null) c.error("direction.raster", "raster is required");
  }

  // --- acts -----------------------------------------------------------------
  if (!Array.isArray(film.acts) || film.acts.length === 0) {
    c.error("acts", "at least one act is required");
  } else {
    const shotIds = new Set(
      (Array.isArray(film.shots) ? film.shots : [])
        .filter((s): s is ShotSpecV2 => s !== null && typeof s === "object")
        .map((s) => s.id),
    );
    const seenActIds = new Set<string>();
    film.acts.forEach((a, i) => {
      const ap = `acts[${i}]`;
      if (seenActIds.has(a.id)) c.error(`${ap}.id`, `duplicate act id "${a.id}"`);
      seenActIds.add(a.id);
      c.nonEmptyString(`${ap}.title`, a.title);
      c.nonEmptyString(`${ap}.function`, a.function);
      c.member<NarrativeFunction>(`${ap}.dominantFunction`, a.dominantFunction, NARRATIVE_FUNCTION_VALUES);
      if (typeof a.from !== "number" || typeof a.to !== "number" || !(a.to > a.from)) {
        c.error(`${ap}`, `act range must satisfy to > from (got ${a.from}..${a.to})`);
      }
      if (!Array.isArray(a.shotIds) || a.shotIds.length === 0) {
        c.error(`${ap}.shotIds`, "an act must own at least one shot");
      } else {
        for (const id of a.shotIds) {
          if (!shotIds.has(id)) c.error(`${ap}.shotIds`, `"${id}" is not a shot of this film`);
        }
      }
      if (a.dominantSpace !== undefined) c.member<SpaceKind>(`${ap}.dominantSpace`, a.dominantSpace, SPACE_VALUES);
      if (a.dominantComposition !== undefined) {
        c.member<CompositionKind>(`${ap}.dominantComposition`, a.dominantComposition, COMPOSITION_VALUES);
      }
    });

    // every shot must belong to exactly one act
    const owned = new Map<string, number>();
    for (const a of film.acts) {
      if (a === null || typeof a !== "object") continue;
      for (const id of Array.isArray(a.shotIds) ? a.shotIds : []) owned.set(id, (owned.get(id) ?? 0) + 1);
    }
    for (const id of shotIds) {
      const n = owned.get(id) ?? 0;
      if (n === 0) c.error("acts", `shot "${id}" belongs to no act`);
      if (n > 1) c.error("acts", `shot "${id}" belongs to ${n} acts; each shot must belong to exactly one`);
    }
  }

  // --- shots ----------------------------------------------------------------
  if (!Array.isArray(film.shots) || film.shots.length === 0) {
    c.error("shots", "at least one shot is required");
  } else {
    // narrative functions must all appear across a film that claims to be a film
    const seenIds = new Set<string>();
    let cursor = 0;
    film.shots.forEach((s, i) => {
      if (s === null || typeof s !== "object") {
        c.error(`shots[${i}]`, `shot must be an object, got ${s === null ? "null" : typeof s}`);
        return;
      }
      if (seenIds.has(s.id)) c.error(`shots[${i}].id`, `duplicate shot id "${s.id}"`);
      seenIds.add(s.id);
      validateShotV2(s, i, c);
      // contiguity
      if (typeof s.start === "number" && Math.abs(s.start - cursor) > 1e-6) {
        c.error(
          `shots[${i}].start`,
          `shot starts at ${s.start} but the timeline cursor is ${cursor}; shots must tile contiguously`,
        );
      }
      if (typeof s.start === "number" && typeof s.duration === "number") cursor = s.start + s.duration;
    });
    if (typeof film.direction?.duration === "number" && Math.abs(cursor - film.direction.duration) > 1e-6) {
      c.error(
        "direction.duration",
        `shots tile to ${cursor}s but the film duration is ${film.direction.duration}s`,
      );
    }
  }

  // --- seed -----------------------------------------------------------------
  if (typeof film.seed !== "number" || !Number.isFinite(film.seed)) {
    c.error("seed", "a finite numeric seed is required (determinism depends on it)");
  }

  // --- provenance -----------------------------------------------------------
  if (typeof film.provenance !== "object" || film.provenance === null) {
    c.error("provenance", "provenance is required: an unattributed spec cannot be audited");
  } else {
    c.member("provenance.interpreter", film.provenance.interpreter, ["deterministic", "llm", "preset"] as const);
    if (film.provenance.interpreter === "llm" && !film.provenance.model) {
      c.error("provenance.model", "interpreter is 'llm' but no model is named");
    }
    if (!Array.isArray(film.provenance.planners) || film.provenance.planners.length === 0) {
      c.error("provenance.planners", "at least one planner must be attributed");
    }
  }

  return {
    ok: !c.issues.some((i) => i.level === "error"),
    issues: c.issues,
    repairs: c.repairs,
  };
}

function eq<T>(c: Collector, path: string, actual: T, expected: T): void {
  if (actual !== expected) c.error(path, `must be ${String(expected)}, got ${String(actual)}`);
}

function validateInterpretation(c: Collector, interp: Interpretation): void {
  c.nonEmptyString("interpretation.literalMeaning", interp.literalMeaning);
  c.nonEmptyString("interpretation.centralIdea", interp.centralIdea);
  c.member("interpretation.subjectPresence", interp.subjectPresence, ["present", "absent", "both"] as const);

  // --- emotional arc ---
  if (!Array.isArray(interp.emotionalArc) || interp.emotionalArc.length === 0) {
    c.error("interpretation.emotionalArc", "an emotional arc with at least one beat is required");
  } else {
    let lastAt = -Infinity;
    interp.emotionalArc.forEach((b, i) => {
      const bp = `interpretation.emotionalArc[${i}]`;
      c.unit(`${bp}.at`, b.at);
      c.nonEmptyString(`${bp}.feeling`, b.feeling);
      c.nonEmptyString(`${bp}.cause`, b.cause);
      c.unit(`${bp}.intensity`, b.intensity);
      if (typeof b.at === "number") {
        if (b.at < lastAt) c.error(`${bp}.at`, `arc is not sorted (${b.at} after ${lastAt})`);
        lastAt = b.at;
      }
    });
    if (interp.emotionalArc.length < 2) {
      c.warn("interpretation.emotionalArc", "a single-beat arc cannot express change; consider at least 2 beats");
    }
  }

  // --- motifs ---
  if (!Array.isArray(interp.motifs) || interp.motifs.length === 0) {
    c.error("interpretation.motifs", "at least one visual motif is required");
  } else {
    const ids = new Set<string>();
    interp.motifs.forEach((m, i) => {
      const mp = `interpretation.motifs[${i}]`;
      if (ids.has(m.id)) c.error(`${mp}.id`, `duplicate motif id "${m.id}"`);
      ids.add(m.id);
      c.nonEmptyString(`${mp}.meaning`, m.meaning);
      c.nonEmptyString(`${mp}.visualForm`, m.visualForm);
      c.member<SubjectKind>(`${mp}.subjectKind`, m.subjectKind, SUBJECT_KIND_VALUES);
      c.member<SubjectRole>(`${mp}.role`, m.role, SUBJECT_ROLE_VALUES);
      c.unit(`${mp}.introducedAt`, m.introducedAt);
      if (!Array.isArray(m.development) || m.development.length === 0) {
        c.error(`${mp}.development`, "a motif must develop; list at least one change");
      }
    });
  }

  // --- oppositions ---
  if (!Array.isArray(interp.oppositions) || interp.oppositions.length === 0) {
    c.error("interpretation.oppositions", "at least one thematic opposition is required");
  } else {
    interp.oppositions.forEach((o, i) => {
      const op = `interpretation.oppositions[${i}]`;
      c.nonEmptyString(`${op}.a`, o.a);
      c.nonEmptyString(`${op}.b`, o.b);
      c.nonEmptyString(`${op}.staging`, o.staging);
      if (o.resolvedToward !== undefined) {
        c.member(`${op}.resolvedToward`, o.resolvedToward, ["a", "b", "neither"] as const);
      }
      if (o.a === o.b && typeof o.a === "string") {
        c.error(`${op}`, "an opposition with identical sides is not an opposition");
      }
    });
  }

  // --- spatial metaphor ---
  c.nonEmptyString("interpretation.spatialMetaphor", interp.spatialMetaphor);
  c.member<SpaceKind>("interpretation.spaceKind", interp.spaceKind, SPACE_VALUES);

  // --- transformation logic ---
  if (interp.transformationLogic !== undefined) {
    const t = interp.transformationLogic;
    c.nonEmptyString("interpretation.transformationLogic.subject", t.subject);
    c.member<TransformationKind>("interpretation.transformationLogic.kind", t.kind, TRANSFORMATION_KINDS);
    c.nonEmptyString("interpretation.transformationLogic.becomes", t.becomes);
    c.nonEmptyString("interpretation.transformationLogic.because", t.because);
  }
}

/**
 * Apply safe, explicitly-recorded repairs in place. Only fixes that cannot change the
 * film's meaning are applied automatically; anything semantic is left to fail validation
 * so a human (or the fallback planner) sees it.
 */
export function applySafeRepairs(
  film: FilmSpecV2,
  result: V2ValidationResult,
): { applied: number } {
  let applied = 0;

  if (typeof film.seed !== "number" || !Number.isFinite(film.seed)) {
    film.seed = 1;
    result.repairs.push({ path: "seed", problem: "seed was missing or non-finite", action: "defaulted" });
    applied++;
  }

  for (const [i, shot] of (film.shots ?? []).entries()) {
    // Missing transition reasons are cosmetic; a cut with no stated reason is not a
    // directorial failure the way a camera move with no reason is.
    for (const key of ["transitionIn", "transitionOut"] as const) {
      const tr = shot[key];
      if (tr && (typeof tr.reason !== "string" || tr.reason.trim() === "")) {
        tr.reason = tr.kind === "cut" ? "hard cut on the beat" : "overlap to keep time continuous";
        result.repairs.push({
          path: `shots[${i}].${key}.reason`,
          problem: "transition had no stated reason",
          action: "defaulted",
        });
        applied++;
      }
    }
    // A cut with a duration is incoherent; clamp it rather than fail the film.
    for (const key of ["transitionIn", "transitionOut"] as const) {
      const tr = shot[key];
      if (tr && tr.kind === "cut" && tr.duration > 0) {
        tr.duration = 0;
        result.repairs.push({
          path: `shots[${i}].${key}.duration`,
          problem: "a cut had a nonzero duration",
          action: "repaired",
        });
        applied++;
      }
    }
  }

  if (film.provenance && (!Array.isArray(film.provenance.repairs) || film.provenance.repairs.length === 0)) {
    film.provenance.repairs = result.repairs.slice();
  } else if (film.provenance) {
    film.provenance.repairs = [...film.provenance.repairs, ...result.repairs];
  }

  // Re-run the issue list so `ok` reflects the repaired state.
  const fresh = validateFilmSpecV2(film);
  result.issues = fresh.issues;
  result.ok = fresh.ok;

  return { applied };
}

export { isCameraReason, isCompositionKind, isMotionKind, isNarrativeFunction, isOcclusionPolicy, isSpaceKind, isSubjectKind, isSubjectRole, isTransformationKind, isTransitionKind };
export type { CameraReason, CompositionKind, MotionKind, NarrativeFunction, OcclusionPolicy, SpaceKind, SubjectKind, SubjectRole, TransformationKind, TransitionKind };

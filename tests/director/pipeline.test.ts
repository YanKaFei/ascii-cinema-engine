/**
 * Director pipeline tests.
 *
 * The claim these tests exist to defend: the system makes DIFFERENT FILMS for different
 * meanings, and every decision it makes is justified. A test suite that only checked
 * "a FilmSpec is produced" would pass for a system that emits one movie for every input —
 * which is the exact failure Phase 2 exists to prevent.
 */

import { suite, test, ok, eq, deepEq, near } from "../_harness/harness.js";
import { direct, assembleFilmSpecV2 } from "../../src/director/Director.js";
import { authorFilm, compileToV1 } from "../../src/director/authoring.js";
import { validateFilmSpecV2, applySafeRepairs } from "../../src/domain/validate-v2.js";
import { validateFilmSpec } from "../../src/domain/schema.js";
import { renderSequence } from "../../src/render/render.js";
import { matchConcepts, combineFeatures } from "../../src/director/planners/SemanticInterpreter.js";
import { classifyPrompt } from "../../src/director/planners/PromptClassifier.js";
import { chooseSpaceKind } from "../../src/director/planners/SpatialPlanner.js";
import { CAMERA_REASONS, isCameraReason, isNarrativeFunction, SPACE_KINDS } from "../../src/director/grammar/vocabulary.js";
import type { DirectorOptions } from "../../src/director/types.js";

const OPTS: DirectorOptions = { duration: 20, fps: 30, width: 1920, height: 1080, quality: "draft" };

/** The four Phase 2 benchmarks plus the Phase 1 regression prompt. */
const CORPUS: Array<{ label: string; input: string }> = [
  { label: "loneliness", input: "孤独" },
  { label: "desire", input: "欲望" },
  { label: "time", input: "时间" },
  { label: "forgotten-name", input: "我醒来以后，发现所有人都忘记了我的名字。" },
  { label: "disappearing-room", input: "一个男人走进空房间，发现墙上写着自己的名字。他伸手擦掉名字，整个房间也随之消失。" },
];

/** Build the full pipeline result for an input. */
async function build(input: string, opts: DirectorOptions = OPTS) {
  const result = await direct(input, opts);
  const film = authorFilm(assembleFilmSpecV2(result, opts), result.shots);
  return { result, film };
}

suite("director: every benchmark produces a valid, renderable FilmSpec v2", () => {
  for (const { label, input } of CORPUS) {
    test(`${label}: v2 validates and compiles to a valid v1 spec`, async () => {
      const { result, film } = await build(input);
      const v = validateFilmSpecV2(film);
      if (!v.ok) {
        const errs = v.issues.filter((i) => i.level === "error").map((i) => `${i.path}: ${i.message}`);
        throw new Error(`${label}: invalid v2 spec:\n  ${errs.join("\n  ")}`);
      }
      applySafeRepairs(film, v);
      const v1 = compileToV1(film);
      const v1v = validateFilmSpec(v1);
      ok(v1v.ok, `${label}: v1 compiles (${v1v.issues.map((i) => i.message).join("; ")})`);
      ok(result.shots.length >= 3, `${label}: at least 3 shots (got ${result.shots.length})`);
      eq(film.version, "2", `${label}: version is 2`);
    });

    test(`${label}: renders without throwing and produces finite telemetry`, async () => {
      const { film } = await build(input);
      const v1 = compileToV1(film);
      const r = renderSequence(v1, { startFrame: 0, endFrame: Math.min(60, Math.round(v1.durationInSeconds * v1.fps)) });
      ok(r.frameCount > 0, `${label}: renders frames`);
      for (const rec of r.records) {
        ok(Number.isFinite(rec.stats.coveragePreGrade), `${label}: finite coverage`);
        ok(Number.isFinite(rec.stats.cameraDistance), `${label}: finite camera distance`);
        ok(rec.stats.cameraDistance > 0, `${label}: camera is in front of the subject`);
        ok(Number.isFinite(rec.stats.fieldPeak), `${label}: finite field peak`);
      }
    });
  }
});

suite("director: no benchmark-specific conditional exists", () => {
  test("the director source contains no prompt-literal comparison", async () => {
    // A structural check, not a style preference: a `prompt === "欲望"` branch is the exact
    // thing Phase 2 gate L forbids, and it is invisible in behaviour until an unseen prompt
    // arrives.
    const { readFileSync, readdirSync, statSync } = await import("node:fs");
    const path = await import("node:path");
    const roots = ["src/director", "src/domain"];
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const e of readdirSync(dir)) {
        const full = path.join(dir, e);
        if (statSync(full).isDirectory()) walk(full);
        else if (full.endsWith(".ts")) files.push(full);
      }
    };
    for (const r of roots) walk(r);
    ok(files.length > 10, `scanned a real source tree (${files.length} files)`);

    const offenders: string[] = [];
    for (const f of files) {
      // Skip the knowledge base: concepts must be allowed to name their own trigger strings.
      if (f.endsWith("knowledge.ts") || f.endsWith("preset-loneliness-v2.ts")) continue;
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/\b(?:prompt|raw|input|text)\s*===\s*["'`]/g)) {
        offenders.push(`${f}: ${m[0]}`);
      }
      for (const m of src.matchAll(/\.includes\(\s*["'`](?:孤独|欲望|时间|男人|女人)["'`]/g)) {
        offenders.push(`${f}: ${m[0]}`);
      }
    }
    deepEq(offenders, [], "no prompt-literal branching in the director or domain layers");
  });

  test("an unseen prompt still produces a valid film", async () => {
    // If the pipeline were a lookup table this would fail or produce a degenerate film.
    const unseen = "雨落在没有人的车站，列车从不来。";
    const { result, film } = await build(unseen);
    const v = validateFilmSpecV2(film);
    ok(v.ok, `unseen prompt yields a valid spec (${v.issues.filter((i) => i.level === "error").map((i) => i.message).join("; ")})`);
    ok(result.shots.length >= 3, "unseen prompt yields shots");
  });
});

suite("director: camera motivation is derived, not attached", () => {
  for (const { label, input } of CORPUS) {
    test(`${label}: every shot carries a vocabulary camera reason and specific detail`, async () => {
      const { result } = await build(input);
      for (const s of result.shots) {
        ok(isCameraReason(s.camera.reason), `${label} shot ${s.id}: reason "${s.camera.reason}" is in the vocabulary`);
        ok(s.camera.reasonDetail.trim().length > 20, `${label} shot ${s.id}: reasonDetail is specific`);
        ok(s.cameraReason.trim().length > 20, `${label} shot ${s.id}: cameraReason mirrored for the report`);
        ok(CAMERA_REASONS.includes(s.camera.reason), `${label} shot ${s.id}: reason is closed-vocabulary`);
      }
    });

    test(`${label}: every shot has a narrative function and an intention`, async () => {
      const { result } = await build(input);
      for (const s of result.shots) {
        ok(isNarrativeFunction(s.narrativeFunction), `${label} shot ${s.id}: valid narrativeFunction`);
        ok(s.intention.trim().length > 20, `${label} shot ${s.id}: intention is stated`);
        ok(s.visualReason.trim().length > 20, `${label} shot ${s.id}: visualReason is stated`);
      }
    });
  }

  test("the planner cannot see the shot index", async () => {
    // Structural guarantee: `planCamera` takes no index, so "shot 3 always pushes in" is
    // not expressible. This asserts the signature stays that way.
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/director/planners/CameraPlanner.ts", "utf8");
    ok(
      /export function planCamera\(input: CameraPlanInput\)/.test(src),
      "planCamera takes a situation, not a shot index",
    );
    ok(!/shotIndex|shotNumber|\bid\b\s*:\s*string/.test(src), "CameraPlanner has no notion of shot identity");
  });
});

suite("director: determinism", () => {
  test("the same input and options produce a byte-identical spec", async () => {
    for (const { label, input } of CORPUS) {
      const a = await build(input);
      const b = await build(input);
      eq(JSON.stringify(a.film), JSON.stringify(b.film), `${label}: two direct() runs agree byte for byte`);
    }
  });

  test("a different seed produces a different film", async () => {
    const a = await build("孤独", { ...OPTS, seed: 1 });
    const b = await build("孤独", { ...OPTS, seed: 2 });
    ok(JSON.stringify(a.film) !== JSON.stringify(b.film), "seed changes the film");
  });

  test("the seed is stable across runs when not supplied", async () => {
    const a = await build("时间");
    const b = await build("时间");
    eq(a.film.seed, b.film.seed, "derived seed is stable");
  });
});

suite("director: STRUCTURAL DIVERSITY (the Phase 2 claim)", () => {
  /** Collect the structural signature of every corpus film. */
  async function signatures() {
    const out = new Map<string, Awaited<ReturnType<typeof build>>>();
    for (const { label, input } of CORPUS) out.set(label, await build(input));
    return out;
  }

  test("no two films share a space kind except where they genuinely should", async () => {
    const sigs = await signatures();
    const spaces = new Map<string, string[]>();
    for (const [label, { film }] of sigs) {
      const k = film.shots[0]!.space.kind;
      spaces.set(k, [...(spaces.get(k) ?? []), label]);
    }
    // The films may collide only if their boundary logic collides. Both room films are
    // about a boundary existing; that is a real shared structure, not a template.
    for (const [kind, labels] of spaces) {
      ok(SPACE_KINDS.includes(kind as never), `space "${kind}" is in the grammar`);
      if (labels.length > 1) {
        ok(
          labels.every((l) => ["forgotten-name", "disappearing-room"].includes(l)),
          `space "${kind}" is shared only by boundary films (got ${labels.join(", ")})`,
        );
      }
    }
    // At least three distinct spaces across the corpus.
    ok(spaces.size >= 3, `at least 3 distinct spaces (got ${spaces.size}: ${[...spaces.keys()].join(", ")})`);
  });

  test("shot counts differ across films", async () => {
    const sigs = await signatures();
    const counts = new Set([...sigs.values()].map((s) => s.result.shots.length));
    ok(counts.size >= 3, `at least 3 distinct shot counts (got ${[...counts].join(", ")})`);
  });

  test("camera behaviour differs across films", async () => {
    const sigs = await signatures();
    const kinds = new Set<string>();
    for (const [, { result }] of sigs) for (const s of result.shots) kinds.add(s.camera.kind);
    ok(kinds.size >= 3, `at least 3 distinct camera behaviours across the corpus (got ${[...kinds].join(", ")})`);
  });

  test("compositions and negative-space budgets differ across films", async () => {
    const sigs = await signatures();
    const compositions = new Set<string>();
    const budgets: number[] = [];
    for (const [, { result }] of sigs) {
      for (const s of result.shots) {
        compositions.add(s.composition.primary);
        budgets.push(s.composition.negativeSpaceRatio);
      }
    }
    ok(compositions.size >= 4, `at least 4 distinct compositions (got ${[...compositions].join(", ")})`);
    ok(Math.max(...budgets) - Math.min(...budgets) > 0.5, "negative-space budgets span a wide range");
  });

  test("arc shapes and transformations differ across films", async () => {
    const sigs = await signatures();
    const arcs = new Set<string>();
    const transforms = new Set<string>();
    for (const [, { result }] of sigs) {
      arcs.add(result.reading.features.arcShape);
      for (const s of result.shots) if (s.transformation) transforms.add(s.transformation.kind);
    }
    ok(arcs.size >= 3, `at least 3 distinct arc shapes (got ${[...arcs].join(", ")})`);
    ok(transforms.size >= 3, `at least 3 distinct transformation kinds (got ${[...transforms].join(", ")})`);
  });

  test("THE FAILURE MODE: no two films share a full structural signature", async () => {
    const sigs = await signatures();
    const bySignature = new Map<string, string[]>();
    for (const [label, { film, result }] of sigs) {
      const signature = JSON.stringify({
        space: film.shots[0]!.space.kind,
        arc: result.reading.features.arcShape,
        boundary: result.reading.features.boundaryType,
        shots: result.shots.length,
        cameras: [...new Set(result.shots.map((s) => s.camera.kind))].sort(),
        compositions: [...new Set(result.shots.map((s) => s.composition.primary))].sort(),
      });
      bySignature.set(signature, [...(bySignature.get(signature) ?? []), label]);
    }
    const collisions = [...bySignature.values()].filter((v) => v.length > 1);
    deepEq(collisions, [], "no two of the five films share a structural signature");
  });
});

suite("director: the semantic layer is mechanical", () => {
  test("roles, not trigger length, decide which concept wins", () => {
    // `所有人` is a longer match than `忘记`, so a length-only rule let the collective
    // outvote the theme. This is the regression guard for that.
    const matches = matchConcepts("我醒来以后，发现所有人都忘记了我的名字。");
    const forgetting = matches.find((m) => m.concept.id === "forgetting");
    const collective = matches.find((m) => m.concept.id === "the-collective");
    ok(forgetting !== undefined, "forgetting matched");
    ok(collective !== undefined, "the collective matched");
    ok(
      forgetting!.confidence > collective!.confidence,
      `the theme outweighs the longer incidental match (${forgetting!.confidence.toFixed(3)} vs ${collective!.confidence.toFixed(3)})`,
    );
  });

  test("an incidental modifier cannot decide the film's arc", () => {
    // "a person" must not force a rise, and a room must not force a collapse.
    const withPerson = combineFeatures(matchConcepts("a man walks into an empty room"));
    const withoutPerson = combineFeatures(matchConcepts("empty room"));
    eq(withPerson.arcShape, withoutPerson.arcShape, "adding a person does not change the arc shape");
  });

  test("feature combination is order-independent", () => {
    // "孤独 欲望" and "欲望 孤独" must produce the same reading, or behaviour would depend
    // on wording rather than meaning.
    const a = combineFeatures(matchConcepts("孤独 欲望"));
    const b = combineFeatures(matchConcepts("欲望 孤独"));
    deepEq(a, b, "concept order does not affect the feature vector");
  });

  test("no concept votes on a feature it declined to drive", () => {
    const f = combineFeatures(matchConcepts("a room"));
    // A room is a setting: it must not move the arc away from neutral-by-absence.
    ok(Number.isFinite(f.arcShape as unknown as number) === false, "arcShape is categorical");
    eq(f.arcShape, "plateau", "an empty prompt with only a setting leaves the arc neutral");
  });

  test("classification adapts to input length and event structure", () => {
    eq(classifyPrompt("孤独").mode, "word", "a single word classifies as word");
    eq(classifyPrompt("时间").mode, "word", "another single word");
    eq(
      classifyPrompt("我醒来以后，发现所有人都忘记了我的名字。").mode,
      "sentence",
      "one eventful sentence classifies as sentence",
    );
    eq(
      classifyPrompt("一个男人走进空房间，发现墙上写着自己的名字。他伸手擦掉名字，整个房间也随之消失。").mode,
      "script",
      "several sentences with events classify as script",
    );
    eq(
      classifyPrompt("shot 1: 5 seconds, 1920x1080, no dialogue, must be silent").mode,
      "director-brief",
      "explicit production language classifies as a director brief",
    );
  });

  test("the space choice reacts to structure, not to a single score", () => {
    // Two films can have nearly identical enclosure and still need different spaces:
    // "a room disappears" needs walls; "there is no room" must not have any.
    const roomLoss = combineFeatures(matchConcepts("房间消失"));
    const withBoundary = chooseSpaceKind(roomLoss, { conceptIds: ["enclosure"], transformationKind: "vanish" });
    const withoutBoundary = chooseSpaceKind(roomLoss, { conceptIds: ["emptiness"], transformationKind: "vanish" });
    eq(withBoundary, "room", "a named boundary that vanishes is built, so it can be lost");
    ok(withoutBoundary !== "room", `an unnamed boundary is not built (got ${withoutBoundary})`);
  });
});

suite("director: rhythm is a global layer", () => {
  test("curves are well-formed and contain real variation", async () => {
    for (const { label, input } of CORPUS) {
      const { result } = await build(input);
      const { energy, tension, informationDensity, motionDensity } = result.rhythm;
      for (const [name, curve] of [["energy", energy], ["tension", tension], ["informationDensity", informationDensity], ["motionDensity", motionDensity]] as const) {
        ok(curve.length >= 5, `${label}: ${name} has enough keyframes`);
        let last = -1;
        for (const [at, v] of curve) {
          ok(at >= last, `${label}: ${name} is sorted`);
          ok(at >= 0 && at <= 1, `${label}: ${name} position in range`);
          ok(v >= 0 && v <= 1, `${label}: ${name} value in range`);
          last = at;
        }
        const values = curve.map(([, v]) => v);
        ok(Math.max(...values) - Math.min(...values) > 0.05, `${label}: ${name} actually varies`);
      }
    }
  });

  test("shot rhythm values are sampled from the curves, not invented", async () => {
    const { result } = await build("欲望");
    for (const s of result.shots) {
      eq(s.rhythm.source, "curve", `shot ${s.id} rhythm comes from the film curve`);
      ok(s.rhythm.energy >= 0 && s.rhythm.energy <= 1, `shot ${s.id} energy in range`);
      ok(s.rhythm.tension >= 0 && s.rhythm.tension <= 1, `shot ${s.id} tension in range`);
    }
  });

  test("timing responds to tempo: urgent films get more, shorter shots", async () => {
    const urgent = await build("欲望");
    const slow = await build("孤独");
    ok(
      urgent.result.shots.length > slow.result.shots.length,
      `urgent (${urgent.result.shots.length}) has more shots than slow (${slow.result.shots.length})`,
    );
    const avg = (n: number, d: number) => d / n;
    ok(
      avg(urgent.result.shots.length, 20) < avg(slow.result.shots.length, 20),
      "urgent shots are shorter on average",
    );
  });

  test("shot durations sum to the requested duration", async () => {
    for (const { label, input } of CORPUS) {
      const { result } = await build(input);
      const total = result.shots.reduce((s, x) => s + x.duration, 0);
      near(total, 20, 1e-6, `${label}: durations sum to 20s`);
    }
  });
});

suite("director: the four input modes are distinct, and a brief is honoured", () => {
  test("classification covers all four modes", () => {
    eq(classifyPrompt("欲望").mode, "word", "a concept is a word");
    eq(classifyPrompt("我醒来以后，发现所有人都忘记了我的名字。").mode, "sentence", "one proposition is a sentence");
    eq(
      classifyPrompt("一个男人走进空房间，发现墙上写着自己的名字。他伸手擦掉名字，整个房间也随之消失。").mode,
      "script",
      "a sequence of events is a script",
    );
    eq(
      classifyPrompt("shot 1: 5 seconds, 1920x1080, 30fps, no dialogue, must be silent, no camera movement.").mode,
      "director-brief",
      "production language is a brief",
    );
  });

  test("a DIRECTOR-BRIEF's shot count, durations, moves and transitions are honoured", async () => {
    // The mode's entire claim: a brief states constraints and the film obeys them. An earlier
    // implementation reported mode="director-brief" while ignoring everything in it.
    const brief =
      "shot 1: 5 seconds, 1920x1080, 30fps, no dialogue, must be silent, no camera movement. " +
      "shot 2: 6 seconds, slow push-in. shot 3: 9 seconds, dissolve to black.";
    const { result, film } = await build(brief);

    eq(film.input.mode, "director-brief", "mode is director-brief");
    eq(film.shots.length, 3, "the brief's shot count wins over the tempo-derived count");
    deepEq(
      film.shots.map((s) => Number(s.duration.toFixed(4))),
      [5, 6, 9],
      "declared durations are used EXACTLY, not rescaled",
    );
    near(film.direction.duration, 20, 1e-9, "the film is as long as the brief declares");
    eq(film.shots[0]!.camera.move.kind, "static", "'no camera movement' is honoured");
    eq(film.shots[1]!.camera.move.kind, "push-in", "'slow push-in' is honoured");
    eq(film.shots[2]!.transitionIn?.kind, "dissolve", "'dissolve to black' is honoured");
    ok(result.reading.brief !== undefined, "the brief was parsed");
    const constraints = film.interpretation.constraints ?? [];
    ok(
      constraints.includes("no dialogue") && constraints.includes("must be silent"),
      `global constraints are carried into the spec (${constraints.join(", ")})`,
    );
  });

  test("a brief's constrained move still carries a TRUTHFUL reason", async () => {
    // A camera that pushes in while its reason says "the subject carries all the change" is a
    // false justification. Constraining a move must select a reason that implies it.
    const { film } = await build("shot 1: 8 seconds, slow push-in. shot 2: 12 seconds, static.");
    const pushing = film.shots[0]!;
    eq(pushing.camera.move.kind, "push-in", "the move is as required");
    ok(
      ["increase-psychological-pressure", "approach-inaccessible-object", "reveal-density", "immerse-in-field"].includes(
        pushing.camera.reason as string,
      ),
      `the reason implies the move (got "${pushing.camera.reason}")`,
    );
  });

  test("the four modes produce four different structures", async () => {
    const word = await build("欲望");
    const sentence = await build("我醒来以后，发现所有人都忘记了我的名字。");
    const script = await build("一个男人走进空房间，发现墙上写着自己的名字。他伸手擦掉名字，整个房间也随之消失。");
    const brief = await build("shot 1: 4 seconds, slow push-in. shot 2: 16 seconds, static, dissolve.");

    const signature = (f: Awaited<ReturnType<typeof build>>) =>
      JSON.stringify({
        space: f.film.shots[0]!.space.kind,
        shots: f.film.shots.length,
        cameras: [...new Set(f.film.shots.map((s) => s.camera.move.kind))].sort(),
      });
    const sigs = [word, sentence, script, brief].map(signature);
    eq(new Set(sigs).size, 4, `four modes give four signatures (${sigs.length} built)`);
    for (const m of ["word", "sentence", "script", "director-brief"]) {
      ok(
        [word, sentence, script, brief].some((f) => f.film.input.mode === m),
        `mode "${m}" is represented`,
      );
    }
  });
});

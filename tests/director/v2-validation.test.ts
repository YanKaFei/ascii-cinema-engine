/**
 * FilmSpec v2 validation tests.
 *
 * The positive case (the loneliness preset validates) is worth little on its own. What
 * matters is that the validator REJECTS the things that would silently destroy meaning:
 * an unknown grammar term, a camera move with no reason, a shot with no intention, a
 * non-ASCII word subject, a curve that is not a curve.
 *
 * These tests are the LLM boundary's actual safety. Without them, "validate the model's
 * output" is a claim rather than a mechanism.
 */

import { suite, test, ok, eq, deepEq, throws } from "../_harness/harness.js";
import { buildLonelinessPresetV2 } from "../../src/domain/preset-loneliness-v2.js";
import { validateFilmSpecV2, applySafeRepairs } from "../../src/domain/validate-v2.js";
import type { FilmSpecV2 } from "../../src/domain/film-spec-v2.js";

/** A fresh, known-valid spec. Deep-cloned so a test can never leak into another. */
function fresh(): FilmSpecV2 {
  return JSON.parse(JSON.stringify(buildLonelinessPresetV2())) as FilmSpecV2;
}

function errorPaths(film: FilmSpecV2): string[] {
  return validateFilmSpecV2(film)
    .issues.filter((i) => i.level === "error")
    .map((i) => i.path);
}

function expectError(film: FilmSpecV2, pathFragment: string, name: string): void {
  const paths = errorPaths(film);
  const hit = paths.some((p) => p.includes(pathFragment));
  if (hit) {
    eq(true, true, name);
  } else {
    throw new Error(`${name}: expected an error at a path containing "${pathFragment}", got [${paths.join(", ")}]`);
  }
}

suite("v2 validation: the valid baseline", () => {
  test("the loneliness preset validates cleanly", () => {
    const v = validateFilmSpecV2(fresh());
    ok(v.ok, `valid (${v.issues.filter((i) => i.level === "error").map((i) => `${i.path}: ${i.message}`).join("; ")})`);
    eq(v.repairs.length, 0, "no repairs needed for a hand-authored preset");
  });
});

suite("v2 validation: camera motivation is mandatory", () => {
  test("a camera move with no reason is rejected", () => {
    const f = fresh();
    delete (f.shots[2] as unknown as Record<string, unknown>).cameraReason;
    expectError(f, "cameraReason", "missing cameraReason");
  });

  test("a camera reason outside the closed vocabulary is rejected", () => {
    const f = fresh();
    (f.shots[1].camera as unknown as Record<string, unknown>).reason = "because-shot-2-always-pushes-in";
    expectError(f, "camera.reason", "invented camera reason");
  });

  test("a camera reason without detail is rejected", () => {
    const f = fresh();
    f.shots[0].camera.reasonDetail = "   ";
    expectError(f, "camera.reasonDetail", "empty reasonDetail");
  });

  test("a camera move carrying `focal` is rejected (the Phase 1 bug)", () => {
    const f = fresh();
    (f.shots[3].camera.move as unknown as Record<string, unknown>).focal = 1;
    expectError(f, "camera.move.focal", "focal must not be authored");
  });

  test("a non-positive focusDistance is rejected", () => {
    const f = fresh();
    f.shots[3].camera.move.focusDistance = 0;
    expectError(f, "camera.move.focusDistance", "focusDistance must be > 0");
  });
});

suite("v2 validation: the grammar is closed", () => {
  test("an unknown narrativeFunction is rejected", () => {
    const f = fresh();
    (f.shots[0] as unknown as Record<string, unknown>).narrativeFunction = "vibes";
    expectError(f, "narrativeFunction", "invented narrative function");
  });

  test("an unknown space kind is rejected", () => {
    const f = fresh();
    (f.shots[0].space as unknown as Record<string, unknown>).kind = "pressure-cooker";
    expectError(f, "space.kind", "invented space");
  });

  test("a composition term used as a space is rejected (the real 2A bug)", () => {
    const f = fresh();
    (f.shots[3].space as unknown as Record<string, unknown>).kind = "compression";
    expectError(f, "space.kind", "compression is a composition, not a space");
  });

  test("an unknown transformation kind is rejected", () => {
    const f = fresh();
    (f.shots[4].transformation as unknown as Record<string, unknown>).kind = "explode-prettily";
    expectError(f, "transformation.kind", "invented transformation");
  });

  test("an unknown occlusion policy is rejected", () => {
    const f = fresh();
    (f.shots[0].space as unknown as Record<string, unknown>).occlusionPolicy = "painterly";
    expectError(f, "occlusionPolicy", "invented occlusion policy");
  });

  test("an unknown transition kind is rejected", () => {
    const f = fresh();
    (f.shots[2].transitionIn as unknown as Record<string, unknown>).kind = "swipe";
    expectError(f, "transitionIn.kind", "invented transition");
  });

  test("a motion kind outside the vocabulary is rejected", () => {
    const f = fresh();
    (f.shots[2].motion[0] as unknown as Record<string, unknown>).kind = "vibrate-aggressively";
    expectError(f, "motion[0].kind", "invented motion");
  });
});

suite("v2 validation: shots must justify themselves", () => {
  test("a shot with no intention is rejected", () => {
    const f = fresh();
    f.shots[3].intention = "";
    expectError(f, "intention", "empty intention");
  });

  test("a shot with no visualReason is rejected", () => {
    const f = fresh();
    delete (f.shots[2] as unknown as Record<string, unknown>).visualReason;
    expectError(f, "visualReason", "missing visualReason");
  });

  test("a shot with no subjects is rejected", () => {
    const f = fresh();
    f.shots[1].subjects = [];
    expectError(f, "subjects", "no subjects");
  });

  test("a movement referencing a nonexistent subject is rejected", () => {
    const f = fresh();
    f.shots[2].motion[0]!.subjectId = "ghost-subject";
    expectError(f, "motion[0].subjectId", "unknown subject reference");
  });

  test("a transformation referencing a nonexistent subject is rejected", () => {
    const f = fresh();
    f.shots[4].transformation!.subjectId = "not-a-subject";
    expectError(f, "transformation.subjectId", "unknown transformation subject");
  });

  test("an inversion transformation (to <= from) is rejected", () => {
    const f = fresh();
    f.shots[4].transformation!.from = 0.8;
    f.shots[4].transformation!.to = 0.2;
    expectError(f, "transformation", "to must exceed from");
  });

  test("a rhythm override with no reason is rejected", () => {
    const f = fresh();
    f.shots[0].rhythm.source = "override";
    expectError(f, "rhythm.overrideReason", "override needs a reason");
  });
});

suite("v2 validation: the medium's constraint reaches the DSL", () => {
  test("a word subject with non-ASCII text is rejected", () => {
    const f = fresh();
    const subj = f.shots[4].subjects.find((s) => s.visualForm === "glyph")!;
    subj.text = "孤";
    expectError(f, "text", "non-ASCII text subject");
  });

  test("a word subject with no text is rejected", () => {
    const f = fresh();
    const subj = f.shots[4].subjects.find((s) => s.visualForm === "glyph")!;
    delete subj.text;
    expectError(f, "text", "word subject must carry text");
  });

  test("an ASCII word subject is accepted", () => {
    const f = fresh();
    const subj = f.shots[4].subjects.find((s) => s.visualForm === "glyph")!;
    subj.text = "NAME";
    const paths = errorPaths(f);
    ok(!paths.some((p) => p.includes("text")), "ASCII text is accepted");
  });
});

suite("v2 validation: interpretation must be an interpretation", () => {
  test("a missing centralIdea is rejected", () => {
    const f = fresh();
    f.interpretation.centralIdea = "";
    expectError(f, "interpretation.centralIdea", "empty central idea");
  });

  test("no motifs is rejected", () => {
    const f = fresh();
    f.interpretation.motifs = [];
    expectError(f, "interpretation.motifs", "no motifs");
  });

  test("a motif with no development is rejected", () => {
    const f = fresh();
    f.interpretation.motifs[0]!.development = [];
    expectError(f, "development", "a motif must develop");
  });

  test("no oppositions is rejected", () => {
    const f = fresh();
    f.interpretation.oppositions = [];
    expectError(f, "interpretation.oppositions", "no oppositions");
  });

  test("an opposition with identical sides is rejected", () => {
    const f = fresh();
    f.interpretation.oppositions[0]!.a = "sameness";
    f.interpretation.oppositions[0]!.b = "sameness";
    expectError(f, "oppositions", "an opposition must oppose");
  });

  test("an emotional arc that is not sorted is rejected", () => {
    const f = fresh();
    f.interpretation.emotionalArc = [
      { at: 0.8, feeling: "late", cause: "x", intensity: 0.5 },
      { at: 0.2, feeling: "early", cause: "y", intensity: 0.5 },
    ];
    expectError(f, "emotionalArc", "unsorted arc");
  });

  test("an arc intensity outside 0..1 is rejected", () => {
    const f = fresh();
    f.interpretation.emotionalArc[0]!.intensity = 1.4;
    expectError(f, "intensity", "intensity out of range");
  });

  test("an unknown spaceKind on the interpretation is rejected", () => {
    const f = fresh();
    (f.interpretation as unknown as Record<string, unknown>).spaceKind = "nowhere";
    expectError(f, "interpretation.spaceKind", "invented interpretation space");
  });
});

suite("v2 validation: the film as a whole", () => {
  test("a non-2 version is rejected", () => {
    const f = fresh();
    (f as unknown as Record<string, unknown>).version = "3";
    expectError(f, "version", "wrong version");
  });

  test("a missing input.modeRationale is rejected", () => {
    const f = fresh();
    f.input.modeRationale = "";
    expectError(f, "input.modeRationale", "mode decision must be justified");
  });

  test("script mode with no parsed units is rejected", () => {
    const f = fresh();
    f.input.mode = "script";
    delete f.input.scriptUnits;
    expectError(f, "input.scriptUnits", "script mode needs units");
  });

  test("gap in the timeline is rejected", () => {
    const f = fresh();
    f.shots[2]!.start = 8.5;
    expectError(f, "shots[2].start", "timeline gap");
  });

  test("duration that shots do not tile is rejected", () => {
    const f = fresh();
    f.direction.duration = 25;
    expectError(f, "direction.duration", "duration mismatch");
  });

  test("a resolution not divisible by the glyph cell is rejected", () => {
    const f = fresh();
    f.direction.resolution = [1921, 1080];
    expectError(f, "direction.resolution", "width not divisible by 8");
  });

  test("a shot belonging to no act is rejected", () => {
    const f = fresh();
    f.acts[2]!.shotIds = [];
    expectError(f, "acts[2].shotIds", "act must own a shot");
  });

  test("a shot belonging to two acts is rejected", () => {
    const f = fresh();
    f.acts[1]!.shotIds.push("05");
    expectError(f, "acts", "a shot may belong to exactly one act");
  });

  test("an act owning a nonexistent shot is rejected", () => {
    const f = fresh();
    f.acts[0]!.shotIds.push("99");
    expectError(f, "acts[0].shotIds", "act owns a ghost shot");
  });

  test("acts that do not cover the film are rejected", () => {
    const f = fresh();
    f.acts = [f.acts[0]!];
    expectError(f, "acts", "shots must be covered by acts");
  });

  test("a rhythm curve with a value out of range is rejected", () => {
    const f = fresh();
    f.direction.rhythm.energy = [[0, 0.5], [1, 1.5]];
    expectError(f, "rhythm.energy", "curve value out of range");
  });

  test("an unsorted rhythm curve is rejected", () => {
    const f = fresh();
    f.direction.rhythm.tension = [[0.9, 0.5], [0.1, 0.5]];
    expectError(f, "rhythm.tension", "unsorted curve");
  });

  test("an empty rhythm curve is rejected", () => {
    const f = fresh();
    f.direction.rhythm.motionDensity = [];
    expectError(f, "rhythm.motionDensity", "empty curve");
  });

  test("a rhythm plan with no rationale is rejected", () => {
    const f = fresh();
    f.direction.rhythm.rationale = "";
    expectError(f, "rhythm.rationale", "rhythm must be justified");
  });

  test("a missing strategy string is rejected", () => {
    const f = fresh();
    f.direction.cameraStrategy = "";
    expectError(f, "direction.cameraStrategy", "strategies are required");
  });

  test("an unknown interpreter is rejected", () => {
    const f = fresh();
    (f.provenance as unknown as Record<string, unknown>).interpreter = "vibes";
    expectError(f, "provenance.interpreter", "unknown interpreter");
  });

  test("interpreter 'llm' with no model is rejected", () => {
    const f = fresh();
    f.provenance.interpreter = "llm";
    delete f.provenance.model;
    expectError(f, "provenance.model", "an LLM spec must name its model");
  });

  test("a non-finite seed is rejected", () => {
    const f = fresh();
    (f as unknown as Record<string, unknown>).seed = Number.NaN;
    expectError(f, "seed", "seed must be finite");
  });
});

suite("v2 validation: repairs are recorded, not silent", () => {
  test("a missing transition reason is defaulted and recorded", () => {
    const f = fresh();
    f.shots[2]!.transitionIn = { kind: "dissolve", duration: 0, reason: "" };
    const before = validateFilmSpecV2(f);
    const { applied } = applySafeRepairs(f, before);
    ok(applied > 0, "a repair was applied");
    ok(
      before.repairs.some((r) => r.path.includes("transitionIn.reason")),
      "the repair names the path",
    );
    ok(
      f.provenance.repairs.some((r) => r.path.includes("transitionIn.reason")),
      "the repair reaches provenance so the report can show it",
    );
  });

  test("a cut with a nonzero duration is repaired and recorded", () => {
    const f = fresh();
    f.shots[1]!.transitionIn = { kind: "cut", duration: 0.5, reason: "hard on the beat" };
    const before = validateFilmSpecV2(f);
    const { applied } = applySafeRepairs(f, before);
    ok(applied > 0, "a repair was applied");
    eq(f.shots[1]!.transitionIn!.duration, 0, "the duration was clamped");
  });

  test("a non-finite seed is defaulted and recorded", () => {
    const f = fresh();
    (f as unknown as Record<string, unknown>).seed = Number.NaN;
    const before = validateFilmSpecV2(f);
    applySafeRepairs(f, before);
    eq(f.seed, 1, "seed was defaulted");
    ok(before.repairs.some((r) => r.path === "seed"), "the seed repair is recorded");
  });

  test("a semantic failure is NOT auto-repaired", () => {
    const f = fresh();
    delete (f.shots[0] as unknown as Record<string, unknown>).visualReason;
    const before = validateFilmSpecV2(f);
    applySafeRepairs(f, before);
    ok(!before.ok, "a missing visualReason still fails validation after repairs");
    expectError(f, "visualReason", "the semantic failure survives");
  });

  test("applySafeRepairs is idempotent", () => {
    const f = fresh();
    f.shots[3]!.transitionIn = { kind: "cut", duration: 0.25, reason: "" };
    const v1 = validateFilmSpecV2(f);
    applySafeRepairs(f, v1);
    const v2 = validateFilmSpecV2(f);
    const { applied } = applySafeRepairs(f, v2);
    eq(applied, 0, "a second pass applies nothing");
  });
});

suite("v2 validation: malformed input cannot crash the validator", () => {
  test("null and undefined do not throw", () => {
    ok(!validateFilmSpecV2(null as unknown as FilmSpecV2).ok, "null is rejected, not thrown");
    ok(!validateFilmSpecV2(undefined as unknown as FilmSpecV2).ok, "undefined is rejected, not thrown");
  });

  test("a spec with shots as a non-array does not throw", () => {
    const f = fresh();
    (f as unknown as Record<string, unknown>).shots = "not an array";
    ok(!validateFilmSpecV2(f).ok, "a non-array shots field is rejected");
  });

  test("a spec with a null shot does not throw", () => {
    const f = fresh();
    (f.shots as unknown[])[1] = null;
    ok(!validateFilmSpecV2(f).ok, "a null shot is rejected");
  });
});

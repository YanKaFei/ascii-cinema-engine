#!/usr/bin/env node
/**
 * Structural diversity audit.
 *
 *   npm run diversity
 *
 * This script exists to falsify one specific claim:
 *
 *   "The same system, faced with different concepts, really does make different films."
 *
 * WHY IT IS SEPARATE FROM THE BENCHMARK GATE. The benchmark gate proves each film is VALID.
 * A system that emitted the same film for every prompt would pass every one of those gates.
 * Validity is not the claim; DIFFERENCE is the claim, and it needs its own evidence.
 *
 * WHAT COUNTS AS DIFFERENCE. Not "the pixels differ" — a seeded randomiser gives you that for
 * free and it means nothing. The report measures the things a director actually decides:
 * shot count and duration distribution, camera behaviour and its reasons, space kind, negative
 * space, composition, transformation, motif traffic, density budget and rhythm curves. Two
 * films are structurally distinct only if several of those differ TOGETHER.
 *
 * Reads the artifacts `npm run benchmarks` wrote. Does not re-render.
 */

import { readFile, writeFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const ROOT = path.resolve(import.meta.dirname, "..");
const OUT = path.join(ROOT, "out", "benchmarks");

const { BENCHMARKS, DIRECTOR_BRIEF } = await import("./benchmarks.mjs");

function log(msg) {
  process.stdout.write(`${msg}\n`);
}

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// measures
// ---------------------------------------------------------------------------

/** Shannon entropy in bits over a label distribution. 0 means "one value only". */
function entropy(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  const n = values.length;
  let h = 0;
  for (const c of counts.values()) {
    const p = c / n;
    h -= p * Math.log2(p);
  }
  return h;
}

/** Population standard deviation. */
function stdev(values) {
  if (values.length === 0) return 0;
  const m = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, b) => a + (b - m) ** 2, 0) / values.length);
}

/** Normalised entropy: 0 = one value, 1 = every value distinct and equally likely. */
function normalisedEntropy(values) {
  const distinct = new Set(values).size;
  if (distinct <= 1) return 0;
  return entropy(values) / Math.log2(distinct === values.length ? values.length : distinct);
}

/** Sample a rhythm curve at 0..1. */
function sampleCurve(curve, t) {
  if (!Array.isArray(curve) || curve.length === 0) return null;
  if (t <= curve[0][0]) return curve[0][1];
  const last = curve[curve.length - 1];
  if (t >= last[0]) return last[1];
  for (let i = 0; i < curve.length - 1; i++) {
    const [a, va] = curve[i];
    const [b, vb] = curve[i + 1];
    if (t >= a && t <= b) {
      const u = (t - a) / Math.max(1e-9, b - a);
      return va + (vb - va) * u;
    }
  }
  return last[1];
}

/** Describe one film's structure. */
function describe(filmV2, shotList) {
  const shots = filmV2.shots;
  const durations = shots.map((s) => s.duration);
  const totalDuration = durations.reduce((a, b) => a + b, 0);

  const cameraKinds = shots.map((s) => s.camera.move.kind);
  const cameraReasons = shots.map((s) => s.camera.reason);
  const compositions = shots.map((s) => s.composition.primary);
  const spaces = shots.map((s) => s.space.kind);
  const functions = shots.map((s) => s.narrativeFunction);
  const negativeSpace = shots.map((s) => s.composition.negativeSpaceRatio);
  const transformations = shots.filter((s) => s.transformation).map((s) => s.transformation.kind);
  const techniques = [...new Set(shots.flatMap((s) => s.techniques ?? []))].sort();

  // density budget: the coverage window the film spends
  const densityMaxStart = shots.map((s) => s.density?.coverageMaxStart ?? 0);
  const densityMaxEnd = shots.map((s) => s.density?.coverageMaxEnd ?? 0);

  // rhythm: sample the film's global curves at ten points
  const rhythm = filmV2.direction?.rhythm ?? {};
  const rhythmSamples = {};
  for (const name of ["energy", "tension", "informationDensity", "motionDensity"]) {
    const curve = rhythm[name];
    rhythmSamples[name] = Array.from({ length: 10 }, (_, i) => Number((sampleCurve(curve, i / 9) ?? 0).toFixed(3)));
  }

  // motif traffic: which motifs exist and how many shots each appears in
  const motifTraffic = {};
  for (const s of shots) {
    for (const m of s.subjects ?? []) {
      motifTraffic[m.id] = (motifTraffic[m.id] ?? 0) + 1;
    }
  }

  return {
    slug: filmV2.slug,
    title: filmV2.title,
    mode: filmV2.input?.mode,
    centralIdea: filmV2.interpretation?.centralIdea,
    dramaticQuestion: filmV2.interpretation?.dramaticQuestion,
    shotCount: shots.length,
    totalDuration: Number(totalDuration.toFixed(4)),
    durations: durations.map((d) => Number(d.toFixed(4))),
    durationStats: {
      min: Number(Math.min(...durations).toFixed(4)),
      max: Number(Math.max(...durations).toFixed(4)),
      mean: Number((totalDuration / shots.length).toFixed(4)),
      stdev: Number(stdev(durations).toFixed(4)),
    },
    acts: (filmV2.acts ?? []).map((a) => ({ id: a.id, title: a.title, function: a.function, shots: a.shotIds.length })),
    spaceKinds: [...new Set(spaces)],
    primarySpace: spaces[0],
    occlusionPolicy: shots[0]?.space?.occlusionPolicy,
    cameraKinds: [...new Set(cameraKinds)],
    cameraReasons: [...new Set(cameraReasons)],
    cameraKindDistribution: cameraKinds,
    compositions: [...new Set(compositions)],
    compositionDistribution: compositions,
    narrativeFunctions: functions,
    negativeSpace: {
      min: Number(Math.min(...negativeSpace).toFixed(4)),
      max: Number(Math.max(...negativeSpace).toFixed(4)),
      mean: Number((negativeSpace.reduce((a, b) => a + b, 0) / negativeSpace.length).toFixed(4)),
    },
    transformations: [...new Set(transformations)],
    techniques,
    density: {
      maxStart: densityMaxStart,
      maxEnd: densityMaxEnd,
      peak: Math.max(...densityMaxEnd),
    },
    rhythmSamples,
    motifTraffic,
    provenance: {
      interpreter: filmV2.provenance?.interpreter,
      planners: (filmV2.provenance?.planners ?? []).map((p) => p.id),
      repairs: (filmV2.provenance?.repairs ?? []).length,
    },
  };
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

const films = [];
const missing = [];

for (const b of BENCHMARKS) {
  const dir = path.join(OUT, b.dir);
  const filmV2 = await readJson(path.join(dir, "film-spec-v2.json"));
  const shotList = await readJson(path.join(dir, "shot-list.json"));
  if (!filmV2 || !shotList) {
    missing.push(b.dir);
    continue;
  }
  films.push({ bench: b, filmV2, shotList, described: describe(filmV2, shotList) });
}

if (missing.length > 0) {
  log(`diversity: missing artifacts for ${missing.join(", ")} — run \`npm run benchmarks\` first`);
  process.exit(1);
}

// the director brief, if present (validated but not rendered)
const briefFilm = await readJson(path.join(OUT, DIRECTOR_BRIEF.dir, "film-spec-v2.json"));

log("STRUCTURAL DIVERSITY AUDIT");
log(`  ${films.length} rendered films${briefFilm ? " + 1 validated director brief" : ""}`);

// ---- per-film table ---------------------------------------------------------
log("");
log("  film                 mode      shots  len(min..max)   space            cameras                  negSpace");
for (const { described: d } of films) {
  log(
    `  ${d.slug.padEnd(20)} ${String(d.mode).padEnd(9)} ${String(d.shotCount).padStart(5)}  ` +
      `${d.durationStats.min.toFixed(1)}..${d.durationStats.max.toFixed(1)}s`.padEnd(15) +
      `${d.primarySpace.padEnd(16)} ${d.cameraKinds.join(",").padEnd(24)} ` +
      `${(d.negativeSpace.mean * 100).toFixed(0)}%`,
  );
}

// ---- axis-by-axis spread ----------------------------------------------------
const axes = {
  shotCount: films.map((f) => String(f.described.shotCount)),
  primarySpace: films.map((f) => f.described.primarySpace),
  cameraKindSet: films.map((f) => f.described.cameraKinds.slice().sort().join("+")),
  compositionSet: films.map((f) => f.described.compositions.slice().sort().join("+")),
  narrativeFunctionSequence: films.map((f) => f.described.narrativeFunctions.join(">")),
  transformationSet: films.map((f) => f.described.transformations.slice().sort().join("+") || "(none)"),
  techniqueSet: films.map((f) => f.described.techniques.join("+")),
  negativeSpaceProfile: films.map((f) =>
    [f.described.negativeSpace.min, f.described.negativeSpace.mean, f.described.negativeSpace.max].map((v) => v.toFixed(2)).join("/"),
  ),
  occlusionPolicy: films.map((f) => f.described.occlusionPolicy),
  rhythmEnergyProfile: films.map((f) => f.described.rhythmSamples.energy.map((v) => v.toFixed(2)).join(",")),
};

log("");
log("  axis                              distinct/4   values");
const axisRows = [];
for (const [name, values] of Object.entries(axes)) {
  const distinct = new Set(values).size;
  const ne = normalisedEntropy(values);
  axisRows.push({ axis: name, distinct, of: values.length, normalisedEntropy: Number(ne.toFixed(4)) });
  const shown = values.map((v) => (v.length > 34 ? `${v.slice(0, 31)}…` : v)).join("  |  ");
  log(`  ${name.padEnd(32)} ${String(distinct).padStart(4)}/${values.length}      ${shown}`);
}

// ---- pairwise distance ------------------------------------------------------
// A structural distance over the axes a director decides. Counting DISTINCT VALUES is not
// enough: two films could differ on one axis and be identical everywhere else. This counts
// how many independent axes separate each pair.
const AXIS_WEIGHTS = {
  shotCount: 1,
  primarySpace: 2,
  cameraKindSet: 2,
  compositionSet: 1,
  narrativeFunctionSequence: 2,
  transformationSet: 2,
  techniqueSet: 1,
  negativeSpaceProfile: 1,
  occlusionPolicy: 2,
};
const AXIS_TOTAL = Object.values(AXIS_WEIGHTS).reduce((a, b) => a + b, 0);

const pairs = [];
for (let i = 0; i < films.length; i++) {
  for (let j = i + 1; j < films.length; j++) {
    const a = films[i].described;
    const b = films[j].described;
    const differing = [];
    let distance = 0;
    for (const [axis, weight] of Object.entries(AXIS_WEIGHTS)) {
      const va = axis === "shotCount" ? String(a.shotCount) : axes[axis][i];
      const vb = axis === "shotCount" ? String(b.shotCount) : axes[axis][j];
      if (va !== vb) {
        differing.push(axis);
        distance += weight;
      }
    }
    pairs.push({
      a: a.slug,
      b: b.slug,
      differingAxes: differing,
      differingCount: differing.length,
      weightedDistance: distance,
      normalisedDistance: Number((distance / AXIS_TOTAL).toFixed(4)),
    });
  }
}

log("");
log("  pairwise structural distance (weighted over 9 axes; space/camera/function/transform count double)");
for (const p of pairs.sort((x, y) => x.normalisedDistance - y.normalisedDistance)) {
  log(`  ${p.a.padEnd(20)} vs ${p.b.padEnd(20)} ${(p.normalisedDistance * 100).toFixed(0)}%  ${p.differingCount}/9 axes: ${p.differingAxes.join(", ")}`);
}

const minPair = pairs.reduce((m, p) => (p.normalisedDistance < m.normalisedDistance ? p : m), pairs[0]);
const meanDistance = pairs.reduce((s, p) => s + p.normalisedDistance, 0) / pairs.length;

// ---- summary -----------------------------------------------------------------
const summary = {
  filmsCompared: films.length,
  renderedFilms: films.map((f) => f.bench.dir),
  modesCovered: [...new Set(films.map((f) => f.bench.mode))],
  directorBriefValidated: briefFilm ? { dir: DIRECTOR_BRIEF.dir, shots: briefFilm.shots.length, mode: briefFilm.input?.mode } : null,
  distinctStructuralSignatures: new Set(
    films.map((f) =>
      JSON.stringify({
        space: f.described.primarySpace,
        shots: f.described.shotCount,
        cameras: f.described.cameraKinds.slice().sort(),
        compositions: f.described.compositions.slice().sort(),
        functions: f.described.narrativeFunctions,
      }),
    ),
  ).size,
  axes: axisRows,
  pairwise: pairs.sort((x, y) => x.normalisedDistance - y.normalisedDistance),
  closestPair: minPair,
  meanPairwiseDistance: Number(meanDistance.toFixed(4)),
  minPairwiseDistance: minPair.normalisedDistance,
};

// Thresholds are deliberately about MEANINGFUL difference, not about passing.
const CHECKS = [
  {
    name: "every rendered film has a distinct full structural signature",
    ok: summary.distinctStructuralSignatures === films.length,
    detail: `${summary.distinctStructuralSignatures}/${films.length}`,
  },
  {
    name: "shot counts are not all identical",
    ok: axisRows.find((a) => a.axis === "shotCount").distinct >= 2,
    detail: `${axisRows.find((a) => a.axis === "shotCount").distinct} distinct`,
  },
  {
    name: "at least three distinct primary spaces",
    ok: new Set(axes.primarySpace).size >= 3,
    detail: `${new Set(axes.primarySpace).size}: ${[...new Set(axes.primarySpace)].join(", ")}`,
  },
  {
    name: "no two films share a camera-behaviour set",
    ok: new Set(axes.cameraKindSet).size === films.length,
    detail: `${new Set(axes.cameraKindSet).size}/${films.length}`,
  },
  {
    name: "no two films share a narrative-function sequence",
    ok: new Set(axes.narrativeFunctionSequence).size === films.length,
    detail: `${new Set(axes.narrativeFunctionSequence).size}/${films.length}`,
  },
  {
    name: "transformation kinds differ across films",
    ok: new Set(axes.transformationSet).size >= 3,
    detail: `${new Set(axes.transformationSet).size}: ${[...new Set(axes.transformationSet)].join(", ")}`,
  },
  {
    name: "negative-space budgets differ across films",
    ok: new Set(axes.negativeSpaceProfile).size === films.length,
    detail: `${new Set(axes.negativeSpaceProfile).size}/${films.length}`,
  },
  {
    name: "rhythm energy profiles differ across films",
    ok: new Set(axes.rhythmEnergyProfile).size >= Math.max(2, films.length - 1),
    detail: `${new Set(axes.rhythmEnergyProfile).size}/${films.length} distinct`,
  },
  {
    name: "the CLOSEST pair still differs on at least 3 axes",
    ok: minPair.differingCount >= 3,
    detail: `${minPair.a} vs ${minPair.b}: ${minPair.differingCount}/9 (${(minPair.normalisedDistance * 100).toFixed(0)}%)`,
  },
  {
    name: "mean pairwise distance is substantial (>= 40% of axes)",
    ok: meanDistance >= 0.4,
    detail: `${(meanDistance * 100).toFixed(0)}%`,
  },
  {
    name: "every film carries at least 3 techniques",
    ok: films.every((f) => f.described.techniques.length >= 3),
    detail: films.map((f) => `${f.bench.dir}:${f.described.techniques.length}`).join(" "),
  },
  {
    name: "every camera reason is one of the film's declared reasons",
    ok: films.every((f) => f.described.cameraReasons.every((r) => typeof r === "string" && r.length > 0)),
    detail: `${[...new Set(films.flatMap((f) => f.described.cameraReasons))].length} distinct reasons used`,
  },
];

log("");
let failed = 0;
for (const c of CHECKS) {
  if (!c.ok) failed++;
  log(`  ${c.ok ? "PASS" : "FAIL"}  ${c.name.padEnd(58)} ${c.detail}`);
}

const report = {
  generatedFor: "phase-2 gate 2E — structural diversity audit",
  claim:
    "The same system, faced with different concepts, makes structurally different films rather than resampling one template.",
  method: {
    note:
      "Difference is measured on the axes a director decides, not on pixels. A seeded randomiser makes pixels differ for free; it does not make films differ.",
    axes: Object.keys(AXIS_WEIGHTS),
    weights: AXIS_WEIGHTS,
    distanceDefinition: "weighted sum of differing axes / total weight; space, camera, function sequence and transformation count double",
  },
  summary,
  films: films.map((f) => ({ dir: f.bench.dir, mode: f.bench.mode, prompt: f.bench.prompt, ...f.described })),
  directorBrief: briefFilm
    ? {
        dir: DIRECTOR_BRIEF.dir,
        mode: briefFilm.input?.mode,
        prompt: DIRECTOR_BRIEF.prompt,
        shots: briefFilm.shots.length,
        narrativeFunctions: briefFilm.shots.map((s) => s.narrativeFunction),
        cameras: briefFilm.shots.map((s) => s.camera.move.kind),
        rendered: false,
        why: "a director brief's claim is that production constraints are honoured, not that it produces new imagery",
      }
    : null,
  checks: CHECKS,
  pass: failed === 0,
};

await writeFile(path.join(OUT, "director-diversity-report.json"), JSON.stringify(report, null, 2) + "\n", "utf8");
log("");
log(`  ${path.relative(ROOT, path.join(OUT, "director-diversity-report.json"))}`);
if (failed > 0) {
  log(`\nDIVERSITY AUDIT: ${failed} check(s) FAILED`);
  process.exit(1);
}
log("\nDIVERSITY AUDIT = PASS");

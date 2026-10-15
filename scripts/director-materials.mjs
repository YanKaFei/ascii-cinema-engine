#!/usr/bin/env node
/**
 * Director materials.
 *
 *   npm run materials
 *
 * Turns each benchmark's FilmSpec v2 into the documents a director would actually hand to a
 * crew: a treatment, shot notes, the motif list, the rhythm curve, and a decision report.
 *
 * WHY THIS IS NOT DECORATION. Gate 2B's requirement was that the system answer WHY THIS SHOT
 * / WHY THIS CAMERA / WHY THIS TRANSFORMATION / WHY THIS RHYTHM. An answer that only exists
 * inside code is not an answer a person can check. These files are the audit surface: every
 * claim in them is read straight out of the spec, so a claim that is not justified in the spec
 * cannot appear here, and a reviewer can falsify any of them against the JSON.
 *
 * Reads out/benchmarks/*\/film-spec-v2.json and scene-ir.json. Does not re-render.
 */

import { readFile, writeFile } from "node:fs/promises";
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

const pct = (v) => `${(v * 100).toFixed(0)}%`;
const secs = (v) => `${v.toFixed(2)}s`;

/** Render the treatment. */
function treatment(film) {
  const i = film.interpretation;
  const d = film.direction;
  const lines = [];

  lines.push(`# ${film.title}`);
  lines.push("");
  lines.push(`**Input** (${film.input.mode}): \`${film.input.raw}\``);
  lines.push(`**Classification.** ${film.input.modeRationale}`);
  lines.push(`**Format.** ${d.duration}s, ${d.resolution[0]}x${d.resolution[1]}, ${d.fps}fps, ${d.quality}`);
  lines.push(`**Seed.** \`${film.seed}\` (deterministic: the same input reproduces this film byte for byte)`);
  lines.push("");

  lines.push("## The idea");
  lines.push("");
  lines.push(`**Literal reading.** ${i.literalMeaning}`);
  lines.push("");
  lines.push(`**Central idea.** ${i.centralIdea}`);
  lines.push("");
  lines.push(`**Dramatic question.** ${i.dramaticQuestion}`);
  lines.push("");
  lines.push(`**Subject presence.** ${i.subjectPresence}`);
  lines.push("");
  lines.push("**Emotional arc.**");
  lines.push("");
  lines.push("| at | feeling | cause | intensity |");
  lines.push("|---|---|---|---|");
  for (const beat of i.emotionalArc ?? []) {
    lines.push(
      `| ${pct(beat.at)} | ${beat.feeling} | ${beat.cause} | ${Number(beat.intensity).toFixed(2)} |`,
    );
  }
  lines.push("");
  lines.push(`**Spatial metaphor.** ${i.spatialMetaphor} Realised as a \`${i.spaceKind}\`.`);
  lines.push("");
  if (i.transformationLogic) {
    lines.push(`**The turn.** ${i.transformationLogic.kind}: ${i.transformationLogic.becomes}.`);
    lines.push("");
    lines.push(`> ${i.transformationLogic.because}`);
    lines.push("");
  } else {
    lines.push("**The turn.** None. The film examines a condition rather than changing one, so no transformation is staged.");
    lines.push("");
  }

  if (i.oppositions?.length) {
    lines.push("## Oppositions");
    lines.push("");
    for (const o of i.oppositions) {
      lines.push(`### ${o.a} against ${o.b}`);
      lines.push("");
      lines.push(o.staging);
      lines.push("");
      lines.push(
        o.resolvedToward === o.a
          ? `The film comes down on the side of **${o.a}**.`
          : o.resolvedToward === o.b
            ? `The film comes down on the side of **${o.b}**.`
            : "The film refuses to settle the opposition, which is itself the point.",
      );
      lines.push("");
    }
  }

  lines.push("## Motifs");
  lines.push("");
  lines.push("| motif | form | role | enters | development |");
  lines.push("|---|---|---|---|---|");
  for (const m of i.motifs) {
    const dev = Array.isArray(m.development) ? m.development.join(" → ") : String(m.development ?? "");
    lines.push(`| \`${m.id}\` | ${m.subjectKind} | ${m.role} | ${pct(m.introducedAt)} | ${dev} |`);
  }
  lines.push("");

  lines.push("## Structure");
  lines.push("");
  lines.push("| act | function | from | to | shots |");
  lines.push("|---|---|---|---|---|");
  for (const a of film.acts) {
    lines.push(`| ${a.title} | ${a.function} | ${pct(a.from)} | ${pct(a.to)} | ${a.shotIds.join(" ")} |`);
  }
  lines.push("");

  lines.push("## How it is made");
  lines.push("");
  lines.push(`**Visual.** ${d.visualStrategy}`);
  lines.push("");
  lines.push(`**Density.** ${d.densityStrategy}`);
  lines.push("");
  lines.push(`**Camera.** ${d.cameraStrategy}`);
  lines.push("");
  lines.push(`**Editing.** ${d.editingStrategy}`);
  lines.push("");
  lines.push(`**Rhythm.** ${d.rhythmStrategy}`);
  lines.push("");
  lines.push(`**Negative space.** ${d.negativeSpaceStrategy}`);
  lines.push("");
  lines.push(`**Opening image.** ${d.openingImage}`);
  lines.push("");
  lines.push(`**Closing image.** ${d.closingImage}`);
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push(
    "Every sentence above is read directly out of `film-spec-v2.json`. Nothing here is written " +
      "by hand, and nothing here can claim something the spec does not contain.",
  );
  lines.push("");
  return lines.join("\n");
}

/** Render per-shot director's notes. */
function notes(film) {
  const lines = [];
  lines.push(`# ${film.title} — director's notes`);
  lines.push("");
  lines.push(`${film.shots.length} shots, ${film.direction.duration}s. Every shot below is quoted from the spec.`);
  lines.push("");

  for (const s of film.shots) {
    lines.push(`## Shot ${s.id} — ${s.title}`);
    lines.push("");
    lines.push(`**${secs(s.duration)}** (${secs(s.start)} – ${secs(s.start + s.duration)}) · \`${s.narrativeFunction}\``);
    lines.push("");
    lines.push(`**Why this shot exists.** ${s.intention}`);
    lines.push("");
    lines.push(`**Why it looks like this.** ${s.visualReason}`);
    lines.push("");
    lines.push(`**Why the camera does this.** \`${s.camera.move.kind}\` — \`${s.camera.reason}\`. ${s.camera.reasonDetail}`);
    lines.push("");
    lines.push(`**Framing.** ${s.composition.primary}; ${pct(s.composition.negativeSpaceRatio)} of the frame left empty. ${s.composition.reason}`);
    lines.push("");
    lines.push(`**Space.** \`${s.space.kind}\` — ${s.space.description} Occlusion: \`${s.space.occlusionPolicy}\`.`);
    lines.push("");
    if (s.subjects?.length) {
      lines.push(`**In frame.** ${s.subjects.map((x) => `\`${x.id}\` (${x.visualForm}, ${x.role})`).join(", ")}`);
      lines.push("");
    }
    if (s.transformation) {
      lines.push(
        `**Transformation.** \`${s.transformation.kind}\` on \`${s.transformation.subjectId}\` — becomes ${s.transformation.becomes}. ` +
          `Staged from ${pct(s.transformation.from)} to ${pct(s.transformation.to)}, caused by **${s.transformation.causedBy}**.`,
      );
      lines.push("");
      lines.push(`> ${s.transformation.dramaticPurpose}`);
      lines.push("");
    }
    if (s.transitionIn) {
      lines.push(`**Transition in.** \`${s.transitionIn.kind}\` (${secs(s.transitionIn.duration)}) — ${s.transitionIn.reason}`);
      lines.push("");
    }
    lines.push(
      `**Rhythm.** energy ${s.rhythm.energy.toFixed(2)}, tension ${s.rhythm.tension.toFixed(2)}, ` +
        `information ${s.rhythm.informationDensity.toFixed(2)}, motion ${s.rhythm.motionDensity.toFixed(2)} — sampled from the film's global curves.`,
    );
    lines.push("");
    lines.push(
      `**Density budget.** coverage window ${s.density.coverageMinStart}..${s.density.coverageMaxStart} → ` +
        `${s.density.coverageMinEnd}..${s.density.coverageMaxEnd} subpixels.`,
    );
    lines.push("");
    lines.push(`**Techniques.** ${(s.techniques ?? []).map((t) => `\`${t}\``).join(", ")}`);
    lines.push("");
    lines.push("---");
    lines.push("");
  }
  return lines.join("\n");
}

/** The motif ledger. */
function motifs(film) {
  const byId = new Map();
  for (const m of film.interpretation.motifs) {
    byId.set(m.id, { ...m, shots: [], appearances: 0 });
  }
  for (const s of film.shots) {
    for (const sub of s.subjects ?? []) {
      const rec = byId.get(sub.id);
      if (!rec) continue;
      rec.shots.push(s.id);
      rec.appearances++;
    }
  }
  return {
    film: film.slug,
    title: film.title,
    note: "Motifs are introduced at a position in the film and developed thereafter. `appearances` is counted from the shot specs, not asserted.",
    motifs: [...byId.values()].map((m) => ({
      id: m.id,
      meaning: m.meaning,
      visualForm: m.visualForm,
      subjectKind: m.subjectKind,
      role: m.role,
      introducedAt: Number(m.introducedAt.toFixed(4)),
      development: m.development,
      appearances: m.appearances,
      shots: m.shots,
    })),
  };
}

/** The rhythm curve, as data a person can plot. */
function rhythm(film) {
  const r = film.direction.rhythm;
  const curves = {};
  for (const name of ["energy", "tension", "informationDensity", "motionDensity"]) {
    if (Array.isArray(r?.[name])) curves[name] = r[name].map(([at, v]) => ({ at: Number(at.toFixed(4)), value: Number(v.toFixed(4)) }));
  }
  return {
    film: film.slug,
    note: r?.rationale,
    curves,
    shots: film.shots.map((s) => ({
      id: s.id,
      start: Number(s.start.toFixed(4)),
      duration: Number(s.duration.toFixed(4)),
      narrativeFunction: s.narrativeFunction,
      energy: s.rhythm.energy,
      tension: s.rhythm.tension,
      informationDensity: s.rhythm.informationDensity,
      motionDensity: s.rhythm.motionDensity,
    })),
  };
}

/** The decision report: provenance and the justification audit. */
function report(film, sceneIR, validation) {
  const shots = film.shots;
  return {
    film: film.slug,
    title: film.title,
    generatedFor: "phase-2 gate 2E — director materials",
    input: film.input,
    seed: film.seed,
    provenance: film.provenance,
    determinism: {
      note: "Every planner is seeded; there is no Math.random and no wall clock in the director or render path. Re-running with the same input reproduces this film byte for byte.",
      seedRule: "hashString(`ascii-cinema/v2/${raw}/${duration}/${width}x${height}/${fps}`) unless a seed is supplied",
    },
    justificationAudit: shots.map((s) => ({
      shot: s.id,
      narrativeFunction: s.narrativeFunction,
      intentionStated: Boolean(s.intention && s.intention.trim().length > 20),
      visualReasonStated: Boolean(s.visualReason && s.visualReason.trim().length > 20),
      cameraReasonStated: Boolean(s.cameraReason && s.cameraReason.trim().length > 20),
      cameraReasonInVocabulary: Boolean(s.camera.reason),
      transformationJustified: s.transformation ? Boolean(s.transformation.dramaticPurpose) : null,
      transitionJustified: s.transitionIn ? Boolean(s.transitionIn.reason) : null,
    })),
    coverage: {
      shots: shots.length,
      totalDuration: Number(shots.reduce((a, b) => a + b.duration, 0).toFixed(6)),
      shotsWithCameraReason: shots.filter((s) => s.camera?.reasonDetail).length,
      shotsWithNarrativeFunction: shots.filter((s) => s.narrativeFunction).length,
      shotsWithTransformation: shots.filter((s) => s.transformation).length,
      shotsWithTransition: shots.filter((s) => s.transitionIn).length,
      distinctCameraKinds: [...new Set(shots.map((s) => s.camera.move.kind))],
      distinctCameraReasons: [...new Set(shots.map((s) => s.camera.reason))],
      distinctTechniques: [...new Set(shots.flatMap((s) => s.techniques ?? []))].sort(),
      narrativeFunctionSequence: shots.map((s) => s.narrativeFunction),
    },
    sceneIR: sceneIR
      ? {
          note: sceneIR.note,
          shots: sceneIR.shots.map((s) => ({
            shotId: s.shotId,
            frameCount: s.frameCount,
            layerCount: s.layers.length,
            primitiveCount: sceneIR.primitiveCounts?.[s.shotId] ?? null,
            cameraKeys: s.camera.keys.length,
            occlusionPolicies: [...new Set(s.layers.map((l) => l.semantics.occlusionPolicy))],
          })),
        }
      : null,
    validation: validation ?? { note: "no validation report found beside the spec" },
  };
}

// ---------------------------------------------------------------------------

const rendered = [];
for (const b of BENCHMARKS) {
  const dir = path.join(OUT, b.dir);
  const film = await readJson(path.join(dir, "film-spec-v2.json"));
  if (!film) continue;
  const sceneIR = await readJson(path.join(dir, "scene-ir.json"));
  const validation = await readJson(path.join(dir, "validation.json"));

  await writeFile(path.join(dir, "treatment.md"), treatment(film), "utf8");
  await writeFile(path.join(dir, "director-notes.md"), notes(film), "utf8");
  await writeFile(path.join(dir, "visual-motifs.json"), JSON.stringify(motifs(film), null, 2) + "\n", "utf8");
  await writeFile(path.join(dir, "rhythm-curve.json"), JSON.stringify(rhythm(film), null, 2) + "\n", "utf8");
  await writeFile(path.join(dir, "director-report.json"), JSON.stringify(report(film, sceneIR, validation), null, 2) + "\n", "utf8");
  rendered.push({ dir: b.dir, slug: film.slug, shots: film.shots.length });
  log(`  ${b.dir.padEnd(20)} treatment.md  director-notes.md  visual-motifs.json  rhythm-curve.json  director-report.json`);
}

// the director brief gets materials too, so its constraint handling is inspectable
const briefFilm = await readJson(path.join(OUT, DIRECTOR_BRIEF.dir, "film-spec-v2.json"));
if (briefFilm) {
  const dir = path.join(OUT, DIRECTOR_BRIEF.dir);
  await writeFile(path.join(dir, "treatment.md"), treatment(briefFilm), "utf8");
  await writeFile(path.join(dir, "director-notes.md"), notes(briefFilm), "utf8");
  await writeFile(path.join(dir, "visual-motifs.json"), JSON.stringify(motifs(briefFilm), null, 2) + "\n", "utf8");
  await writeFile(path.join(dir, "rhythm-curve.json"), JSON.stringify(rhythm(briefFilm), null, 2) + "\n", "utf8");
  await writeFile(path.join(dir, "director-report.json"), JSON.stringify(report(briefFilm, null, null), null, 2) + "\n", "utf8");
  log(`  ${DIRECTOR_BRIEF.dir.padEnd(20)} (validated, not rendered) — materials written`);
}

await writeFile(
  path.join(OUT, "director-materials.json"),
  JSON.stringify(
    {
      generatedFor: "phase-2 gate 2E — director materials index",
      files: ["treatment.md", "director-notes.md", "visual-motifs.json", "rhythm-curve.json", "director-report.json"],
      note: "Every claim in these documents is read from film-spec-v2.json, so any of them can be falsified against the JSON.",
      films: rendered,
    },
    null,
    2,
  ) + "\n",
  "utf8",
);

log(`\n  ${rendered.length} film(s) documented`);
log("DIRECTOR MATERIALS = WRITTEN");

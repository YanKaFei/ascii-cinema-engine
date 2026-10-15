/**
 * The `loneliness` preset, expressed as a FilmSpec v2.
 *
 * WHY THIS EXISTS.
 * Phase 1's `solitude-dissolution` structure is retained, but its ROLE CHANGES. In Phase 1
 * it was the generation logic — every input produced it. In Phase 2 it is a **reference
 * preset**: a hand-authored, known-good FilmSpec v2 that
 *   (a) validates the v2 schema against something real,
 *   (b) gives the Director Agent a worked example of the interpretation → direction →
 *       shot chain,
 *   (c) anchors the Phase 1 regression by round-tripping to the same v1 spec.
 *
 * It must never again be the default path (see the Phase 2 brief §5).
 *
 * The camera/density/layer authoring is NOT restated here: it is read from the exported
 * Phase 1 beat table, so this preset and the Phase 1 baseline cannot drift apart.
 */

import { LONELINESS_BEATS, layer, materializeBeat, type BeatTemplate } from "./planner.js";
import type { FilmSpecV2, ActSpec, EmotionalBeat, VisualMotif, Opposition } from "./film-spec-v2.js";
import type { ShotSpecV2, SubjectSpec, MotionSpec, CompositionSpec } from "./shot-spec-v2.js";
import type { CameraReason, NarrativeFunction } from "../director/grammar/vocabulary.js";
import { legacySeedForWordMode } from "./v2-to-v1.js";
import type { FilmLookSpec, RasterSpec } from "./schema.js";

const SLUG = "loneliness";
const WIDTH = 1920;
const HEIGHT = 1080;
const FPS = 30;
const DURATION = 20;
const RAMP =
  " .'-_,^:;\"~i!|/\\()[]{}<>+=*?ltfrj1vcxunzoahksdybwmpqg" +
  "234567890LJCEFIVXYTZAHKNSURMDBWQGO#&$%@";

/** Per-beat directorial metadata. Timing, camera and layers come from LONELINESS_BEATS. */
interface BeatDirection {
  narrativeFunction: NarrativeFunction;
  intention: string;
  visualReason: string;
  cameraReason: CameraReason;
  cameraReasonDetail: string;
  spaceKind: ShotSpecV2["space"]["kind"];
  spaceDescription: string;
  occlusionPolicy: ShotSpecV2["space"]["occlusionPolicy"];
  boundaryVisible: boolean;
  composition: CompositionSpec;
  subjects: SubjectSpec[];
  motion: MotionSpec[];
  transformation?: ShotSpecV2["transformation"];
  transitionIn?: ShotSpecV2["transitionIn"];
}

const BEAT_DIRECTION: Record<string, BeatDirection> = {
  "01": {
    narrativeFunction: "establish",
    intention:
      "Establish that the film's unit of meaning is a single mark, and that the world it sits in is empty rather than dark.",
    visualReason:
      "One lit cell in 28,800 proves the negative space is a positive quantity: the audience must be able to count what is there, and count one.",
    cameraReason: "hold-observation",
    cameraReasonDetail:
      "The camera must not move, because any movement would imply there is somewhere else worth looking.",
    spaceKind: "void",
    spaceDescription: "An unbounded field with no ground, horizon or scale reference.",
    occlusionPolicy: "additive",
    boundaryVisible: false,
    composition: {
      primary: "negative-space",
      secondary: ["isolated"],
      subjectPlacement: { x: 0.5, y: 0.575 },
      negativeSpaceRatio: 0.99997,
      reason: "The mark sits on the lower-third line so the void above it has weight.",
    },
    subjects: [
      {
        id: "the-dot",
        description: "a single mark; the smallest thing that can be a subject",
        visualForm: "point",
        role: "protagonist",
        prominence: 0.04,
      },
    ],
    motion: [{ kind: "hold", subjectId: "the-dot", intensity: 1, purpose: "stillness is the subject" }],
  },
  "02": {
    narrativeFunction: "introduce",
    intention:
      "Introduce the idea that the world is populated, and that what was empty was only unlit.",
    visualReason:
      "Characters converge from beyond the frame edge, so the audience learns the void extends past what they were shown.",
    cameraReason: "hold-observation",
    cameraReasonDetail:
      "The arrival must be the only motion; a moving camera would steal the event from the material.",
    spaceKind: "radial-space",
    spaceDescription: "Space organised around the original mark; everything arrives toward it.",
    occlusionPolicy: "additive",
    boundaryVisible: false,
    composition: {
      primary: "centered",
      secondary: ["expansion"],
      subjectPlacement: { x: 0.5, y: 0.5 },
      negativeSpaceRatio: 0.7,
      reason: "The centre is held open so the inward convergence is legible as direction.",
    },
    subjects: [
      {
        id: "arriving-field",
        description: "the population of marks that was always there, now lit",
        visualForm: "field",
        role: "environment",
        prominence: 0.7,
      },
      {
        id: "the-dot",
        description: "the original mark, now surrounded",
        visualForm: "point",
        role: "protagonist",
        prominence: 0.1,
      },
    ],
    motion: [{ kind: "converge", subjectId: "arriving-field", intensity: 0.8, purpose: "the world closes in" }],
    transformation: {
      kind: "assemble",
      subjectId: "arriving-field",
      becomes: "a populated world around the original mark",
      from: 0.06,
      to: 0.92,
      dramaticPurpose: "The emptiness was a failure of attention, not a fact.",
      causedBy: "time",
    },
  },
  "03": {
    narrativeFunction: "reveal",
    intention: "Reveal that the population has a shape, and that the shape is a body.",
    visualReason:
      "The field resolves into a figure while the camera slides across it, so the audience assembles the body at the same moment the marks do.",
    cameraReason: "traverse-depth-layers",
    cameraReasonDetail:
      "A lateral move is the only way to show that the near plane and the far plane are separate places; a push-in would collapse them.",
    spaceKind: "layered-depth",
    spaceDescription: "Explicit near body plane and far dust plane, separated by parallax.",
    occlusionPolicy: "additive",
    boundaryVisible: false,
    composition: {
      primary: "deep-axis",
      secondary: ["centered", "asymmetrical"],
      subjectPlacement: { x: 0.5, y: 0.52 },
      negativeSpaceRatio: 0.72,
      reason: "The figure occupies the middle distance so both depth planes stay readable.",
    },
    subjects: [
      {
        id: "figure",
        description: "the shape the world was always making",
        visualForm: "figure",
        role: "protagonist",
        prominence: 0.85,
      },
      {
        id: "deep-space",
        description: "the far plane, which barely moves",
        visualForm: "field",
        role: "environment",
        prominence: 0.25,
      },
    ],
    motion: [
      { kind: "drift", subjectId: "deep-space", intensity: 0.4, purpose: "keep the far plane alive" },
    ],
    transformation: {
      kind: "assemble",
      subjectId: "figure",
      becomes: "a legible body",
      from: 0.06,
      to: 0.92,
      dramaticPurpose: "The scattered marks were never random; they were a person forming.",
      causedBy: "camera",
    },
    transitionIn: { kind: "dissolve", duration: 0.0, reason: "continuity through the reveal" },
  },
  "04": {
    narrativeFunction: "transform",
    intention:
      "Turn the figure from something observed into something occupying the frame, and let density carry the pressure.",
    visualReason:
      "The camera closes distance while the glyph vocabulary opens, so the same field becomes both larger and more articulate.",
    cameraReason: "increase-psychological-pressure",
    cameraReasonDetail:
      "Closing the distance does not reveal new information; it removes the audience's room to look away.",
    // NOTE: this was briefly "compression", which is a COMPOSITION term, not a space.
    // The compiler rejected it — which is the point of keeping the grammar closed and
    // the categories separate: the space is still layered-depth, and the shot's
    // argument is carried by its composition (`compression`) instead.
    spaceKind: "layered-depth",
    spaceDescription: "The same layered space as shot 03, but the camera is pressing the layers together.",
    occlusionPolicy: "additive",
    boundaryVisible: false,
    composition: {
      primary: "compression",
      secondary: ["centered"],
      subjectPlacement: { x: 0.5, y: 0.5 },
      negativeSpaceRatio: 0.55,
      reason: "Reducing empty space is the shot's entire argument.",
    },
    subjects: [
      {
        id: "structure",
        description: "the figure, now dense enough to read as a body",
        visualForm: "figure",
        role: "protagonist",
        prominence: 1,
      },
      {
        id: "filament-field",
        description: "mid-ground material filling the space between",
        visualForm: "field",
        role: "environment",
        prominence: 0.6,
      },
    ],
    motion: [{ kind: "flow", subjectId: "filament-field", intensity: 0.6, purpose: "the space itself is moving" }],
  },
  "05": {
    narrativeFunction: "resolve",
    intention:
      "Resolve onto the same image the film opened with, so that everything in between is reframed as a temporary arrangement.",
    visualReason:
      "The figure lets go and the frame empties back to one mark: the film's last image is its first image, and the audience now knows what it took to see it.",
    cameraReason: "withdraw-from-absence",
    cameraReasonDetail:
      "The camera holds as the structure leaves, refusing the temptation to follow the debris; the film ends where it began rather than chasing the loss.",
    spaceKind: "void",
    spaceDescription: "The void again, but this time known to be populated.",
    occlusionPolicy: "additive",
    boundaryVisible: false,
    composition: {
      primary: "negative-space",
      secondary: ["isolated"],
      subjectPlacement: { x: 0.5, y: 0.542 },
      negativeSpaceRatio: 0.9999,
      reason: "Returning the frame to a single mark closes the film's argument about attention.",
    },
    subjects: [
      {
        id: "disintegrating-structure",
        description: "the body, letting go",
        visualForm: "figure",
        role: "protagonist",
        prominence: 1,
      },
      {
        id: "scattering-shards",
        description: "the material of the body, leaving",
        visualForm: "field",
        role: "evidence",
        prominence: 0.5,
      },
      {
        id: "last-glyph",
        description: "the same mark the film opened with, now the only thing left",
        visualForm: "glyph",
        text: "'",
        role: "survivor",
        prominence: 0.1,
      },
    ],
    motion: [{ kind: "diverge", subjectId: "scattering-shards", intensity: 0.9, purpose: "the loss has a direction" }],
    transformation: {
      kind: "disassemble",
      subjectId: "disintegrating-structure",
      becomes: "nothing visible",
      from: 0.02,
      to: 0.46,
      dramaticPurpose:
        "The film argues that the body was assembled by attention, so when attention withdraws the body goes with it.",
      causedBy: "time",
    },
  },
};

const EMOTIONAL_ARC: EmotionalBeat[] = [
  { at: 0.0, feeling: "isolation", cause: "a single mark in an empty frame", intensity: 0.15 },
  { at: 0.3, feeling: "unease at company", cause: "marks arriving from beyond the frame", intensity: 0.35 },
  { at: 0.5, feeling: "recognition", cause: "the field resolving into a body", intensity: 0.6 },
  { at: 0.75, feeling: "pressure", cause: "the frame closing and thickening", intensity: 0.85 },
  { at: 0.9, feeling: "release", cause: "the body letting go", intensity: 0.5 },
  { at: 1.0, feeling: "isolation, understood", cause: "the frame back to one mark", intensity: 0.2 },
];

const MOTIFS: VisualMotif[] = [
  {
    id: "the-mark",
    meaning: "the minimum unit of attention; what is left when everything else is withdrawn",
    visualForm: "a single lit character cell",
    subjectKind: "point",
    role: "protagonist",
    introducedAt: 0,
    development: [
      "alone, and unreadable without a scale reference",
      "surrounded by a population it did not know was there",
      "revealed to be the centre the population was arranging itself around",
      "reduced to one cell again, now known to be a choice",
    ],
  },
  {
    id: "the-arriving-population",
    meaning: "the world that was always present and merely unlit",
    visualForm: "a ring of marks converging from beyond the frame",
    subjectKind: "field",
    role: "environment",
    introducedAt: 0.2,
    development: [
      "arrives from outside the frame",
      "resolves into a body",
      "becomes dense enough to press on the frame",
      "leaves in the direction it came from",
    ],
  },
  {
    id: "the-body",
    meaning: "a shape that only exists while it is being assembled by attention",
    visualForm: "a humanoid silhouette of soft glyph marks",
    subjectKind: "figure",
    role: "protagonist",
    introducedAt: 0.4,
    development: [
      "forms out of noise",
      "gains density and legibility",
      "is pressed by the camera",
      "disassembles when the film stops assembling it",
    ],
  },
];

const OPPOSITIONS: Opposition[] = [
  {
    a: "emptiness",
    b: "population",
    resolvedToward: "neither",
    staging:
      "Shot 01 shows one mark in a void; shot 02 shows the void is full. Neither image is retracted, so the film holds both.",
  },
  {
    a: "attention",
    b: "withdrawal",
    resolvedToward: "b",
    staging:
      "The body is assembled by looking and disassembles when the film stops; the camera's refusal to follow the debris is the resolution.",
  },
];

export interface LonelinessPresetOptions {
  duration?: number;
  fps?: number;
  width?: number;
  height?: number;
  quality?: "draft" | "standard" | "high";
}

/**
 * Build the loneliness preset as a FilmSpec v2.
 *
 * Deterministic: the same options always produce a byte-identical spec.
 */
export function buildLonelinessPresetV2(opts: LonelinessPresetOptions = {}): FilmSpecV2 {
  const duration = opts.duration ?? DURATION;
  const fps = opts.fps ?? FPS;
  const width = opts.width ?? WIDTH;
  const height = opts.height ?? HEIGHT;

  const raster: RasterSpec = {
    cols: width / 8,
    rows: height / 9,
    cellW: 8,
    cellH: 9,
    ramp: RAMP,
    coverageMin: 2,
    coverageMax: 20,
    exposure: 1.85,
    blackPoint: 0.085,
    dither: true,
    inkFloor: 0,
  };
  if (!Number.isInteger(raster.cols) || !Number.isInteger(raster.rows)) {
    throw new Error(`${width}x${height} is not divisible by the 8x9 glyph cell`);
  }

  const look: FilmLookSpec = {
    background: "#000000",
    foreground: "#ffffff",
    aspect: "16:9",
    filmGrain: 0.03,
    vignette: 0.3,
    chromaticBloom: 0,
    scanlineHz: 0,
    textTypeIn: 0,
  };

  const perShot = duration / LONELINESS_BEATS.length;

  // Build the v1 shots from the authoritative beat table, then derive v2 shots from them.
  const shots: ShotSpecV2[] = LONELINESS_BEATS.map((beat: BeatTemplate, i: number) => {
    const v1 = materializeBeat(beat, i, perShot, raster);
    // Retime exactly as planFilm does, so the preset round-trips to the same timeline.
    const start = i * perShot;
    v1.start = start;
    v1.duration = i === LONELINESS_BEATS.length - 1 ? duration - start : perShot;

    const dir = BEAT_DIRECTION[beat.id];
    if (!dir) throw new Error(`no v2 direction authored for beat ${beat.id}`);

    return {
      id: beat.id,
      title: beat.title,
      narrativeFunction: dir.narrativeFunction,
      intention: dir.intention,
      start: v1.start,
      duration: v1.duration,
      background: beat.background,
      subjects: dir.subjects,
      space: {
        kind: dir.spaceKind,
        description: dir.spaceDescription,
        occlusionPolicy: dir.occlusionPolicy,
        boundaryVisible: dir.boundaryVisible,
        unbounded: dir.spaceKind === "void",
        horizon: dir.spaceKind === "void" ? "none" : "centered",
      },
      composition: dir.composition,
      camera: {
        move: v1.camera,
        reason: dir.cameraReason,
        reasonDetail: dir.cameraReasonDetail,
        rhythmCoupling: "follows-curve",
      },
      motion: dir.motion,
      transformation: dir.transformation,
      transitionIn: dir.transitionIn,
      rhythm: {
        energy: EMOTIONAL_ARC[Math.min(EMOTIONAL_ARC.length - 1, i)]!.intensity,
        tension: EMOTIONAL_ARC[Math.min(EMOTIONAL_ARC.length - 1, i)]!.intensity,
        informationDensity: i / (LONELINESS_BEATS.length - 1),
        motionDensity: i / (LONELINESS_BEATS.length - 1),
        source: "curve",
      },
      visualReason: dir.visualReason,
      cameraReason: dir.cameraReasonDetail,
      layers: v1.layers,
      raster: v1.raster,
      techniques: v1.techniques,
      density: beat.density,
    };
  });

  const acts: ActSpec[] = [
    {
      id: "act-1",
      title: "The empty world",
      function: "Establish a scale of one, then reveal that the frame edge was not the world's edge.",
      shotIds: ["01", "02"],
      from: 0,
      to: 0.4,
      dominantFunction: "establish",
      dominantSpace: "void",
      dominantComposition: "negative-space",
    },
    {
      id: "act-2",
      title: "The assembled body",
      function: "Show that the population has a shape, and that the shape can be pressed.",
      shotIds: ["03", "04"],
      from: 0.4,
      to: 0.8,
      dominantFunction: "reveal",
      dominantSpace: "layered-depth",
      dominantComposition: "deep-axis",
    },
    {
      id: "act-3",
      title: "Withdrawal",
      function: "Return to the opening image and let the audience re-read it.",
      shotIds: ["05"],
      from: 0.8,
      to: 1,
      dominantFunction: "resolve",
      dominantSpace: "void",
      dominantComposition: "negative-space",
    },
  ];

  // The seed MUST come from the single authoritative derivation rule, otherwise the
  // preset and the Phase 1 planner produce different films. An earlier revision restated
  // the formula here with the slug instead of the raw word and silently diverged.
  const seed = legacySeedForWordMode("孤独", duration, width, height, fps);

  return {
    version: "2",
    slug: SLUG,
    title: "孤独 / A single glyph in a void",
    input: {
      raw: "孤独",
      mode: "word",
      modeRationale:
        "A single word with no verb and no punctuation: it names a condition rather than an event.",
    },
    interpretation: {
      literalMeaning: "Loneliness; the state of being alone.",
      centralIdea:
        "Loneliness is not the absence of the world but the withdrawal of attention from it; what is assembled by looking is disassembled when looking stops.",
      dramaticQuestion: "Is the empty frame empty, or is it merely unlit?",
      subjectPresence: "both",
      emotionalArc: EMOTIONAL_ARC,
      motifs: MOTIFS,
      oppositions: OPPOSITIONS,
      spatialMetaphor: "A void that is discovered to be full, then permitted to empty again.",
      spaceKind: "void",
      transformationLogic: {
        subject: "the body",
        kind: "disassemble",
        becomes: "a single mark",
        because:
          "The film's claim is that the body is a product of attention; withdrawing attention is the only honest ending.",
      },
      constraints: [
        "must not resolve into company; the film ends isolated",
        "must not use a moving camera to create interest in the opening shot",
      ],
    },
    direction: {
      duration,
      fps,
      resolution: [width, height],
      quality: opts.quality ?? "draft",
      visualStrategy:
        "Procedural point fields sampled on a fixed 240x120 glyph lattice; every mark is a printable ASCII character, and the negative space is authored, not leftover.",
      densityStrategy:
        "The glyph vocabulary opens monotonically from two punctuation marks to the full ASCII mass range, then closes back to two at the film's end.",
      cameraStrategy:
        "Three static-distance shots carry the assembly; one push-in applies pressure; the final shot holds rather than follows.",
      editingStrategy:
        "Four hard cuts on the beat. No dissolves except the deliberate continuity into the reveal.",
      rhythmStrategy:
        "A single rising curve from isolation to pressure, released abruptly, then a long quiet tail.",
      negativeSpaceStrategy:
        "Negative space is the film's main character: it starts at 99.997% of the frame and is deliberately spent.",
      openingImage: "One lit character cell on a black field.",
      closingImage:
        "The same single lit character cell, now readable as a survivor rather than a beginning.",
      rhythm: {
        energy: [
          [0, 0.15],
          [0.25, 0.3],
          [0.5, 0.6],
          [0.75, 0.85],
          [0.85, 0.5],
          [1, 0.15],
        ],
        tension: [
          [0, 0.2],
          [0.3, 0.35],
          [0.6, 0.7],
          [0.8, 0.9],
          [0.88, 0.4],
          [1, 0.1],
        ],
        informationDensity: [
          [0, 0.02],
          [0.3, 0.35],
          [0.6, 0.55],
          [0.8, 0.9],
          [0.9, 0.2],
          [1, 0.02],
        ],
        motionDensity: [
          [0, 0.0],
          [0.3, 0.6],
          [0.55, 0.4],
          [0.8, 0.7],
          [0.9, 0.95],
          [1, 0.0],
        ],
        rationale:
          "Tension peaks before energy does, so the audience is ahead of the image; the tail is long because the last frame must be read.",
      },
      look,
      raster,
    },
    acts,
    shots,
    seed,
    provenance: {
      interpreter: "preset",
      planners: [
        { id: "preset:loneliness", summary: "Phase 1 solitude-dissolution structure, retained as a reference preset" },
      ],
      repairs: [],
      seedTemplate: "solitude-dissolution",
    },
  };
}

/**
 * The semantic knowledge base.
 *
 * This is the interpreter's whole world. It is a list of CONCEPTS, each carrying:
 *   - surface triggers (in any of the supported languages),
 *   - a full semantic feature vector,
 *   - the oppositions the concept implies,
 *   - motif seeds with visual hints.
 *
 * WHY IT IS DATA, NOT CODE.
 * The Phase 2 rule is "no benchmark-specific conditional". A `switch (prompt)` would
 * violate it outright, but so would a table keyed by whole prompts, because it would only
 * work for prompts someone already wrote. A table keyed by CONCEPTS composes: an unseen
 * prompt fires whichever concepts it overlaps, and the feature vector is the union of
 * their contributions. `欲望` and `孤独` are rows in this table, not branches.
 *
 * The same property makes the system testable: features are the interface between meaning
 * and structure, so a test can assert "this feature vector must produce this space kind"
 * without ever mentioning a prompt.
 *
 * HOW FEATURES ARE COMBINED (see interpreter.ts):
 *   - categorical features take the highest-confidence match, with ties broken by a fixed
 *     precedence order (never by input order, which would make the result depend on how
 *     the prompt happened to be worded),
 *   - scalar features are confidence-weighted means.
 */

import type {
  ArcShape,
  BoundaryType,
  Cardinality,
  Embodiment,
  Presence,
  Reachability,
  SemanticFeatures,
  Tempo,
} from "./types.js";
import type { Opposition } from "../domain/film-spec-v2.js";
import type { SubjectRole, TransformationKind } from "./grammar/vocabulary.js";
import type { MotifSeed } from "./types.js";

export interface ConceptMotif {
  id: string;
  meaning: string;
  role: SubjectRole;
  visualHint: string;
  introducedAt: number;
  /** the transformation this motif participates in, if any */
  transformsBy?: TransformationKind;
}

/**
 * How much a concept is allowed to determine each feature when it is combined with others.
 *
 * WHY THIS EXISTS. A flat confidence-weighted combination treats every matched concept as
 * an equal claim about the film, which is wrong: `a-person` says there is a body, not that
 * the film resolves or that its subject is present. In an early revision, the "I woke up
 * and everyone had forgotten my name" benchmark combined `waking` (a rise) with
 * `forgetting` (a collapse) and came out as a rise, and `a-person` forced `presence:
 * present` onto a film about absence. The features were being outvoted by incidental
 * vocabulary.
 *
 * A concept therefore declares which features it is entitled to drive. Anything omitted
 * defaults to 1 (full say). A value of 0 means "this concept must not influence that
 * feature at all", which is how a scene-setter is kept out of the drama.
 */
export interface ConceptDrive {
  arcShape?: number;
  temporal?: number;
  presence?: number;
  reachability?: number;
  embodiment?: number;
  cardinality?: number;
  tempo?: number;
  spatiality?: number;
  interiority?: number;
  violence?: number;
  resolutionPressure?: number;
  literalism?: number;
  enclosureAffinity?: number;
  boundaryType?: number;
  boundarySalience?: number;
}

/**
 * What kind of claim a concept makes about the film.
 *
 *  - theme    the film is ABOUT this; it carries the arc, the idea and the metaphor
 *  - modifier an event or a participant that shapes one aspect (a body, an erasure)
 *  - setting  a place; it determines the space and must not decide the drama
 *
 * This is the primary tie-break when concepts disagree. Trigger length alone is a bad
 * guide: in the "everyone forgot my name" benchmark, `所有人` (the collective) matched a
 * longer trigger than `忘记` (forgetting) and therefore outvoted the film's actual subject
 * on both the arc shape and the subject's presence.
 */
export type ConceptRole = "theme" | "modifier" | "setting";

export interface Concept {
  id: string;
  role: ConceptRole;
  /** lowercase surface triggers; matched as substrings of the normalised input */
  triggers: string[];
  /** the concept's own reading */
  features: SemanticFeatures;
  /** the oppositions this concept stages */
  oppositions: Array<{ a: string; b: string; staging: string; resolvedToward?: "a" | "b" | "neither" }>;
  motifs: ConceptMotif[];
  /** the concept's literal gloss */
  literalMeaning: string;
  /** what the concept is about when read as a film */
  centralIdea: string;
  /** the question it asks */
  dramaticQuestion: string;
  /** the spatial idea this concept implies */
  spatialMetaphor: string;
  /** what the concept forbids in its treatment */
  constraints: string[];
  /** the change the concept's central thing undergoes */
  transformation?: {
    subject: string;
    kind: TransformationKind;
    becomes: string;
    because: string;
  };
  /**
   * Which features this concept is entitled to drive. Omitted = 1 (full say).
   * A scene-setter like `enclosure` sets spatiality to 1 and everything dramatic to 0.
   */
  drives?: ConceptDrive;
}

/** A neutral feature vector: every scalar at 0.5, categories at their middle value. */
export const NEUTRAL_FEATURES: SemanticFeatures = {
  arcShape: "plateau",
  temporal: "repetition",
  presence: "present",
  reachability: "reachable",
  embodiment: "abstract",
  cardinality: "singular",
  tempo: "measured",
  spatiality: 0.5,
  interiority: 0.5,
  violence: 0.2,
  resolutionPressure: 0.5,
  literalism: 0.4,
  enclosureAffinity: 0.2,
  boundaryType: "unbounded",
  boundarySalience: 0.1,
};

/**
 * The knowledge base.
 *
 * Deliberately broader than the four Phase 2 benchmarks: a knowledge base sized to its
 * tests is a lookup table with extra steps.
 */
export const CONCEPTS: Concept[] = [
  // -------------------------------------------------------------------------
  // 孤独 / loneliness / solitude
  // -------------------------------------------------------------------------
  {
    id: "solitude",
    role: "theme",
    triggers: ["孤独", "寂寞", "独处", "孤", "lonely", "loneliness", "solitude", "solitary", "alone", "isolation"],
    features: {
      arcShape: "rise",
      temporal: "accumulation",
      presence: "trace",
      reachability: "unreachable",
      embodiment: "bodily",
      cardinality: "singular",
      tempo: "slow",
      spatiality: 0.95,
      interiority: 0.85,
      violence: 0.2,
      resolutionPressure: 0.3,
      literalism: 0.2,
      enclosureAffinity: 0.05,
      boundaryType: "open",
      boundarySalience: 0.0,
    },
    literalMeaning: "Loneliness; the state of being alone.",
    centralIdea:
      "Loneliness is not the absence of the world but the withdrawal of attention from it.",
    dramaticQuestion: "Is the empty frame empty, or merely unlit?",
    spatialMetaphor: "A void that is discovered to be full, and then permitted to empty again.",
    constraints: [
      "must not resolve into company; the film ends isolated",
      "must not use camera movement to manufacture interest in the opening",
    ],
    oppositions: [
      {
        a: "emptiness",
        b: "population",
        staging: "One mark in a void, then the same void shown to be full; neither image is retracted.",
        resolvedToward: "neither",
      },
      {
        a: "attention",
        b: "withdrawal",
        staging: "The body is assembled by looking and disassembles when the film stops looking.",
        resolvedToward: "b",
      },
    ],
    motifs: [
      {
        id: "the-mark",
        meaning: "the minimum unit of attention",
        role: "protagonist",
        visualHint: "a single lit character cell",
        introducedAt: 0,
      },
      {
        id: "the-arriving-population",
        meaning: "the world that was always present and merely unlit",
        role: "environment",
        visualHint: "a ring of marks converging from beyond the frame",
        introducedAt: 0.2,
      },
      {
        id: "the-body",
        meaning: "a shape that exists only while it is being assembled by attention",
        role: "protagonist",
        visualHint: "a humanoid silhouette of soft glyph marks",
        introducedAt: 0.4,
        transformsBy: "disassemble",
      },
    ],
    transformation: {
      subject: "the body",
      kind: "disassemble",
      becomes: "a single mark",
      because: "If the body is a product of attention, withdrawing attention is the only honest ending.",
    },
  },

  // -------------------------------------------------------------------------
  // 欲望 / desire / want
  // -------------------------------------------------------------------------
  {
    id: "desire",
    role: "theme",
    triggers: ["欲望", "渴望", "想要", "欲", "desire", "want", "longing", "craving", "appetite", "lust", "hunger for"],
    features: {
      arcShape: "wave",
      temporal: "repetition",
      presence: "absent",
      reachability: "approached-never-reached",
      embodiment: "bodily",
      cardinality: "dual",
      tempo: "urgent",
      spatiality: 0.45,
      interiority: 0.6,
      violence: 0.5,
      resolutionPressure: 0.2,
      literalism: 0.35,
      enclosureAffinity: 0.75,
      boundaryType: "passage",
      // A corridor is a boundary you move THROUGH, so its boundary is not the film's
      // subject: the distance is. Salience must stay below the gate in spatial.ts.
      boundarySalience: 0.15,
    },
    literalMeaning: "Desire; the state of wanting.",
    centralIdea:
      "Desire is sustained by distance: the object is constituted by the approach, and closes only by ending.",
    dramaticQuestion: "What is left of the object once it is reached?",
    spatialMetaphor:
      "A corridor whose far end recedes at exactly the rate the subject advances.",
    constraints: [
      "must never allow contact; the film cannot show satisfaction",
      "must not resolve onto a static image; the film ends mid-approach",
    ],
    oppositions: [
      {
        a: "approach",
        b: "recession",
        staging: "Every movement toward the object moves the object away by the same amount.",
        resolvedToward: "neither",
      },
      {
        a: "the wanting",
        b: "the wanted",
        staging: "The subject is dense and near; the object is a thin mark that never resolves.",
        resolvedToward: "a",
      },
    ],
    motifs: [
      {
        id: "the-receding-object",
        meaning: "the thing that is constituted by being out of reach",
        role: "object-of-desire",
        visualHint: "a small bright mark that holds its distance",
        introducedAt: 0.05,
      },
      {
        id: "the-reaching-body",
        meaning: "the subject reduced to its wanting",
        role: "protagonist",
        visualHint: "a body silhouette extended along the axis of approach",
        introducedAt: 0,
      },
      {
        id: "the-corridor",
        meaning: "distance as a structure that produces desire",
        role: "environment",
        visualHint: "receding lines of marks converging to a point",
        introducedAt: 0.1,
      },
    ],
    transformation: {
      subject: "the reaching body",
      kind: "erode",
      becomes: "a smaller and more extended version of itself",
      because: "Approach costs the subject material; wanting is consuming.",
    },
  },

  // -------------------------------------------------------------------------
  // 时间 / time
  // -------------------------------------------------------------------------
  {
    id: "time",
    role: "theme",
    triggers: ["时间", "时光", "岁月", "时", "time", "passage", "duration", "eternity", "memory of"],
    features: {
      arcShape: "plateau",
      temporal: "accumulation",
      presence: "trace",
      reachability: "unreachable",
      embodiment: "abstract",
      cardinality: "multiplicitous",
      tempo: "measured",
      spatiality: 0.7,
      interiority: 0.7,
      violence: 0.15,
      resolutionPressure: 0.15,
      literalism: 0.25,
      enclosureAffinity: 0.15,
      boundaryType: "unbounded",
      boundarySalience: 0.2,
    },
    literalMeaning: "Time; duration; the passage of things.",
    centralIdea:
      "Time is not a line but a place: everything that happened is still there, accumulating in the same frame.",
    dramaticQuestion: "If nothing is lost, what does an ending mean?",
    spatialMetaphor:
      "One place seen at many moments, stacked vertically; nothing is replaced, everything is deposited.",
    constraints: [
      "must not use a single forward-moving pursuit; time does not chase",
      "must not resolve; the film stops rather than concludes",
    ],
    oppositions: [
      {
        a: "accumulation",
        b: "erasure",
        staging: "Marks deposit and never leave; the frame thickens while the subject stays still.",
        resolvedToward: "a",
      },
      {
        a: "the moment",
        b: "the duration",
        staging: "A single bright mark sits inside an increasingly dense field.",
        resolvedToward: "b",
      },
    ],
    motifs: [
      {
        id: "the-deposit",
        meaning: "what is left behind by a moment",
        role: "evidence",
        visualHint: "a horizontal stratum of marks",
        introducedAt: 0,
      },
      {
        id: "the-column",
        meaning: "duration as vertical structure",
        role: "environment",
        visualHint: "a vertical accumulation of strata",
        introducedAt: 0.15,
      },
      {
        id: "the-single-moment",
        meaning: "the present, held inside duration",
        role: "protagonist",
        visualHint: "one bright mark that does not move",
        introducedAt: 0.25,
      },
    ],
    transformation: {
      subject: "the frame",
      kind: "grow",
      becomes: "a stratified deposit of everything the film has shown",
      because: "If time is a place, then the film's own duration is the material it accumulates.",
    },
  },

  // -------------------------------------------------------------------------
  // 遗忘 / forgetting / being forgotten
  // -------------------------------------------------------------------------
  {
    id: "forgetting",
    role: "theme",
    triggers: [
      "忘记", "遗忘", "忘", "记不得", "想不起来", "forgot", "forgotten", "forget", "unremembered", "erase my",
      "memory of my", "no one remembers",
    ],
    features: {
      arcShape: "collapse",
      temporal: "erosion",
      presence: "absent",
      reachability: "unreachable",
      embodiment: "bodily",
      cardinality: "dual",
      tempo: "measured",
      spatiality: 0.6,
      interiority: 0.9,
      violence: 0.45,
      resolutionPressure: 0.7,
      literalism: 0.55,
      enclosureAffinity: 0.7,
      boundaryType: "container",
      boundarySalience: 0.4,
    },
    literalMeaning: "Forgetting; being forgotten.",
    centralIdea:
      "To be forgotten is not to be erased but to be present in a place that no longer has a name for you.",
    dramaticQuestion: "Who is the absence for?",
    spatialMetaphor:
      "A room with a marked position where something should be, and nothing in it.",
    constraints: [
      "must not show the forgetting as violence done to the subject by another",
      "must not resolve with recognition; the absence is not repaired",
    ],
    oppositions: [
      {
        a: "the name",
        b: "the named",
        staging: "A legible word is present while the body it refers to cannot be found.",
        resolvedToward: "neither",
      },
      {
        a: "presence",
        b: "legibility",
        staging: "The subject is present in the frame and absent from the record.",
        resolvedToward: "b",
      },
    ],
    motifs: [
      {
        id: "the-name",
        meaning: "the mark that stands for a person in other people's memory",
        role: "evidence",
        visualHint: "legible ASCII word standing alone",
        introducedAt: 0.1,
      },
      {
        id: "the-empty-position",
        meaning: "where a person should have been",
        role: "absence",
        visualHint: "a bounded region of the frame kept deliberately unpopulated",
        introducedAt: 0,
      },
      {
        id: "the-witness",
        meaning: "the one who is doing the forgetting",
        role: "witness",
        visualHint: "a figure at the edge of the frame, facing the absence",
        introducedAt: 0.3,
      },
    ],
    transformation: {
      subject: "the name",
      kind: "vanish",
      becomes: "unoccupied space",
      because: "The film's claim is that the name was the person's only remaining location.",
    },
  },

  // -------------------------------------------------------------------------
  // 醒来 / waking  (a distinct concept that often co-occurs with forgetting)
  // -------------------------------------------------------------------------
  {
    id: "waking",
    role: "modifier",
    triggers: ["醒来", "醒", "睁开眼", "wake", "woke", "awoke", "waking up", "out of sleep"],
    features: {
      arcShape: "rise",
      temporal: "single-event",
      presence: "present",
      reachability: "reachable",
      embodiment: "bodily",
      cardinality: "dual",
      tempo: "measured",
      spatiality: 0.5,
      interiority: 0.8,
      violence: 0.3,
      resolutionPressure: 0.6,
      literalism: 0.5,
      enclosureAffinity: 0.3,
      boundaryType: "unbounded",
      boundarySalience: 0.1,
    },
    literalMeaning: "Waking; the transition from sleep to consciousness.",
    centralIdea:
      "Waking is not an arrival but a change in what is legible; the world does not appear, it becomes readable.",
    dramaticQuestion: "Which of the two states was the accurate one?",
    spatialMetaphor: "A plane coming into resolution out of a field.",
    constraints: ["must not treat the waking world as authoritative"],
    // Waking is an event, but it must not outvote a stronger theme's arc shape; it
    // contributes a moderate claim and full say on literalism.
    drives: {
      arcShape: 0.5, temporal: 0.5, presence: 0.3, reachability: 0.4,
      embodiment: 0.5, cardinality: 0.3, tempo: 0.4,
      spatiality: 0.2, interiority: 0.8, violence: 0.3,
      resolutionPressure: 0.7, literalism: 1,
    },
    oppositions: [
      {
        a: "legibility",
        b: "the real",
        staging: "The image sharpens into something the subject does not recognise.",
        resolvedToward: "neither",
      },
    ],
    motifs: [
      {
        id: "the-opening-eye",
        meaning: "the aperture of the film itself",
        role: "protagonist",
        visualHint: "a dark frame that gains marks from the centre outward",
        introducedAt: 0,
      },
    ],
  },

  // -------------------------------------------------------------------------
  // 发现 / discovery / revelation
  // -------------------------------------------------------------------------
  {
    id: "discovery",
    role: "modifier",
    triggers: ["发现", "看到", "找到", "发现墙", "discover", "found", "found out", "realise", "realize", "notice"],
    features: {
      arcShape: "rise",
      temporal: "single-event",
      presence: "present",
      reachability: "reachable",
      embodiment: "bodily",
      cardinality: "dual",
      tempo: "measured",
      spatiality: 0.55,
      interiority: 0.5,
      violence: 0.4,
      resolutionPressure: 0.75,
      literalism: 0.7,
      enclosureAffinity: 0.45,
      boundaryType: "container",
      boundarySalience: 0.3,
    },
    literalMeaning: "Discovery; coming upon something already there.",
    centralIdea: "A discovery is not new information but a new arrangement of what was already in the frame.",
    dramaticQuestion: "Was it hidden, or was I not looking?",
    spatialMetaphor: "A surface that has been carrying a message all along.",
    constraints: ["must not introduce anything that was not already present in an earlier frame"],
    // Discovery is an event: it shapes the arc and resolution, not the space.
    drives: {
      arcShape: 1, temporal: 0.8, presence: 0.3, reachability: 0,
      embodiment: 0, cardinality: 0, tempo: 0.5,
      spatiality: 0, interiority: 0.2, violence: 0.3,
      resolutionPressure: 1, literalism: 1,
    },
    oppositions: [
      {
        a: "the surface",
        b: "the message",
        staging: "Attention moves from an empty wall to the same wall read as text.",
        resolvedToward: "b",
      },
    ],
    motifs: [
      {
        id: "the-written-surface",
        meaning: "a surface that has been carrying meaning",
        role: "evidence",
        visualHint: "a dense plane of glyphs that resolves into legible type",
        introducedAt: 0.2,
      },
    ],
  },

  // -------------------------------------------------------------------------
  // 房间 / room / enclosure
  // -------------------------------------------------------------------------
  {
    id: "enclosure",
    role: "setting",
    triggers: ["房间", "屋", "墙", "室", "门", "room", "wall", "chamber", "corridor", "hall", "indoors"],
    features: {
      arcShape: "collapse",
      temporal: "single-event",
      presence: "present",
      reachability: "reachable",
      embodiment: "abstract",
      cardinality: "singular",
      tempo: "slow",
      spatiality: 0.98,
      interiority: 0.5,
      violence: 0.35,
      resolutionPressure: 0.6,
      literalism: 0.6,
      enclosureAffinity: 1.0,
      boundaryType: "container",
      boundarySalience: 1.0,
    },
    literalMeaning: "A room; an enclosed space.",
    centralIdea: "A room is a boundary that makes an inside legible by giving it an outside.",
    dramaticQuestion: "What is on the other side of the wall, and does it matter?",
    spatialMetaphor: "A bounded box whose walls are the only scale reference.",
    constraints: ["the boundary must be visible at least once, or the space is not a room"],
    // A room is a place, not a plot: it determines the space and nothing dramatic.
    drives: {
      arcShape: 0, temporal: 0, presence: 0, reachability: 0,
      embodiment: 0, cardinality: 0, tempo: 0,
      spatiality: 1, interiority: 0.2, violence: 0.2,
      resolutionPressure: 0.3, literalism: 0.7,
      // A setting's ONE strong claim: this film is about a bounded space.
      enclosureAffinity: 1,
    },
    oppositions: [
      {
        a: "inside",
        b: "outside",
        staging: "The frame is enclosed by visible walls, then the enclosure is removed.",
        resolvedToward: "neither",
      },
    ],
    motifs: [
      {
        id: "the-boundary",
        meaning: "the edge that defines the subject by excluding something",
        role: "environment",
        visualHint: "a rectangular frame of marks",
        introducedAt: 0,
      },
    ],
  },

  // -------------------------------------------------------------------------
  // 消失 / disappearing / vanishing
  // -------------------------------------------------------------------------
  {
    id: "vanishing",
    role: "modifier",
    triggers: ["消失", "不见", "没了", "消逝", "vanish", "disappear", "gone", "ceases to exist", "fades away"],
    features: {
      arcShape: "collapse",
      temporal: "erosion",
      presence: "trace",
      reachability: "unreachable",
      embodiment: "abstract",
      cardinality: "singular",
      tempo: "measured",
      spatiality: 0.7,
      interiority: 0.6,
      violence: 0.55,
      resolutionPressure: 0.5,
      literalism: 0.45,
      enclosureAffinity: 0.25,
      boundaryType: "open",
      boundarySalience: 0.35,
    },
    literalMeaning: "Vanishing; ceasing to be present.",
    centralIdea: "Things do not vanish; the frame stops accounting for them.",
    dramaticQuestion: "What remains when the accounting stops?",
    spatialMetaphor: "A space whose contents are progressively removed from the record.",
    constraints: ["the disappearance must be shown as a change in the frame, not as a cut"],
    // Vanishing is a strong claim about shape and presence.
    drives: {
      arcShape: 1, temporal: 0.8, presence: 0.7, reachability: 0.5,
      embodiment: 0, cardinality: 0, tempo: 0.4,
      spatiality: 0.3, interiority: 0.3, violence: 0.6,
      resolutionPressure: 0.5, literalism: 0.7,
    },
    oppositions: [
      {
        a: "the thing",
        b: "the record of the thing",
        staging: "The frame empties while the space that held it stays visible.",
        resolvedToward: "b",
      },
    ],
    motifs: [
      {
        id: "the-vacated-place",
        meaning: "the shape of what used to be there",
        role: "absence",
        visualHint: "a region of the frame that stops being drawn",
        introducedAt: 0.3,
      },
    ],
  },

  // -------------------------------------------------------------------------
  // 所有人 / everyone / crowd
  // -------------------------------------------------------------------------
  {
    id: "the-collective",
    role: "modifier",
    triggers: ["所有人", "大家", "人们", "每个", "everyone", "everybody", "all of them", "the crowd", "no one", "nobody"],
    features: {
      arcShape: "plateau",
      temporal: "repetition",
      presence: "present",
      reachability: "approached-never-reached",
      embodiment: "collective",
      cardinality: "multiplicitous",
      tempo: "measured",
      spatiality: 0.6,
      interiority: 0.4,
      violence: 0.3,
      resolutionPressure: 0.4,
      literalism: 0.4,
      enclosureAffinity: 0.2,
      boundaryType: "unbounded",
      boundarySalience: 0.1,
    },
    literalMeaning: "Everyone; the collective.",
    centralIdea: "A crowd is a single subject that cannot be addressed individually.",
    dramaticQuestion: "Can one person be found inside everyone?",
    spatialMetaphor: "A field of identical marks in which one differs, or none does.",
    constraints: ["must not individuate the crowd; the point is scale"],
    // A collective is a scale claim; it must not decide the film's arc.
    drives: {
      arcShape: 0, temporal: 0.4, presence: 0.3, reachability: 0,
      embodiment: 1, cardinality: 1, tempo: 0,
      spatiality: 0.5, interiority: 0, violence: 0.2,
      resolutionPressure: 0, literalism: 0.5,
    },
    oppositions: [
      {
        a: "the many",
        b: "the one",
        staging: "A dense field of marks with a single mark held apart from it.",
        resolvedToward: "neither",
      },
    ],
    motifs: [
      {
        id: "the-field-of-others",
        meaning: "the mass that defines the individual by contrast",
        role: "environment",
        visualHint: "a dense even field of small marks",
        introducedAt: 0,
      },
    ],
  },

  // -------------------------------------------------------------------------
  // 名字 / name
  // -------------------------------------------------------------------------
  {
    id: "the-name",
    role: "modifier",
    triggers: ["名字", "姓名", "叫做", "name", "named", "called"],
    features: {
      arcShape: "fall",
      temporal: "erosion",
      presence: "present",
      reachability: "reachable",
      embodiment: "abstract",
      cardinality: "singular",
      tempo: "measured",
      spatiality: 0.3,
      interiority: 0.85,
      violence: 0.35,
      resolutionPressure: 0.8,
      literalism: 0.9,
      enclosureAffinity: 0.35,
      boundaryType: "open",
      boundarySalience: 0.15,
    },
    literalMeaning: "A name; the word by which a person is held in memory.",
    centralIdea: "A name is the only part of a person that other people can hold.",
    dramaticQuestion: "Is the name the person, or a place the person used to be?",
    spatialMetaphor: "Legible text occupying a position that a body cannot occupy.",
    constraints: ["the name must be rendered as legible ASCII, never as an image"],
    // A name is an object in the film, not a plot: strong on literalism, weak on shape.
    drives: {
      arcShape: 0.3, temporal: 0.3, presence: 0.4, reachability: 0.3,
      embodiment: 0, cardinality: 0, tempo: 0,
      spatiality: 0.2, interiority: 0.6, violence: 0.3,
      resolutionPressure: 0.8, literalism: 1,
    },
    oppositions: [
      {
        a: "the word",
        b: "the person",
        staging: "A legible name is present while the body it refers to is absent from the frame.",
        resolvedToward: "a",
      },
    ],
    motifs: [
      {
        id: "the-legible-word",
        meaning: "identity as something that can be read rather than seen",
        role: "protagonist",
        visualHint: "an ASCII word standing alone in the frame",
        introducedAt: 0,
      },
    ],
    transformation: {
      subject: "the legible word",
      kind: "vanish",
      becomes: "the space it occupied",
      because: "Removing the word is the only way the film can show what a name was holding.",
    },
  },

  // -------------------------------------------------------------------------
  // 空 / empty / void
  // -------------------------------------------------------------------------
  {
    id: "emptiness",
    role: "modifier",
    triggers: ["空", "空白", "虚无", "什么也没有", "empty", "emptiness", "void", "nothing", "blank", "hollow"],
    features: {
      arcShape: "plateau",
      temporal: "repetition",
      presence: "absent",
      reachability: "unreachable",
      embodiment: "abstract",
      cardinality: "singular",
      tempo: "slow",
      spatiality: 0.95,
      interiority: 0.6,
      violence: 0.1,
      resolutionPressure: 0.2,
      literalism: 0.2,
      enclosureAffinity: 0.1,
      boundaryType: "open",
      boundarySalience: 0.05,
    },
    literalMeaning: "Empty; a void.",
    centralIdea: "Emptiness is a positive quantity: it has to be authored.",
    dramaticQuestion: "How much can be removed before the frame stops being a frame?",
    spatialMetaphor: "An unbounded field with no scale reference.",
    constraints: ["the frame must be capable of being counted, not merely dark"],
    // Emptiness describes the frame, not the drama.
    drives: {
      arcShape: 0, temporal: 0, presence: 0.3, reachability: 0,
      embodiment: 0, cardinality: 0, tempo: 0,
      spatiality: 1, interiority: 0.3, violence: 0.1,
      resolutionPressure: 0.2, literalism: 0.3,
      // A void actively DENIES enclosure, so it must be able to vote it down.
      enclosureAffinity: 1,
    },
    oppositions: [
      {
        a: "absence",
        b: "the authored absence",
        staging: "The void is shown to be a decision by the presence of exactly one mark.",
        resolvedToward: "b",
      },
    ],
    motifs: [
      {
        id: "the-unmarked-field",
        meaning: "space that has not been given meaning yet",
        role: "environment",
        visualHint: "an almost entirely blank frame",
        introducedAt: 0,
      },
    ],
  },

  // -------------------------------------------------------------------------
  // 男人 / woman / a person  (embodiment marker)
  // -------------------------------------------------------------------------
  {
    id: "a-person",
    role: "modifier",
    triggers: ["男人", "女人", "他", "她", "一个人", "a man", "a woman", "he ", "she ", "someone", "a person", "figure"],
    features: {
      arcShape: "rise",
      temporal: "single-event",
      presence: "present",
      reachability: "reachable",
      embodiment: "bodily",
      cardinality: "singular",
      tempo: "measured",
      spatiality: 0.4,
      interiority: 0.45,
      violence: 0.3,
      resolutionPressure: 0.6,
      literalism: 0.65,
      enclosureAffinity: 0.35,
      boundaryType: "container",
      boundarySalience: 0.2,
    },
    literalMeaning: "A person.",
    centralIdea: "A body in a space is the minimum unit of narrative.",
    dramaticQuestion: "What does this body want from this space?",
    spatialMetaphor: "A body with a position and a direction.",
    constraints: ["a body must be present in the frame at least once"],
    // A person contributes embodiment and literalism; it must not vote on whether the
    // film's subject is present (that is the theme's claim) nor on its shape.
    drives: {
      arcShape: 0, temporal: 0, presence: 0, reachability: 0.3,
      embodiment: 1, cardinality: 0.6, tempo: 0.5,
      spatiality: 0.4, interiority: 0.4, violence: 0.4,
      resolutionPressure: 0.4, literalism: 1,
    },
    oppositions: [
      {
        a: "the body",
        b: "the space",
        staging: "A humanoid silhouette placed against an authored field.",
        resolvedToward: "neither",
      },
    ],
    motifs: [
      {
        id: "the-body",
        meaning: "the protagonist as a visible occupant of the frame",
        role: "protagonist",
        visualHint: "a humanoid silhouette of soft marks",
        introducedAt: 0.05,
      },
    ],
  },
];

/** Look up a concept by id. Throws if absent, because a silent miss hides a typo. */
export function conceptById(id: string): Concept {
  const c = CONCEPTS.find((x) => x.id === id);
  if (!c) throw new Error(`no such concept: ${id}`);
  return c;
}

/**
 * Fixed precedence for breaking ties between categorical features.
 *
 * Ties MUST NOT be broken by input order: "孤独 欲望" and "欲望 孤独" would then produce
 * different films, which would make the system's behaviour depend on wording rather than
 * meaning. The order below expresses which reading should win when a prompt is genuinely
 * ambiguous.
 */
export const CATEGORY_PRECEDENCE: {
  arcShape: ArcShape[];
  presence: Presence[];
  reachability: Reachability[];
  embodiment: Embodiment[];
  cardinality: Cardinality[];
  tempo: Tempo[];
  boundaryType: BoundaryType[];
} = {
  // Collapse and fall win over rise: a film that destroys something is a stronger
  // commitment than one that builds it, and the stronger reading should survive.
  arcShape: ["collapse", "fall", "wave", "spiral", "rise", "plateau"],
  // Absence is the more specific claim: "a trace" beats "present".
  presence: ["absent", "trace", "present"],
  reachability: ["unreachable", "approached-never-reached", "reachable"],
  embodiment: ["bodily", "collective", "abstract"],
  cardinality: ["dual", "singular", "multiplicitous"],
  tempo: ["erratic", "urgent", "measured", "slow"],
  boundaryType: ["container", "passage", "unbounded", "open"],
};

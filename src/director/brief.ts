/**
 * DIRECTOR-BRIEF parsing.
 *
 * A brief is a different KIND of input from a story. A story says what happens; a brief says
 * what the film must be. The honest response to a brief is to honour it, and the worst
 * response is to accept the label and ignore the content — which is exactly what the first
 * implementation did: `shot 2: 6 seconds, slow push-in` produced neither 6 seconds nor a
 * push-in, while the mode was reported as `director-brief`. A mode that changes nothing is a
 * lie in the report.
 *
 * So this module extracts the declared facts and hands them to the planners as CONSTRAINTS:
 *
 *   - a declared per-shot duration is used instead of the rhythm-derived one;
 *   - a declared camera move is used instead of the derived reason's move, and the shot's
 *     reason is chosen to be one that IMPLIES that move (so the justification stays truthful
 *     rather than being overwritten);
 *   - declared global constraints (silence, no dialogue, no movement) are carried into the
 *     spec so they are auditable.
 *
 * Deliberately conservative: a directive that cannot be parsed is ignored rather than guessed
 * at, and every ignored directive is reported.
 */

import type { BriefShot, DirectorBrief } from "./types.js";
import { MOTION_KINDS, type MotionKind } from "./grammar/vocabulary.js";

/** Words that name a camera move the rig can actually perform. */
const MOVE_PATTERNS: Array<{ re: RegExp; move: string }> = [
  { re: /\bpush[\s-]?in\b|推进|推近/i, move: "push-in" },
  { re: /\bpull[\s-]?out\b|拉远|拉出/i, move: "pull-out" },
  { re: /\blateral\b|横移|平移/i, move: "lateral-right" },
  { re: /\bcrane\s*up\b|升起/i, move: "crane-up" },
  { re: /\bcrane\s*down\b|下降/i, move: "crane-down" },
  { re: /\borbit\b|环绕/i, move: "orbit" },
  { re: /\bhandheld\b|手持/i, move: "handheld" },
  { re: /\bstatic\b|\blocked[\s-]?off\b|\bfixed\b|固定|静止/i, move: "static" },
  // A NEGATED movement is a directive too, and an explicit one. This must be tested before
  // the positive patterns so "no camera movement" is not read as an unspecified shot.
  { re: /\bno\s+(?:camera\s+)?movement\b|\bno\s+camera\s+moves?\b|无镜头运动|镜头不动/i, move: "static" },
  { re: /\bzoom\b|变焦/i, move: "push-in" },
];

const TRANSITION_PATTERNS: Array<{ re: RegExp; kind: string }> = [
  { re: /\bdissolve\b|叠化|溶接/i, kind: "dissolve" },
  { re: /\bfade\b|淡入|淡出/i, kind: "dissolve" },
  { re: /\bcut\b|硬切/i, kind: "cut" },
];

/** Durations: "5 seconds", "5s", "5 秒", "0:05". */
function findDuration(text: string): number | undefined {
  let m = text.match(/(\d+(?:\.\d+)?)\s*(?:seconds?|secs?|s\b|秒)/i);
  if (m) {
    const v = Number(m[1]);
    if (Number.isFinite(v) && v > 0 && v <= 600) return v;
  }
  m = text.match(/^(\d+):(\d{2})$/);
  if (m) {
    const v = Number(m[1]) * 60 + Number(m[2]);
    if (v > 0) return v;
  }
  return undefined;
}

/** Global constraint phrases worth carrying verbatim into the spec. */
const GLOBAL_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /\bno\s+dialogue\b|无对白|没有对白/i, label: "no dialogue" },
  { re: /\bmust\s+be\s+silent\b|\bsilent\b|无声/i, label: "must be silent" },
  { re: /\bno\s+(?:music|score)\b|无配乐/i, label: "no music" },
  { re: /\bno\s+camera\s+movement\b|\bno\s+movement\b|无镜头运动/i, label: "no camera movement" },
  { re: /\bblack\s+and\s+white\b|\bmonochrome\b|黑白/i, label: "monochrome" },
  { re: /\bno\s+text\b|\bno\s+on[\s-]?screen\s+text\b|无字幕/i, label: "no on-screen text" },
];

/** Split a brief into shot directives. Falls back to the whole text as one directive. */
function splitDirectives(raw: string): string[] {
  const byShot = raw
    .split(/(?=\bshot\s*\d+\s*[:.\-])/i)
    .map((s) => s.trim())
    .filter(Boolean);
  if (byShot.length > 1) return byShot;
  const bySentence = raw
    .split(/(?<=[。！？!?;；])\s*|(?<=\.)\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return bySentence.length > 0 ? bySentence : [raw.trim()];
}

/** Parse a brief. Returns undefined when the input carries no usable directive. */
export function parseDirectorBrief(raw: string): DirectorBrief | undefined {
  const directives = splitDirectives(raw);
  const shots: BriefShot[] = [];

  directives.forEach((text, i) => {
    const indexMatch = text.match(/\bshot\s*(\d+)/i);
    const index = indexMatch ? Number(indexMatch[1]) : i + 1;
    const duration = findDuration(text);
    let cameraKind: string | undefined;
    for (const { re, move } of MOVE_PATTERNS) {
      if (re.test(text)) {
        cameraKind = move;
        break;
      }
    }
    let transition: string | undefined;
    for (const { re, kind } of TRANSITION_PATTERNS) {
      if (re.test(text)) {
        transition = kind;
        break;
      }
    }
    if (duration === undefined && cameraKind === undefined && transition === undefined) return;
    shots.push({ index, duration, cameraKind, transition, raw: text });
  });

  if (shots.length === 0) return undefined;
  shots.sort((a, b) => a.index - b.index);

  const globalConstraints: string[] = [];
  for (const { re, label } of GLOBAL_PATTERNS) {
    if (re.test(raw) && !globalConstraints.includes(label)) globalConstraints.push(label);
  }

  const everyShotTimed = shots.every((s) => s.duration !== undefined);
  const declaredTotalDuration = everyShotTimed ? shots.reduce((a, s) => a + (s.duration ?? 0), 0) : undefined;

  return { shots, globalConstraints, declaredTotalDuration };
}

/**
 * The camera reasons that legitimately IMPLY a given move.
 *
 * Used so a brief's declared move is honoured by selecting a true justification rather than by
 * overwriting the reason. A film whose camera reason says "the subject carries all the change"
 * while the camera pushes in is lying, and that lie is precisely what a brief implementation
 * must avoid.
 */
export const REASONS_IMPLYING_MOVE: Record<string, string[]> = {
  "push-in": ["increase-psychological-pressure", "approach-inaccessible-object", "reveal-density", "immerse-in-field"],
  "pull-out": ["reveal-context", "withdraw-from-absence"],
  "lateral-right": ["traverse-depth-layers", "track-subject"],
  "lateral-left": ["traverse-depth-layers", "track-subject"],
  "crane-up": ["diminish-subject"],
  "crane-down": ["meet-subject"],
  orbit: ["interrogate-subject"],
  handheld: ["destabilise-frame"],
  static: ["hold-observation", "withdraw-from-absence"],
  // `hold-observation` is the only honest reason for a camera that does not move, so a
  // declared "no camera movement" always resolves to it.
  none: ["hold-observation"],
};

/** Narrow an arbitrary string to a MotionKind, or undefined. */
export function asMotionKind(v: string): MotionKind | undefined {
  return (MOTION_KINDS as readonly string[]).includes(v) ? (v as MotionKind) : undefined;
}

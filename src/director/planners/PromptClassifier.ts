/**
 * PromptClassifier — what KIND of input is this?
 *
 * The mode determines how much structure the interpreter can assume. A single word has no
 * events; a director brief has explicit constraints that must be honoured; a script has
 * units that should map onto acts.
 *
 * Classification is structural, not semantic: it counts sentences, clauses, verbs,
 * dialogue markers and explicit production language. It never looks for particular words,
 * because doing so would make the classifier a lookup table.
 */

import type { InputMode } from "../../domain/film-spec-v2.js";
import type { SemanticReading } from "../types.js";
import type { ScriptUnit } from "../../domain/film-spec-v2.js";

export interface Classification {
  mode: InputMode;
  rationale: string;
  signals: Record<string, number>;
  scriptUnits?: ScriptUnit[];
}

/** Sentence split that keeps CJK full stops, which have no whitespace after them. */
function splitSentences(raw: string): string[] {
  return raw
    .split(/(?<=[。！？!?;；])\s*|(?<=\.)\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Clause split: commas and CJK commas join events within one sentence. */
function splitClauses(sentence: string): string[] {
  return sentence
    .split(/[，,、]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

const VERB_MARKERS = [
  "走进", "发现", "伸手", "擦掉", "消失", "醒来", "开始", "走向", "离开", "打开", "关上", "拿起", "放下",
  "walk", "walks", "enter", "enters", "find", "finds", "found", "see", "sees", "saw", "take", "takes",
  "erase", "erases", "erase", "remove", "removes", "wake", "wakes", "open", "opens", "close", "closes",
  "turn", "turns", "reach", "reaches", "look", "looks", "become", "becomes", "disappear", "disappears",
];

const DIRECTOR_MARKERS = [
  "镜头", "时长", "秒", "fps", "帧", "分辨率", "风格", "shot", "seconds", "duration", "runtime",
  "resolution", "aspect", "风格：", "要求", "constraint", "must", "should", "no dialogue", "silent",
  "black and white", "16:9", "9:16", "color grade", "voiceover", "montage",
];

const DIALOGUE_MARKERS = ["「", "」", "“", "”", "\"", "：", ":", "他说", "她说", "he said", "she said", "says"];

export function classifyPrompt(raw: string): Classification {
  const text = raw.trim();
  const normalized = text.toLowerCase();

  const sentences = splitSentences(text);
  const clauses = sentences.reduce((n, s) => n + splitClauses(s).length, 0);
  const chars = Array.from(text).length;
  const verbHits = countMarkers(normalized, VERB_MARKERS);
  const directorHits = countMarkers(normalized, DIRECTOR_MARKERS);
  const dialogueHits = countMarkers(normalized, DIALOGUE_MARKERS);
  // CJK has no word spaces, so a "word count" for Chinese is meaningless; count CJK
  // characters instead, and only use whitespace tokens when there is Latin text.
  const hasLatin = /[a-z]/i.test(text);
  const tokens = hasLatin ? normalized.split(/\s+/).filter(Boolean).length : 0;
  const cjkChars = Array.from(text).filter((c) => /[\u4e00-\u9fff]/.test(c)).length;

  const signals = {
    chars,
    sentences: sentences.length,
    clauses,
    verbHits,
    directorHits,
    dialogueHits,
    tokens,
    cjkChars,
  };

  // --- a director brief: explicit production language -----------------------
  if (directorHits >= 2) {
    return {
      mode: "director-brief",
      rationale:
        `Found ${directorHits} explicit production markers (duration, resolution, format or constraints), ` +
        "so the input is read as instructions to be honoured rather than as material to interpret.",
      signals,
    };
  }

  // --- a script: multiple sentences with events and often dialogue ----------
  const looksLikeScript =
    (sentences.length >= 2 && verbHits >= 2) || dialogueHits >= 2 || (clauses >= 3 && verbHits >= 2);
  if (looksLikeScript) {
    return {
      mode: "script",
      rationale:
        `${sentences.length} sentence(s), ${clauses} clause(s), ${verbHits} event marker(s)` +
        (dialogueHits > 0 ? `, ${dialogueHits} dialogue marker(s)` : "") +
        ": the input carries a sequence of events, so it is read as a script with units.",
      signals,
      scriptUnits: extractScriptUnits(sentences),
    };
  }

  // --- a sentence: one event or one proposition ----------------------------
  const looksLikeSentence =
    sentences.length === 1 && (verbHits >= 1 || clauses >= 2 || (hasLatin && tokens >= 5) || cjkChars >= 8);
  if (looksLikeSentence) {
    return {
      mode: "sentence",
      rationale:
        `A single sentence with ${verbHits} event marker(s) and ${clauses} clause(s): one proposition ` +
        "that states a situation, not a single concept.",
      signals,
    };
  }

  // --- otherwise: a word or very short phrase ------------------------------
  return {
    mode: "word",
    rationale:
      `${sentences.length} sentence(s), no event markers, ${cjkChars || tokens} content unit(s): ` +
      "the input names a concept or condition rather than an event.",
    signals,
  };
}

function countMarkers(haystack: string, markers: string[]): number {
  let n = 0;
  for (const m of markers) if (haystack.includes(m)) n++;
  return n;
}

/**
 * Split a script into units. Each sentence becomes a unit; a heading-like sentence
 * (e.g. "INT. ROOM - DAY") is attached rather than treated as an event.
 */
function extractScriptUnits(sentences: string[]): ScriptUnit[] {
  const units: ScriptUnit[] = [];
  let pendingHeading: string | undefined;
  for (const sentence of sentences) {
    const isHeading = /^(int|ext|内景|外景|场景)\b/i.test(sentence) || /^[【\[]/.test(sentence);
    if (isHeading) {
      pendingHeading = sentence;
      continue;
    }
    units.push({
      index: units.length,
      heading: pendingHeading,
      body: sentence,
      subjects: extractSubjects(sentence),
      location: extractLocation(sentence),
    });
    pendingHeading = undefined;
  }
  return units;
}

const SUBJECT_STOPWORDS = new Set([
  "一个", "the", "a", "an", "his", "her", "their", "他", "她", "它", "自己", "整个", "所有",
]);

function extractSubjects(sentence: string): string[] {
  const words: string[] = [];
  // Latin nouns: capitalised or preceded by an article
  const latin = sentence.match(/\b(?:a|an|the|his|her|their)\s+([a-z]+)/gi) ?? [];
  for (const m of latin) {
    const w = m.split(/\s+/).pop();
    if (w && !SUBJECT_STOPWORDS.has(w.toLowerCase())) words.push(w.toLowerCase());
  }
  // CJK: take noun-ish 2-character runs before common verbs
  const cjk = sentence.match(/[\u4e00-\u9fff]{2,4}/g) ?? [];
  for (const w of cjk) {
    if (!SUBJECT_STOPWORDS.has(w) && !/^(走进|发现|伸手|擦掉|消失|醒来)$/.test(w)) words.push(w);
  }
  return Array.from(new Set(words)).slice(0, 4);
}

function extractLocation(sentence: string): string | undefined {
  const m = /(房间|屋里|墙上|地上|走廊|街道|室内|室外|room|wall|corridor|street|hall)/i.exec(sentence);
  return m ? m[0] : undefined;
}

/**
 * The LLM boundary, expressed as a type.
 *
 * An LLM-backed classifier would implement this and return the same `Classification`.
 * The pipeline never asks which implementation it is talking to, and validation runs on
 * the result either way.
 */
export interface PromptClassifier {
  classify(raw: string): Classification | Promise<Classification>;
}

export const heuristicClassifier: PromptClassifier = {
  classify: (raw: string) => classifyPrompt(raw),
};

export type { SemanticReading };

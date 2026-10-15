/**
 * THE CJK INTERFACE.
 *
 * THE PROBLEM THIS EXISTS TO FIX. This engine's films are driven by Chinese prompts, and its subject
 * words were being rendered from an ENGLISH KEBAB-CASE SLUG of the motif's meaning. A film prompted
 * with `我醒来以后，发现所有人都忘记了我的名字。` therefore rendered the literal text
 * `THE LEGIBLE WORD` — an English placeholder spelling out an internal identifier, presented in the
 * frame as if it were the film's subject word.
 *
 * That is the exact failure the Phase 3 brief names: *no silent pretend-Chinese rendering*. It is
 * worse than rendering nothing, because it looks deliberate.
 *
 * WHAT IS HONEST HERE. The typeface covers ASCII 0x20-0x7E. There is no Han glyph table and building
 * one is out of scope, so a Chinese character CANNOT be drawn as itself. The brief permits two
 * truthful alternatives — *symbolic or transliteration* — and this module implements the symbolic
 * one:
 *
 *   - every character of the source text is accounted for, by codepoint
 *   - each one maps DETERMINISTICALLY to a printable ASCII mark, so the same character always looks
 *     the same and different characters generally look different
 *   - the mark is drawn as a glyph placement, so it flows through the existing native-object and
 *     typography pipeline with no special casing in the renderer
 *   - nothing is ever silently dropped, and nothing is ever replaced by an English word
 *
 * WHAT IT IS NOT. It is not a claim to render Chinese. The frame shows a *symbol* for the character;
 * a reader of Chinese would not read it. The determinism is what makes it usable as a device — a
 * recurring character recurs visually — and `describeCJK` exists so the system can say plainly what
 * it did.
 */

/** Is this a character the ASCII typeface cannot draw? */
export function isNonAscii(ch: string): boolean {
  return ch.charCodeAt(0) > 0x7e;
}

/** CJK ideographs, kana, and CJK punctuation — the ranges a Chinese prompt actually uses. */
export function isCJK(ch: string): boolean {
  const c = ch.codePointAt(0) ?? 0;
  return (
    (c >= 0x3400 && c <= 0x4dbf) || // CJK Extension A
    (c >= 0x4e00 && c <= 0x9fff) || // CJK Unified Ideographs
    (c >= 0xf900 && c <= 0xfaff) || // CJK Compatibility Ideographs
    (c >= 0x3040 && c <= 0x30ff) || // kana
    (c >= 0x3000 && c <= 0x303f) || // CJK punctuation
    (c >= 0xff00 && c <= 0xffef) // fullwidth forms
  );
}

/**
 * The ASCII marks a CJK character may become.
 *
 * Chosen as a STRUCTURAL set: strokes, joints and enclosures, which is what a Han character is made
 * of. That keeps a Chinese subject visually distinct from a Latin one — a Latin word renders as its
 * own letters, a Chinese word renders as a lattice of structural marks.
 */
const MARKS = "|-+/\\<>[]{}()=*:.^~#_";

/**
 * A deterministic ASCII mark for a character.
 *
 * Deterministic by construction: the same character always yields the same mark, so a character
 * recurring in a title recurs in the frame. Uses the full codepoint, not the low byte, so distinct
 * characters do not collide through truncation.
 */
export function symbolFor(ch: string): string {
  const c = ch.codePointAt(0) ?? 0;
  // a cheap deterministic mix so neighbouring codepoints do not walk the mark set in lockstep
  const h = (Math.imul(c ^ 0x9e37, 0x85ebca6b) ^ Math.imul(c + 1, 0xc2b2ae35)) >>> 0;
  return MARKS[h % MARKS.length]!;
}

export interface PreparedText {
  /** what will actually be drawn, as printable ASCII */
  rendered: string;
  /** the original characters, so nothing is lost from the record */
  source: string;
  /** how many source characters could not be drawn as themselves */
  substituted: number;
  /** true when the text needed the symbolic path at all */
  symbolic: boolean;
}

/**
 * Prepare a piece of authored text for the typeface.
 *
 * ASCII passes through unchanged, because an English word should still read as English. Anything
 * else is substituted character-for-character by `symbolFor` — never dropped, never replaced by a
 * different word.
 */
export function prepareText(source: string): PreparedText {
  let rendered = "";
  let substituted = 0;
  for (const ch of source) {
    if (!isNonAscii(ch)) {
      rendered += ch;
      continue;
    }
    if (ch === "\n") {
      rendered += "\n";
      continue;
    }
    rendered += symbolFor(ch);
    substituted++;
  }
  return { rendered, source, substituted, symbolic: substituted > 0 };
}

/**
 * A plain-language statement of what happened, for logs and for the film report.
 *
 * The brief requires that the director still works and that nothing pretends. Reporting is how a
 * caller can tell a symbolic rendering from a real one without inspecting the frame.
 */
export function describeCJK(source: string): string {
  const p = prepareText(source);
  if (!p.symbolic) return `"${source}" is drawn as itself (all ${source.length} characters are ASCII).`;
  const han = Array.from(source).filter(isCJK).length;
  return (
    `"${source}" contains ${han} CJK character(s) the ASCII typeface cannot draw. ` +
    `${p.substituted} of ${Array.from(source).length} character(s) are shown as deterministic ` +
    `symbols (${[...new Set(Array.from(source).filter(isNonAscii).map(symbolFor))].join(" ")}); ` +
    `the remainder pass through unchanged. This is a SYMBOLIC rendering, not a Han glyph.`
  );
}

// ---------------------------------------------------------------------------
// source-text subject words
// ---------------------------------------------------------------------------

/**
 * Candidate SUBJECT WORDS drawn from the user's own prompt.
 *
 * WHY FROM THE PROMPT AND NOT FROM THE MOTIF. The motif's `id` is an English kebab-case slug and its
 * `meaning` is an English phrase, because that is what the concept knowledge base is keyed by. Using
 * either as a subject's displayed word is what produced `THE LEGIBLE WORD` in a film prompted in
 * Chinese. The only place the user's actual words exist is the prompt itself, so that is where a
 * displayed word must come from.
 *
 * This is a TEXT-SOURCE change, not an interpretation change: nothing about which motifs exist, what
 * they mean, or how they are planned is touched. It only decides which characters are drawn when a
 * subject is a word.
 *
 * CJK runs are kept whole, because Chinese has no word spaces and splitting a run would invent word
 * boundaries the language does not mark. Latin runs are split on whitespace and punctuation.
 */
export function subjectWordsFrom(source: string, limit = 8): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  // CJK runs, CHUNKED. A whole run would be a dozens-of-characters span in the frame — the prompt
  // `我醒来以后，发现所有人都忘记了我的名字。` has runs far too long to read as one word. Chinese
  // marks no word boundaries, so any split is a choice; 3 characters is short enough to render as a
  // legible mark-group and long enough to carry a compound.
  const CJK_CHUNK = 3;
  for (const run of source.match(/[\u3400-\u9fff\u3040-\u30ff\uf900-\ufaff]+/g) ?? []) {
    for (let i = 0; i < run.length; i += CJK_CHUNK) {
      const chunk = run.slice(i, i + CJK_CHUNK);
      if (chunk.length > 0 && !seen.has(chunk)) {
        seen.add(chunk);
        out.push(chunk);
      }
    }
  }

  // Latin words, so an English prompt behaves as before
  for (const w of source.toLowerCase().match(/[a-z][a-z']{2,}/g) ?? []) {
    if (!seen.has(w)) {
      seen.add(w);
      out.push(w.toUpperCase());
    }
  }

  return out.slice(0, limit);
}

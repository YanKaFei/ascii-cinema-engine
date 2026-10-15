/**
 * THE CJK INTERFACE (Phase 3 gate 7).
 *
 * The brief requires: *no silent pretend-Chinese-glyph rendering; symbolic or transliteration
 * allowed, director still works.*
 *
 * These tests pin the two halves of that. The NEGATIVE half is the one that was failing in practice:
 * a film prompted in Chinese used to render `THE LEGIBLE WORD` — an English kebab-case slug of an
 * internal motif id, presented in the frame as the subject's word. These tests assert that a
 * non-ASCII character is never dropped, never silently becomes a different English word, and never
 * claims to be a Han glyph.
 */

import { suite, test, ok, eq } from "../_harness/harness.js";
import {
  prepareText,
  symbolFor,
  isCJK,
  isNonAscii,
  describeCJK,
  subjectWordsFrom,
} from "../../src/ascii/cjk.js";

const CJK_PROMPT = "我醒来以后，发现所有人都忘记了我的名字。";

suite("CJK: nothing is dropped and nothing pretends", () => {
  test("every source character is accounted for, none silently vanishes", () => {
    const p = prepareText(CJK_PROMPT);
    // one output character per input character (no newlines in this prompt)
    eq(Array.from(p.rendered).length, Array.from(CJK_PROMPT).length, "output length equals input length");
    eq(p.substituted, Array.from(CJK_PROMPT).filter(isCJK).length, "every CJK character was substituted");
  });

  test("the result is always printable ASCII", () => {
    for (const src of [CJK_PROMPT, "孤独", "時間", "日本語", "名字 name", "", "ABC"]) {
      const p = prepareText(src);
      for (const ch of p.rendered) {
        const c = ch.charCodeAt(0);
        ok(c === 10 || (c >= 32 && c <= 126), `"${src}" -> ${JSON.stringify(p.rendered)} is printable ASCII`);
      }
    }
  });

  test("substitution is DETERMINISTIC, so a recurring character recurs", () => {
    // the property that makes the symbolic path usable as a device
    for (const ch of ["孤", "独", "我", "名", "字", "一"]) {
      eq(symbolFor(ch), symbolFor(ch), `${ch} maps to a stable mark`);
    }
    eq(prepareText("孤独孤独").rendered, prepareText("孤独孤独").rendered, "the same text renders identically");
    // and the first half of a repeated run equals the second half
    const rep = prepareText("孤独孤独").rendered;
    eq(rep.slice(0, 2), rep.slice(2), "a repeated pair renders as a repeated pair");
  });

  test("different characters mostly differ, so the marks carry information", () => {
    const chars = Array.from(new Set(Array.from(CJK_PROMPT).filter(isCJK)));
    const marks = new Set(chars.map(symbolFor));
    ok(chars.length > 8, `the prompt has ${chars.length} distinct CJK characters`);
    ok(marks.size > 4, `they map to ${marks.size} distinct marks (not all identical)`);
  });

  test("Latin text passes through untouched, because English should read as English", () => {
    for (const src of ["NAME", "the name", "A B C", "hello, world"]) {
      eq(prepareText(src).rendered, src, `"${src}" is unchanged`);
      eq(prepareText(src).substituted, 0, `"${src}" needed no substitution`);
      eq(prepareText(src).symbolic, false, `"${src}" is not symbolic`);
    }
  });
});

suite("CJK: the director still works", () => {
  test("subject words come from the USER'S prompt, not an English slug", () => {
    const words = subjectWordsFrom(CJK_PROMPT);
    ok(words.length > 0, `the prompt yields subject words (${words.length})`);
    for (const w of words) {
      // every word must be CJK, never a kebab-case english identifier
      ok(/[\u3400-\u9fff]/.test(w), `${JSON.stringify(w)} is Chinese, not an English slug`);
      ok(!/^[a-z]+(-[a-z]+)+$/.test(w), `${JSON.stringify(w)} is not a kebab-case slug`);
    }
    // the specific regression: this phrase must never appear
    const joined = words.join(" ");
    ok(!/THE LEGIBLE WORD/i.test(joined), "the English placeholder never appears");
  });

  test("CJK runs are chunked to a renderable size", () => {
    const words = subjectWordsFrom(CJK_PROMPT);
    for (const w of words) {
      ok(Array.from(w).length <= 3, `${JSON.stringify(w)} is at most 3 characters`);
      ok(Array.from(w).length > 0, "and non-empty");
    }
  });

  test("an English prompt still yields English words", () => {
    const words = subjectWordsFrom("a man walks into an empty room and erases his name");
    ok(words.length > 0, "words were found");
    ok(words.every((w) => /^[A-Z']+$/.test(w)), `all words are uppercase latin (${words.join(",")})`);
  });

  test("describeCJK says plainly whether a rendering is symbolic", () => {
    ok(/SYMBOLIC/.test(describeCJK("孤独")), "Chinese is reported as symbolic");
    ok(!/SYMBOLIC/.test(describeCJK("NAME")), "ASCII is not");
    ok(/cannot draw/.test(describeCJK("孤独")), "and it states the limitation rather than claiming success");
  });
});

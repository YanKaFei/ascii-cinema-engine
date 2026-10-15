# ADR 0002 — The CJK interface

**Status:** accepted · **Date:** Phase 3, round 31

## Context

Every benchmark film in this project is driven by a **Chinese** prompt. The typeface covers ASCII
`0x20-0x7E` and there is no Han glyph table. The brief for this phase states the requirement
directly:

> CJK interface designed (no silent pretend-Chinese-glyph rendering; symbolic or transliteration
> allowed, director still works)

An audit found the system was violating the first clause, and in the worst available way.

## What was actually happening

A subject's displayed word came from its motif:

```ts
text: m.id.replace(/-/g, " ").toUpperCase()
```

`m.id` is a **kebab-case English identifier** from the concept knowledge base. So a film prompted with
`我醒来以后，发现所有人都忘记了我的名字。` rendered the literal text:

```
THE LEGIBLE WORD
```

An internal identifier, spelled out in English, placed in the frame where the film's Chinese subject
word should be. **This is worse than rendering nothing**, because it is indistinguishable from a
deliberate design choice. It was not caught earlier because every check that looked at it was a
shape check — is there text? is it printable ASCII? — and it passed all of them.

## Decision

Two changes, both deliberately narrow.

### 1. A symbolic path, implemented honestly (`src/ascii/cjk.ts`)

Each character outside ASCII maps **deterministically** to a printable ASCII mark drawn from a
structural set (`|-+/\<>[]{}()=*:.^~#_`). Properties:

- one output character per input character, so **nothing is dropped**
- deterministic, so a recurring character recurs visually — this is what makes it usable as a device
- the mark is emitted as a glyph placement, so it flows through the existing native-object and
  typography pipeline with **no special case in the renderer**
- `describeCJK()` states in plain language that the rendering is symbolic and not a Han glyph

This is the "symbolic" alternative the brief permits. **It is not a claim to render Chinese** — a
reader of Chinese would not read it — and the API never presents it as one.

### 2. Subject words come from the user's own prompt

`subjectWordsFrom(prompt)` extracts candidate words from the prompt text. CJK runs are **chunked to 3
characters**, because Chinese marks no word boundaries and a whole run would be a dozens-of-characters
span; any split is a choice, and 3 is short enough to render legibly and long enough to carry a
compound. Latin prompts behave exactly as before.

This is a **text-source change, not an interpretation change**: nothing about which motifs exist, what
they mean, or how they are planned is touched. The Phase 3 prohibition on expanding the Director
Agent's semantic layer is respected.

## Consequences

- A Chinese-prompted film now renders the user's actual characters, symbolically.
- The metrics are **byte-identical** before and after (mean ink, near-white, midtones), which is the
  evidence that this changed only *which characters* are drawn and not the rendering.
- The director still works for Chinese prompts; classification, motif planning and camera planning
  are untouched.
- **Residual limitation, stated plainly:** a Chinese subject does not read as Chinese. Building a Han
  glyph table is out of scope for this phase. The system reports this rather than hiding it.

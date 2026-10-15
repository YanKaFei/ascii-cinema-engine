#!/usr/bin/env node
/**
 * LAYER TIMING CONSUMPTION TESTS.
 *
 * ⚠ THE DEFECT THESE EXIST FOR. R2 declared `LayerTiming`, compiled it onto `CompiledShotSpec.layers`, and
 * **the compositor never read it** — a `framesInShot`-shaped value was passed in and ignored, so a layer whose
 * interval had ended still drew pixels. **A declaration plus a compilation check is not consumption.**
 *
 * The interval is **half-open `[fromFrame, toFrame)`**, and all five boundary positions are pinned below.
 */
const ROOT = decodeURIComponent(new URL('../../', import.meta.url).pathname);
const L = await import(ROOT + 'dist/src/v4/layers.js');
const C = await import(ROOT + 'dist/src/v4/compositor.js');
const M = await import(ROOT + 'dist/src/design/material.js');

let pass = 0, fail = 0;
const ok = (c, n, d = '') => { if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}${d ? `  (${d})` : ''}`); } };
const throws = (fn, n) => { try { fn(); fail++; console.log(`  FAIL  ${n} — it was ALLOWED`); } catch (e) { pass++; console.log(`  PASS  ${n}`); } };

console.log('LAYER TIMING — BOUNDARY POSITIONS (half-open [from, to))\n');
{
  const t = { fromFrame: 10, toFrame: 20 };
  const at = (f) => L.layerActivityAt(t, f);
  ok(at(9).active === false, 'BEFORE START (frame 9): inactive');
  ok(at(10).active === true, 'AT START (frame 10): ACTIVE — the interval is inclusive at the start');
  ok(at(15).active === true, 'BEFORE END (frame 15): active');
  ok(at(19).active === true, 'the last active frame (19): active');
  ok(at(20).active === false, 'AT END (frame 20): INACTIVE — the interval is exclusive at the end');
  ok(at(21).active === false, 'AFTER END (frame 21): inactive');
  console.log('');
  ok(at(9).reason.includes('before'), `inactive reasons are explicit: "${at(9).reason}"`);
  ok(at(20).reason.includes('half-open'), `and the end reason names the convention: "${at(20).reason}"`);
}

console.log('\nNO TIMING DECLARED = ACTIVE FOR THE WHOLE SHOT\n');
{
  ok(L.layerActivityAt(undefined, 0).active === true, 'frame 0 with no timing: active');
  ok(L.layerActivityAt(undefined, 99999).active === true, 'frame 99999 with no timing: still active (the legacy path)');
  ok(L.layerActivityAt(undefined, 0).reason.includes('whole shot'), 'and it says so');
}

console.log('\nFADE — declared, compiled AND consumed\n');
{
  const t = { fromFrame: 0, toFrame: 100, fadeIn: 9, fadeOut: 9 };
  ok(L.layerActivityAt(t, 0).opacity < 1, `fadeIn reduces coverage at the head (${L.layerActivityAt(t, 0).opacity})`);
  ok(L.layerActivityAt(t, 50).opacity === 1, 'the middle is at full coverage');
  ok(L.layerActivityAt(t, 99).opacity < 1, `fadeOut reduces coverage at the tail (${L.layerActivityAt(t, 99).opacity})`);
  const o = [0, 3, 6, 9].map((f) => L.layerActivityAt(t, f).opacity);
  ok(o[0] < o[1] && o[1] < o[2] && o[2] < o[3], `the fade rises monotonically (${o.map((x) => x.toFixed(2)).join(' -> ')})`);
}

console.log('\nINVALID INTERVALS ARE REFUSED\n');
{
  ok(L.validateLayerTiming({ fromFrame: 20, toFrame: 10 }, { layerId: 'X' }).length > 0, 'an inverted interval is rejected');
  ok(L.validateLayerTiming({ fromFrame: 10, toFrame: 10 }, { layerId: 'X' }).length > 0, 'an empty interval [10,10) is rejected');
  ok(L.validateLayerTiming({ fromFrame: NaN }, { layerId: 'X' }).length > 0, 'NaN is rejected');
  ok(L.validateLayerTiming({ fromFrame: 0, toFrame: Infinity }, { layerId: 'X' }).length > 0, 'Infinity is rejected');
  ok(L.validateLayerTiming({ fromFrame: 1.5, toFrame: 10 }, { layerId: 'X' }).length > 0, 'a non-integer frame is rejected');
  ok(L.validateLayerTiming({ fromFrame: 0, toFrame: 10, fadeIn: 20 }, { layerId: 'X' }).length > 0, 'fades longer than the interval are rejected');
  ok(L.validateLayerTiming(undefined, { layerId: 'X', required: true }).length > 0, 'UNDEFINED TIMING IS REJECTED WHEN REQUIRED (the negative-space mask)');
  ok(L.validateLayerTiming(undefined, { layerId: 'X' }).length === 0, 'undefined timing is legal when not required (the legacy path)');
  ok(L.validateLayerTiming({ fromFrame: 0, toFrame: 10 }, { layerId: 'X' }).length === 0, 'a valid interval is accepted');
  throws(() => L.layerActivityAt(undefined, NaN), 'layerActivityAt refuses a non-finite frame rather than guessing');
}

console.log('\nTHE COMPOSITOR OBEYS THE INTERVAL — and covers NOTHING outside it\n');
{
  const mk = (n) => { const cv = new M.Canvas({ cols: 20, rows: 10 }); for (let r = 0; r < 10; r++) for (let c = 0; c < 20; c++) cv.write(c, r, '#', 'figure', 0.9, 5, n); return cv; };
  const intent = { compositionNote: 'timing', layers: [
    { layerId: 'SCENE_LAYER', subjectId: 'room', representationMode: 'SCENE_ASCII', materialId: 'architecture', priority: 10, visible: true },
    { layerId: 'SUBJECT_LAYER', subjectId: 'person', representationMode: 'EDGE_ASCII', materialId: 'figure', priority: 40, visible: true, timing: { fromFrame: 10, toFrame: 20 } },
    { layerId: 'TYPOGRAPHY_LAYER', subjectId: 'name', representationMode: 'TYPOGRAPHIC_GRAPHIC', materialId: 'text', priority: 60, visible: true, timing: { fromFrame: 0, toFrame: 5 } },
    { layerId: 'NEGATIVE_SPACE_MASK', subjectId: 'negative-space', drawsSubjects: ['atmosphere'], representationMode: 'NEGATIVE_SPACE', materialId: 'atmosphere', priority: 0, visible: false, timing: { fromFrame: 0, toFrame: 1 }, clearsSubjects: [] },
  ] };
  const layers = [
    { layerId: 'SCENE_LAYER', subjectId: 'room', canvas: mk('room') },
    { layerId: 'SUBJECT_LAYER', subjectId: 'person', canvas: mk('person') },
    { layerId: 'TYPOGRAPHY_LAYER', subjectId: 'name', canvas: mk('name') },
  ];
  const subjAt = (f) => {
    const r = C.compositeLayers(layers, intent, { frameInShot: f, framesInShot: 100 });
    return r.consumption.find((c) => c.layerId === 'SUBJECT_LAYER').cellsInFinal;
  };
  ok(subjAt(9) === 0, 'frame 9 (before the subject interval): the subject covers 0 cells');
  ok(subjAt(10) > 0, 'frame 10 (at start): the subject covers cells');
  ok(subjAt(19) > 0, 'frame 19 (last active): the subject covers cells');
  ok(subjAt(20) === 0, 'frame 20 (at end): the subject covers 0 cells — the interval is obeyed');
  ok(subjAt(25) === 0, 'frame 25 (after the interval): the subject covers 0 cells');
  const typoAt = (f) => C.compositeLayers(layers, intent, { frameInShot: f, framesInShot: 100 }).consumption.find((c) => c.layerId === 'TYPOGRAPHY_LAYER').cellsInFinal;
  ok(typoAt(4) > 0 && typoAt(5) === 0, 'a DIFFERENT interval on a DIFFERENT layer is obeyed independently');
  const sceneAt = (f) => C.compositeLayers(layers, intent, { frameInShot: f, framesInShot: 100 }).consumption.find((c) => c.layerId === 'SCENE_LAYER').cellsInFinal;
  ok(sceneAt(50) > 0, 'a layer with NO timing keeps drawing outside every other layer\u2019s interval (the legacy path is unaffected)');
  const rec = C.compositeLayers(layers, intent, { frameInShot: 5, framesInShot: 100 }).consumption.find((c) => c.layerId === 'SUBJECT_LAYER');
  ok(rec.timingActive === false && typeof rec.timingReason === 'string' && rec.timingReason.length > 0, `the timing verdict is RECORDED: "${rec.timingReason}"`);
}

console.log('\nNEGATIVE TEST — DISCONNECT THE TIMING CONSUMER AND THE TEST MUST FAIL\n');
{
  /**
   * ⚠ This is the test the brief demands: **deliberately bypass the timing gate and require the suite to catch it.**
   * The gate is simulated by forcing every layer active, which is precisely what R2 did by ignoring the field.
   */
  const mk = () => { const cv = new M.Canvas({ cols: 10, rows: 4 }); for (let r = 0; r < 4; r++) for (let c = 0; c < 10; c++) cv.write(c, r, '#', 'figure', 0.9, 5, 'x'); return cv; };
  const layers = [{ layerId: 'SUBJECT_LAYER', subjectId: 'person', canvas: mk() }];
  const timed = { compositionNote: 'x', layers: [{ layerId: 'SUBJECT_LAYER', subjectId: 'person', representationMode: 'EDGE_ASCII', materialId: 'figure', priority: 40, visible: true, timing: { fromFrame: 10, toFrame: 20 } }] };
  const untimed = { compositionNote: 'x', layers: [{ layerId: 'SUBJECT_LAYER', subjectId: 'person', representationMode: 'EDGE_ASCII', materialId: 'figure', priority: 40, visible: true }] };
  const timedCells = C.compositeLayers(layers, timed, { frameInShot: 25, framesInShot: 100 }).consumption[0].cellsInFinal;
  const disconnected = C.compositeLayers(layers, untimed, { frameInShot: 25, framesInShot: 100 }).consumption[0].cellsInFinal;
  ok(timedCells === 0, 'with timing CONNECTED, frame 25 covers 0 cells');
  ok(disconnected > 0, 'with timing DISCONNECTED, frame 25 covers cells — so the boundary assertion above would FAIL');
  ok(timedCells !== disconnected, 'the two are distinguishable — the test can actually detect the disconnection');
}

console.log('\nTHE MASK IS SUBJECT TO ITS OWN INTERVAL — an inactive eraser must erase nothing\n');
{
  const mk = (ink, dep) => { const cv = new M.Canvas({ cols: 20, rows: 10 }); for (let r = 0; r < 10; r++) for (let c = 0; c < 20; c++) cv.write(c, r, '#', 'architecture', ink, dep, 'x'); return cv; };
  const layers = [{ layerId: 'SCENE_LAYER', subjectId: 'room', canvas: mk(0.9, 6) }, { layerId: 'NEGATIVE_SPACE_MASK', subjectId: 'negative-space', canvas: mk(0.3, 4) }];
  const intent = { compositionNote: 't', layers: [
    { layerId: 'SCENE_LAYER', subjectId: 'room', drawsSubjects: ['room'], representationMode: 'SCENE_ASCII', materialId: 'architecture', priority: 10, visible: true },
    { layerId: 'NEGATIVE_SPACE_MASK', subjectId: 'negative-space', drawsSubjects: ['atmosphere'], representationMode: 'NEGATIVE_SPACE', materialId: 'atmosphere', priority: 0, visible: true, clearsSubjects: ['room', 'atmosphere'], timing: { fromFrame: 10, toFrame: 45 } }] };
  const region = { x0: 0.30, y0: 0.28, x1: 0.72, y1: 0.86, clearsSubjects: ['room', 'atmosphere'] };
  const maskedAt = (f) => C.compositeLayers(layers, intent, { negativeSpace: region, frameInShot: f, framesInShot: 51 }).consumption.find((x) => x.layerId === 'SCENE_LAYER').cellsMasked;
  ok(maskedAt(0) === 0, 'frame 0 (before the mask interval): the mask erases NOTHING');
  ok(maskedAt(9) === 0, 'frame 9 (last frame before start): erases nothing');
  ok(maskedAt(10) > 0, 'frame 10 (at start): the mask erases cells');
  ok(maskedAt(44) > 0, 'frame 44 (last active): erases cells');
  ok(maskedAt(45) === 0, 'frame 45 (at end): erases NOTHING — an inactive eraser is inert');
  ok(maskedAt(50) === 0, 'frame 50 (after end): erases nothing');
  console.log('    ⚠ R2M REGRESSION: in R2.1 development the mask gated its own DRAWING but still cleared cells while');
  console.log('      inactive — 48 cells were erased at frame 0. This test is what caught it.');
}

console.log(`\n${pass}/${pass + fail} assertions pass`);
if (fail) process.exit(1);

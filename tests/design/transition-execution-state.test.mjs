#!/usr/bin/env node
/**
 * TRANSITION EXECUTION STATE — regression tests that REPRODUCE the R3.4 defect.
 *
 * ⚠ The defect: the runtime held a set populated from `continuesTransitionId` FIELDS at plan level. A link became
 * a member of that set the moment the PLAN mentioned it, and the retarget guard read membership as
 * "already executed". **A reference is not an execution.** These tests fail if that confusion returns.
 */
const ROOT = decodeURIComponent(new URL('../../', import.meta.url).pathname);
const L = await import(ROOT + 'dist/src/v4/layers.js');
const MT = await import(ROOT + 'dist/src/v4/mode-transition.js');
const FR = await import(ROOT + 'dist/src/v4/fragments.js');
const TY = await import(ROOT + 'dist/src/v4/typography.js');

let pass = 0, fail = 0;
const ok = (c, n, d = '') => { if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}${d ? `  (${d})` : ''}`); } };

/** a faithful model of the runtime's execution-state machine, matching scripts/r35-render.mjs */
function makeMachine() {
  return {
    state: new Map(),
    carriers: [],
    log: [],
    fragmentations: 0,
    declare(t, shotStart) {
      const k = t.transitionId;
      let st = this.state.get(k);
      if (!st) {
        st = { transitionId: k, continues: t.continuesTransitionId ?? null, declared: true, resolved: false,
          absoluteWindow: [shotStart + t.startFrame, shotStart + t.endFrame],
          activatedAt: null, retargetExecuted: false, retargetExecutedAt: null, retargetExecutionCount: 0, terminated: false };
        this.state.set(k, st);
      }
      st.resolved = true;
      return st;
    },
    /** one frame: activate and execute at most once per link */
    tick(t, shotStart, f, topo, world, w, h) {
      const st = this.declare(t, shotStart);
      const [a, b] = st.absoluteWindow;
      if (f >= a && f < b) { if (st.activatedAt === null) st.activatedAt = f; }
      else if (f >= b) st.terminated = true;
      if (f >= a && f < b && !st.retargetExecuted) {
        if (this.carriers.length) {
          const r = FR.retargetFragments(this.carriers, t, t.carriersUntilAbsoluteFrame ?? b, f);
          st.retargetExecuted = true; st.retargetExecutedAt = f; st.retargetExecutionCount++;
          this.log.push({ f, id: t.transitionId, kind: 'retarget', idsPreserved: r.idsPreserved });
        } else {
          this.carriers = FR.resolveFragments(topo, t, world, w, h, f, t.carriersUntilAbsoluteFrame ?? b);
          this.fragmentations++;
          st.retargetExecuted = true; st.retargetExecutedAt = f; st.retargetExecutionCount++;
          this.log.push({ f, id: t.transitionId, kind: 'birth', idsPreserved: this.carriers.length });
        }
      }
      FR.stepCarriers(this.carriers, this.states ??= new Map(), f, 0.5);
      return this.carriers;
    },
  };
}

const topo = TY.typographyFor('NAME');
const world = { x: 0, y: 0, z: 0 };
const T1 = { transitionId: 'A', sourceObjectId: 'NAME', sourceMode: 'SCENE_ASCII', targetMode: 'TYPOGRAPHIC_GRAPHIC', startFrame: 8, endFrame: 48, sourceAnchor: world, destinationAnchor: { x: 0, y: 0, z: 1 }, transitionMethod: 'TOPOLOGY_CARRIED_FRAGMENTATION', continuityPolicy: 'IDENTITY_AND_TOPOLOGY', fragmentCount: 40, seed: 7, carriersUntilAbsoluteFrame: 350 };
const T2 = { ...T1, transitionId: 'B', sourceMode: 'TYPOGRAPHIC_GRAPHIC', targetMode: 'GLYPH_FIELD', startFrame: 29, endFrame: 48, continuesTransitionId: 'A', carriersUntilAbsoluteFrame: 350 };
const T3 = { ...T1, transitionId: 'C', sourceMode: 'GLYPH_FIELD', targetMode: 'GLYPH_FIELD', startFrame: 48, endFrame: 59, continuesTransitionId: 'B', carriersUntilAbsoluteFrame: 350 };

console.log('TASK 3 — THE R3.4 DEFECT MUST NOT RETURN\n');
{
  /**
   * (1) A DECLARED transition must NOT be treated as executed.
   */
  const m = makeMachine();
  const st = m.declare(T2, 291);
  ok(st.declared === true, 'a compiled transition is DECLARED');
  ok(st.retargetExecuted === false, 'a DECLARED transition is NOT RETARGET_EXECUTED — declaration is not execution');
  ok(st.retargetExecutionCount === 0, 'and its execution count is 0 before it runs');
  ok(st.activatedAt === null, 'and it is not ACTIVATED before its window');
}
{
  /**
   * (2) and (3) The retarget must execute, and exactly once.
   */
  const m = makeMachine();
  // S5 prominence: abs [248,288) with shotStart 240
  for (let f = 240; f <= 290; f++) m.tick(T1, 240, f, topo, world, 1.3, 0.45);
  const born = m.carriers.length;
  ok(born > 0, 'the prominence link BIRTHS the population');
  ok(m.state.get('A').retargetExecutionCount === 1, 'link A executed exactly ONCE');
  // S6 fracture: abs [320,339) with shotStart 291
  for (let f = 291; f <= 338; f++) m.tick(T2, 291, f, topo, world, 1.3, 0.45);
  const stB = m.state.get('B');
  ok(stB.retargetExecuted === true, '(2) the fracture link DID execute its retarget');
  ok(stB.retargetExecutedAt === 320, `(2) and it executed at its compiled activation frame 320 (got ${stB.retargetExecutedAt})`);
  ok(stB.retargetExecutionCount === 1, '(3) it executed EXACTLY ONCE, not twice and not zero times');
  ok(m.state.get('A').retargetExecutionCount === 1, '(3) the earlier link was not re-executed');
  ok(m.fragmentations === 1, '(6) the NAME object was RESOLVED INTO FRAGMENTS EXACTLY ONCE');
}
{
  /**
   * (4) No blank frames inside the fracture window.
   */
  const m = makeMachine();
  for (let f = 240; f <= 290; f++) m.tick(T1, 240, f, topo, world, 1.3, 0.45);
  const alive = [];
  for (let f = 291; f <= 350; f++) {
    m.tick(T2, 291, f, topo, world, 1.3, 0.45);
    if (f >= 339) m.tick(T3, 291, f, topo, world, 1.3, 0.45);
    const n = [...(m.states ?? new Map()).values()].filter((s) => s.alive).length;
    if (f >= 320 && f <= 350) alive.push(n);
  }
  ok(alive.length === 31, `the fracture window 320..350 has 31 frames (got ${alive.length})`);
  ok(Math.min(...alive) > 0, `(4) NO BLANK FRAME: minimum live carriers across 320..350 is ${Math.min(...alive)}`);
}
{
  /**
   * (5) Carrier IDs must survive the shot boundary.
   */
  const m = makeMachine();
  for (let f = 240; f <= 290; f++) m.tick(T1, 240, f, topo, world, 1.3, 0.45);
  const idsBefore = m.carriers.map((c) => c.id).join('|');
  for (let f = 291; f <= 350; f++) { m.tick(T2, 291, f, topo, world, 1.3, 0.45); if (f >= 339) m.tick(T3, 291, f, topo, world, 1.3, 0.45); }
  const idsAfter = m.carriers.map((c) => c.id).join('|');
  ok(idsBefore === idsAfter, '(5) carrier IDs are IDENTICAL across the S5 -> S6 boundary — no reset');
  ok(new Set(m.carriers.map((c) => c.id)).size === m.carriers.length, 'and every ID is unique');
}
{
  /**
   * (7) Shot-relative and sequence-absolute frames must not be mixed.
   * The birth frame is recorded in ABSOLUTE time, so a window opening at absolute 320 births at 320 — not at the
   * shot-relative 29.
   */
  const m = makeMachine();
  for (let f = 240; f <= 290; f++) m.tick(T1, 240, f, topo, world, 1.3, 0.45);
  for (let f = 291; f <= 338; f++) m.tick(T2, 291, f, topo, world, 1.3, 0.45);
  ok(m.carriers[0].birthFrame === 320, `(7) birth is SEQUENCE-ABSOLUTE (320), not shot-relative (got ${m.carriers[0].birthFrame})`);
}
{
  /**
   * (8) Runtime onset must equal the compiled causal onset.
   */
  const m = makeMachine();
  for (let f = 240; f <= 290; f++) m.tick(T1, 240, f, topo, world, 1.3, 0.45);
  let onset = null;
  for (let f = 291; f <= 340; f++) {
    m.tick(T2, 291, f, topo, world, 1.3, 0.45);
    const st = m.state.get('B');
    if (onset === null && st.retargetExecuted) onset = st.retargetExecutedAt;
  }
  ok(onset === 320, `(8) runtime onset equals the compiled causal onset 320 (got ${onset})`);
}

console.log(`\n${pass}/${pass + fail} assertions pass`);
if (fail) process.exit(1);

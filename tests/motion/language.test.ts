/**
 * THE MOTION LANGUAGE (Phase 3 gate 10).
 *
 * These curves are the vocabulary a camera move is written in. The properties tested here are the
 * ones that make them SUBSTITUTABLE for one another: every easing is a pure function of a 0..1
 * progress with f(0)=0 and f(1)=1, so any of them can replace any other without a caller changing.
 * A curve that failed that contract would leave a move unfinished or jump at its start.
 */

import { suite, test, ok, near, eq } from "../_harness/harness.js";
import { ease, anticipate, stagger, settle } from "../../src/core/easing.js";
import type { Easing } from "../../src/domain/schema.js";

const ORIGINAL: Easing[] = ["linear", "easeIn", "easeOut", "easeInOut", "easeOutExpo"];
const CINEMATIC: Easing[] = [
  "easeInCubic", "easeOutCubic", "easeInOutCubic", "easeInQuart", "easeOutQuint",
  "easeOutBack", "easeInOutBack", "easeOutElastic", "easeOutBounce",
];
const ALL = [...ORIGINAL, ...CINEMATIC];

suite("motion language: every easing honours the substitution contract", () => {
  test("f(0) = 0 and f(1) = 1 exactly", () => {
    for (const k of ALL) {
      near(ease(k, 0), 0, 1e-9, `${k}(0) is 0`);
      near(ease(k, 1), 1, 1e-9, `${k}(1) is 1`);
    }
  });

  test("progress is monotone in t for the non-overshooting curves", () => {
    // Overshoot curves are EXCLUDED BY DESIGN: `easeOutBack` and `easeOutElastic` pass their target
    // and come back, which is the whole point of them.
    // Overshoot AND bounce are excluded by design: `easeOutBack`/`easeInOutBack`/`easeOutElastic`
    // pass their target and come back, and `easeOutBounce` arrives through a series of diminishing
    // contacts, so it is explicitly non-monotone. Testing them for monotonicity would be testing
    // that the feature is absent.
    const NON_MONOTONE = new Set(["easeOutBack", "easeInOutBack", "easeOutElastic", "easeOutBounce"]);
    const monotone = ALL.filter((k) => !NON_MONOTONE.has(k));
    for (const k of monotone) {
      let prev = -Infinity;
      let okSoFar = true;
      for (let i = 0; i <= 100; i++) {
        const v = ease(k, i / 100);
        if (v < prev - 1e-9) okSoFar = false;
        prev = v;
      }
      ok(okSoFar, `${k} never goes backwards`);
    }
  });

  test("the original five are unchanged in value, because Phase 1 is byte-frozen against them", () => {
    // pinned literal values: if any of these move, the frozen film moves
    near(ease("linear", 0.5), 0.5, 1e-12, "linear");
    near(ease("easeIn", 0.5), 0.25, 1e-12, "easeIn");
    near(ease("easeOut", 0.5), 0.75, 1e-12, "easeOut");
    near(ease("easeInOut", 0.5), 0.5, 1e-12, "easeInOut");
    near(ease("easeOutExpo", 0.5), 1 - Math.pow(2, -5), 1e-12, "easeOutExpo");
  });

  test("output is clamped to a sane range for every curve", () => {
    for (const k of ALL) {
      for (let i = 0; i <= 100; i++) {
        const v = ease(k, i / 100);
        ok(Number.isFinite(v), `${k} is finite at ${i / 100}`);
        ok(v >= -0.25 && v <= 1.45, `${k} stays near [0,1] (saw ${v.toFixed(3)})`);
      }
    }
  });

  test("out-of-range progress clamps instead of extrapolating", () => {
    for (const k of ALL) {
      eq(ease(k, -5), ease(k, 0), `${k} clamps below 0`);
      eq(ease(k, 5), ease(k, 1), `${k} clamps above 1`);
    }
  });
});

suite("motion language: anticipation, stagger, settle", () => {
  test("ANTICIPATION pulls back before it moves forward", () => {
    // the defining property: early progress is BELOW the un-anticipated curve
    let dipped = false;
    for (let i = 1; i <= 20; i++) {
      const t = i / 100;
      if (anticipate("easeOut", t) < ease("easeOut", t) - 1e-9) dipped = true;
    }
    ok(dipped, "progress dips below the base curve during the wind-up");
    // and it never exceeds the requested amount
    for (let i = 0; i <= 100; i++) {
      const t = i / 100;
      ok(anticipate("easeOut", t, 0.1) >= ease("easeOut", t) - 0.1 - 1e-9, `dip bounded at t=${t}`);
    }
  });

  test("ANTICIPATION preserves the endpoints", () => {
    near(anticipate("easeOut", 0), 0, 1e-9, "starts at 0");
    near(anticipate("easeOut", 1), 1, 1e-9, "ends at 1");
  });

  test("STAGGER diverges by index but every item still completes", () => {
    // mid-move, later items lag
    const vals = [0, 1, 2, 3, 5].map((i) => stagger("easeOut", 0.5, i));
    for (let i = 1; i < vals.length; i++) {
      ok(vals[i]! < vals[i - 1]!, `item ${i} lags item ${i - 1} mid-move (${vals[i]!.toFixed(3)} < ${vals[i - 1]!.toFixed(3)})`);
    }
    // but the endpoints are untouched for EVERY index, so nothing runs past the end of the shot
    for (const i of [0, 1, 5, 10]) {
      near(stagger("easeOut", 0, i), 0, 1e-9, `item ${i} starts at 0`);
      near(stagger("easeOut", 1, i), 1, 1e-9, `item ${i} ends at 1`);
    }
  });

  test("SETTLE arrives with diminishing excursions and finishes exactly", () => {
    near(settle(0), 0, 1e-9, "starts at 0");
    near(settle(1), 1, 1e-9, "ends exactly at 1");
    // excursion magnitude must decay: the late deviation is smaller than the early one
    const dev = (t: number) => Math.abs(settle(t) - ease("easeOut", t));
    ok(dev(0.2) > dev(0.7), `excursion decays (${dev(0.2).toFixed(4)} > ${dev(0.7).toFixed(4)})`);
  });
});

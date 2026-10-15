#!/usr/bin/env node
/**
 * Phase 2 regression suite.
 *
 *   node dist/tests/regression/index.js
 *
 * Separate from `npm test` (the Phase 1 engine invariants) and from
 * `npm run regression:phase1` (the end-to-end pipeline gate). This suite covers the
 * things Phase 2 introduces that must not silently break:
 *
 *   - FilmSpec v2 validation and the v2 -> v1 round-trip
 *   - the director grammar's closure (an unknown term is an error, not a no-op)
 *   - depth occlusion semantics
 *
 * The Phase 1 byte-identity guarantee lives in v2-roundtrip.test.ts.
 */

import "../regression/v2-roundtrip.test.js";
import "../director/v2-validation.test.js";
import "../director/pipeline.test.js";
import "../depth/occlusion.test.js";
import "../depth/backend.test.js";
import "../ascii/objects.test.js";
import "../ascii/native-render.test.js";
import "../ascii/cjk.test.js";
import "../motion/language.test.js";
import { runAll } from "../_harness/harness.js";

await runAll();

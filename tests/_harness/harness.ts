/**
 * Minimal assertion harness.
 *
 * No test framework: the assertions ARE the contract, and a dependency-free suite can run
 * in CI from `dist/` with no install step. Tests register themselves with `suite()` and
 * `test()`; `runAll()` executes everything and exits non-zero on any failure.
 */

export interface Failure {
  suite: string;
  test: string;
  message: string;
}

interface Registry {
  suites: Map<string, Array<{ name: string; fn: () => void | Promise<void> }>>;
  current: string | null;
  passed: number;
  failures: Failure[];
  notes: string[];
}

const reg: Registry = { suites: new Map(), current: null, passed: 0, failures: [], notes: [] };

export function suite(name: string, fn: () => void): void {
  const prev = reg.current;
  reg.current = name;
  if (!reg.suites.has(name)) reg.suites.set(name, []);
  try {
    fn();
  } catch (err) {
    reg.failures.push({ suite: name, test: "(suite body)", message: msg(err) });
  }
  reg.current = prev;
}

export function test(name: string, fn: () => void | Promise<void>): void {
  const s = reg.current ?? "(no suite)";
  if (!reg.suites.has(s)) reg.suites.set(s, []);
  reg.suites.get(s)!.push({ name, fn });
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ---------------------------------------------------------------------------
// assertions
// ---------------------------------------------------------------------------

export function ok(cond: boolean, name: string): void {
  if (cond) {
    reg.passed++;
    return;
  }
  reg.failures.push({ suite: reg.current ?? "?", test: name, message: "expected truthy" });
}

export function eq<T>(actual: T, expected: T, name: string): void {
  if (Object.is(actual, expected)) {
    reg.passed++;
    return;
  }
  reg.failures.push({
    suite: reg.current ?? "?",
    test: name,
    message: `got ${describe(actual)}, expected ${describe(expected)}`,
  });
}

function describe(v: unknown, limit = 400): string {
  const s = JSON.stringify(v);
  if (s === undefined) return String(v);
  return s.length > limit ? `${s.slice(0, limit)}… (${s.length} chars)` : s;
}

export function deepEq(actual: unknown, expected: unknown, name: string): void {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a === b) {
    reg.passed++;
    return;
  }
  // TRUNCATED on purpose: a byte-plane comparison that fails would otherwise print tens of
  // thousands of numbers and bury the summary.
  reg.failures.push({
    suite: reg.current ?? "?",
    test: name,
    message: `got ${describe(actual)}, expected ${describe(expected)}`,
  });
}

export function near(actual: number, expected: number, tol: number, name: string): void {
  if (Number.isFinite(actual) && Math.abs(actual - expected) <= tol) {
    reg.passed++;
    return;
  }
  reg.failures.push({
    suite: reg.current ?? "?",
    test: name,
    message: `got ${actual}, expected ~${expected} ±${tol}`,
  });
}

export function finite(value: unknown, name: string): void {
  if (typeof value === "number" && Number.isFinite(value)) {
    reg.passed++;
    return;
  }
  reg.failures.push({ suite: reg.current ?? "?", test: name, message: `expected a finite number, got ${String(value)}` });
}

export function throws(fn: () => unknown, name: string): void {
  try {
    fn();
  } catch {
    reg.passed++;
    return;
  }
  reg.failures.push({ suite: reg.current ?? "?", test: name, message: "expected a throw" });
}

export function note(text: string): void {
  reg.notes.push(text);
}

// ---------------------------------------------------------------------------
// runner
// ---------------------------------------------------------------------------

export async function runAll(): Promise<never> {
  for (const [suiteName, tests] of reg.suites) {
    process.stdout.write(`\n  ${suiteName}\n`);
    for (const t of tests) {
      const before = reg.failures.length;
      try {
        await t.fn();
      } catch (err) {
        reg.failures.push({ suite: suiteName, test: t.name, message: msg(err) });
      }
      const failed = reg.failures.length > before;
      process.stdout.write(`    ${failed ? "FAIL" : "ok  "}  ${t.name}\n`);
    }
  }

  const total = reg.passed + reg.failures.length;
  process.stdout.write(`\n${reg.passed}/${total} assertions passed\n`);
  if (reg.notes.length > 0) {
    process.stdout.write(`\nnotes:\n${reg.notes.map((n) => `  - ${n}`).join("\n")}\n`);
  }
  if (reg.failures.length > 0) {
    process.stdout.write(`\n${reg.failures.length} FAILURES:\n`);
    for (const f of reg.failures.slice(0, 80)) {
      process.stdout.write(`  [${f.suite}] ${f.test}: ${f.message}\n`);
    }
    if (reg.failures.length > 80) process.stdout.write(`  ... and ${reg.failures.length - 80} more\n`);
    process.exit(1);
  }
  process.stdout.write(`\nall assertions passed\n`);
  process.exit(0);
}

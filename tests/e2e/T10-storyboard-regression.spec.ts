import { test, expect } from "@playwright/test";
import { readFileSync, readdirSync } from "node:fs";
import * as path from "node:path";

/**
 * T10 — storyboard zero-regression gate.
 *
 * Enforces that every test title in tests/e2e/fixtures/baseline-passing.txt
 * still exists as a declared test somewhere under tests/e2e/. This
 * catches silent test deletion — someone renaming or removing a test
 * that was on the baseline-passing list without a deliberate baseline
 * update.
 *
 * The full "this test still passes" check is what the Playwright suite
 * itself enforces: baseline tests either pass or fail in CI. T10 is
 * the structural guard against "the test isn't there anymore" which
 * would otherwise look like `0 failed` when the gate should say `missing`.
 *
 * To deliberately remove or rename a baseline test, update
 * tests/e2e/fixtures/baseline-passing.txt in the same commit.
 */

const E2E_DIR = path.join(process.cwd(), "tests", "e2e");
const BASELINE_PATH = path.join(E2E_DIR, "fixtures", "baseline-passing.txt");

function loadBaseline(): string[] {
  return readFileSync(BASELINE_PATH, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

function collectDeclaredTitles(): Set<string> {
  const titles = new Set<string>();
  const describeStack: string[] = [];

  for (const name of readdirSync(E2E_DIR)) {
    if (!name.endsWith(".spec.ts")) continue;
    if (name.startsWith("T10-")) continue; // don't scan ourselves
    const src = readFileSync(path.join(E2E_DIR, name), "utf8");

    // Scan top-level describe blocks and any tests declared inside.
    // Baseline title format is either:
    //   "test title"                  — standalone test()
    //   "Describe group › test title" — test() inside describe("Describe group", ...)
    // (Playwright joins with " › ")
    //
    // The regex is intentionally approximate — it only needs to catch
    // the string literal passed to describe()/test()/it() so T10 can
    // verify presence, not meaning.

    // Pull all describe("...") group names and test("...") names.
    // The regex matches any of the three quote types, then any chars
    // up to the SAME closing quote, so nested opposite quotes
    // (e.g. "foo 'bar' baz") work.
    const describeRe = /(?:describe|test\.describe)\s*\(\s*(["'`])((?:\\.|(?!\1).)*)\1/g;
    const testRe = /(?:\btest|\bit)\s*\(\s*(["'`])((?:\\.|(?!\1).)*)\1/g;

    const describes: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = describeRe.exec(src)) !== null) describes.push(m[2]);
    const tests: string[] = [];
    while ((m = testRe.exec(src)) !== null) tests.push(m[2]);

    // Since we're not parsing scope, record both qualified and unqualified forms.
    // Qualified: "Describe › test" for every describe × test pair
    // Unqualified: "test" (for tests outside any describe)
    for (const t of tests) {
      titles.add(t);
      for (const d of describes) titles.add(`${d} › ${t}`);
    }
  }
  // Silence "assigned but unused" — stack is only here to document intent.
  void describeStack;
  return titles;
}

test("T10 — every baseline title still exists in a test file", () => {
  const baseline = loadBaseline();
  const declared = collectDeclaredTitles();

  const missing = baseline.filter((title) => !declared.has(title));

  if (missing.length > 0) {
    console.error(
      `\n[T10] ${missing.length} baseline tests have been deleted or renamed:\n` +
        missing.map((t) => `  - ${t}`).join("\n") +
        `\n\nTo deliberately remove these, update ` +
        `tests/e2e/fixtures/baseline-passing.txt in the same commit.\n`,
    );
  }
  expect(missing).toHaveLength(0);
});

test("T10 — baseline file is non-empty and well-formed", () => {
  const baseline = loadBaseline();
  expect(baseline.length).toBeGreaterThan(100); // sanity check — baseline has ~119 titles
  // Every title should be a non-empty string with at least one non-space char
  for (const title of baseline) {
    expect(title).toMatch(/\S/);
  }
});

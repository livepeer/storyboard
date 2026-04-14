import { describe, it, expect } from "vitest";
import { compareToBaseline, formatMarkdown, shouldFailCi } from "../../../src/bench/report.js";
import type { BenchReport } from "../../../src/bench/types.js";

function makeReport(tokens: number): BenchReport {
  return {
    ts: "2026-04-13T00:00:00.000Z",
    commit: "abc1234",
    results: [],
    totals: { tokens, ms: 100, ok: 6, failed: 0 },
  };
}

describe("compareToBaseline", () => {
  it("populates baseline field with deltaPct relative to baseline.json (7800 tokens)", () => {
    // 9000 tokens vs baseline 7800 = +15.38%
    const report = makeReport(9000);
    const result = compareToBaseline(report);
    expect(result.baseline).toBeDefined();
    expect(result.baseline!.tokens).toBe(7800);
    expect(result.baseline!.deltaPct).toBeCloseTo(15.38, 1);
  });

  it("returns a report with negative deltaPct when tokens are below baseline", () => {
    // 7000 tokens vs baseline 7800 = -10.25%
    const report = makeReport(7000);
    const result = compareToBaseline(report);
    expect(result.baseline).toBeDefined();
    expect(result.baseline!.deltaPct).toBeLessThan(0);
  });

  it("returns zero deltaPct when tokens exactly match the baseline", () => {
    const report = makeReport(7800);
    const result = compareToBaseline(report);
    expect(result.baseline).toBeDefined();
    expect(result.baseline!.deltaPct).toBeCloseTo(0, 5);
  });
});

describe("shouldFailCi", () => {
  it("returns true when deltaPct > 10", () => {
    const report: BenchReport = {
      ...makeReport(9000),
      baseline: { tokens: 7800, deltaPct: 15.38 },
    };
    expect(shouldFailCi(report)).toBe(true);
  });

  it("returns false when deltaPct <= 10", () => {
    const report: BenchReport = {
      ...makeReport(8580),
      baseline: { tokens: 7800, deltaPct: 10.0 },
    };
    expect(shouldFailCi(report)).toBe(false);
  });

  it("returns false when there is no baseline field", () => {
    const report = makeReport(9999);
    expect(shouldFailCi(report)).toBe(false);
  });

  it("returns false when deltaPct is negative (fewer tokens than baseline)", () => {
    const report: BenchReport = {
      ...makeReport(7000),
      baseline: { tokens: 7800, deltaPct: -10.25 },
    };
    expect(shouldFailCi(report)).toBe(false);
  });
});

describe("formatMarkdown", () => {
  it("includes total tokens and pass count in output", () => {
    const report: BenchReport = {
      ts: "2026-04-13T00:00:00.000Z",
      commit: "abc1234",
      results: [
        {
          taskId: "B1",
          ok: true,
          inputTokens: 100,
          outputTokens: 50,
          cachedTokens: 0,
          totalTokens: 150,
          durationMs: 200,
          toolCalls: 1,
        },
      ],
      totals: { tokens: 150, ms: 200, ok: 1, failed: 0 },
    };
    const md = formatMarkdown(report);
    expect(md).toContain("150 tokens");
    expect(md).toContain("1/1 passed");
    expect(md).toContain("B1");
  });

  it("appends regression warning when deltaPct > 10", () => {
    const report: BenchReport = {
      ...makeReport(9000),
      results: [],
      baseline: { tokens: 7800, deltaPct: 15.38 },
    };
    const md = formatMarkdown(report);
    expect(md).toContain("REGRESSION");
    expect(md).toContain("15.4%");
  });

  it("does not include regression warning when deltaPct <= 10", () => {
    const report: BenchReport = {
      ...makeReport(8000),
      results: [],
      baseline: { tokens: 7800, deltaPct: 2.56 },
    };
    const md = formatMarkdown(report);
    expect(md).not.toContain("REGRESSION");
    expect(md).toContain("Baseline: 7800 tokens");
  });
});

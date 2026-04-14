import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { BenchReport } from "./types.js";

// When bundled into dist/cli.js, import.meta.url points to dist/cli.js so we
// navigate into bench/ explicitly. When loaded as dist/bench/report.js (library
// use), the plain "./baseline.json" path is correct.
const BASELINE_URL = new URL(
  import.meta.url.endsWith("report.js") || import.meta.url.endsWith("report.ts")
    ? "./baseline.json"
    : "./bench/baseline.json",
  import.meta.url,
);
const REGRESSION_PCT = 10;

export function compareToBaseline(report: BenchReport): BenchReport {
  const path = fileURLToPath(BASELINE_URL);
  if (!existsSync(path)) return report;
  const baseline = JSON.parse(readFileSync(path, "utf8")) as { tokens: number };
  const deltaPct = ((report.totals.tokens - baseline.tokens) / baseline.tokens) * 100;
  return { ...report, baseline: { tokens: baseline.tokens, deltaPct } };
}

export function formatMarkdown(r: BenchReport): string {
  const rows = r.results
    .map(
      (x) =>
        `| ${x.taskId} | ${x.ok ? "✓" : "✗"} | ${x.totalTokens} | ${x.durationMs}ms | ${x.toolCalls} |`,
    )
    .join("\n");
  let md = `# Bench ${r.ts}\n\n| Task | OK | Tokens | Time | Tools |\n|---|---|---|---|---|\n${rows}\n\n**Total: ${r.totals.tokens} tokens, ${r.totals.ok}/${r.results.length} passed**\n`;
  if (r.baseline) {
    md += `\nBaseline: ${r.baseline.tokens} tokens. Delta: ${r.baseline.deltaPct.toFixed(1)}%`;
    if (r.baseline.deltaPct > REGRESSION_PCT) {
      md += ` ❌ REGRESSION (>${REGRESSION_PCT}%)`;
    }
  }
  return md;
}

export function shouldFailCi(r: BenchReport): boolean {
  if (!r.baseline) return false;
  return r.baseline.deltaPct > REGRESSION_PCT;
}

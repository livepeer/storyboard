import { execSync } from "node:child_process";
import type { AgentRunner } from "../agent/runner.js";
import type { BenchTask, BenchResult, BenchReport } from "./types.js";
import { BENCH_TASKS } from "./tasks.js";

export class BenchRunner {
  constructor(private agent: AgentRunner) {}

  async runOne(task: BenchTask): Promise<BenchResult> {
    const t0 = Date.now();
    let inputTokens = 0;
    let outputTokens = 0;
    let cachedTokens = 0;
    let toolCalls = 0;
    let ok = true;
    let error: string | undefined;
    try {
      const result = await this.agent.run({ user: task.input });
      inputTokens = result.totalUsage.input;
      outputTokens = result.totalUsage.output;
      cachedTokens = result.totalUsage.cached ?? 0;
      // Count tool calls from the assistant turns
      for (const turn of result.turns) {
        if (turn.message.role === "assistant" && turn.message.tool_calls) {
          toolCalls += turn.message.tool_calls.length;
        }
      }
      const total = inputTokens + outputTokens;
      if (total > task.maxTokens) {
        ok = false;
        error = `tokens ${total} > max ${task.maxTokens}`;
      }
    } catch (e) {
      ok = false;
      error = (e as Error).message;
    }
    return {
      taskId: task.id,
      ok,
      inputTokens,
      outputTokens,
      cachedTokens,
      totalTokens: inputTokens + outputTokens,
      durationMs: Date.now() - t0,
      toolCalls,
      error,
    };
  }

  async runAll(): Promise<BenchReport> {
    const results: BenchResult[] = [];
    for (const task of BENCH_TASKS) {
      results.push(await this.runOne(task));
    }
    const totals = {
      tokens: results.reduce((s, r) => s + r.totalTokens, 0),
      ms: results.reduce((s, r) => s + r.durationMs, 0),
      ok: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
    };
    let commit = "unknown";
    try {
      commit = execSync("git rev-parse HEAD").toString().trim();
    } catch {
      /* offline / not in git */
    }
    return {
      ts: new Date().toISOString(),
      commit,
      results,
      totals,
    };
  }
}

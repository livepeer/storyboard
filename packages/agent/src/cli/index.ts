#!/usr/bin/env bun
import { VERSION } from "../index.js";

const args = process.argv.slice(2);

if (args.includes("--version") || args.includes("-v")) {
  console.log(`livepeer ${VERSION}`);
  process.exit(0);
}

if (args.includes("--mcp")) {
  // Lazy-import so the cold start of `livepeer --version` doesn't pay
  // the MCP server import cost.
  const { McpServer } = await import("../mcp/server.js");
  const { ToolRegistry } = await import("../tools/registry.js");
  const { MCP_EXPOSED_TOOLS } = await import("../tools/builtin/index.js");
  const reg = new ToolRegistry();
  for (const t of MCP_EXPOSED_TOOLS) reg.register(t as any);
  const server = new McpServer(reg);
  await server.serve(process.stdin, process.stdout);
  process.exit(0);
}

if (args.includes("bench")) {
  const { BenchRunner } = await import("../bench/runner.js");
  const { compareToBaseline, formatMarkdown, shouldFailCi } = await import("../bench/report.js");
  const { AgentRunner } = await import("../agent/runner.js");
  const { ToolRegistry } = await import("../tools/registry.js");
  const { WorkingMemoryStore } = await import("../memory/working.js");
  const { SessionMemoryStore } = await import("../memory/session.js");

  let provider: any;
  if (process.env.GEMINI_API_KEY) {
    const { GeminiProvider } = await import("../providers/gemini.js");
    provider = new GeminiProvider({ apiKey: process.env.GEMINI_API_KEY });
  } else {
    // No real provider configured — use MockProvider with empty responses,
    // which produces 0 tokens for all tasks. The bench still runs and
    // produces a report; the regression check is meaningful only when a
    // real provider is configured.
    const { MockProvider } = await import("../providers/mock.js");
    provider = new MockProvider({ responses: [] });
    console.error("warning: no GEMINI_API_KEY set, running bench against MockProvider (0 tokens)");
  }

  const agent = new AgentRunner(
    provider,
    new ToolRegistry(),
    new WorkingMemoryStore(),
    new SessionMemoryStore(),
  );
  const runner = new BenchRunner(agent);
  const report = compareToBaseline(await runner.runAll());
  console.log(formatMarkdown(report));
  process.exit(shouldFailCi(report) ? 1 : 0);
}

const { runCli } = await import("./main.js");
await runCli();

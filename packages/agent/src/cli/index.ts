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

console.log(`livepeer agent v${VERSION} (CLI placeholder, Phase 8 lands the real TUI)`);

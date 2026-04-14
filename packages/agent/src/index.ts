/**
 * @livepeer/agent — public API entry point.
 */

export const VERSION = "1.0.0-rc.1";

export function hello(): string {
  return `livepeer agent v${VERSION}`;
}

// Re-export core types and classes for downstream pack consumers
export type { ToolDefinition } from "./tools/types.js";
export { ToolRegistry } from "./tools/registry.js";
export { AgentRunner } from "./agent/runner.js";
export type { RunOptions, RunResult } from "./agent/runner.js";
export { WorkingMemoryStore } from "./memory/working.js";
export { SessionMemoryStore } from "./memory/session.js";
export { MockProvider } from "./providers/mock.js";
export type { MockScript } from "./providers/mock.js";

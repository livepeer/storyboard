import type { Tier } from "../types.js";

/** A tool definition the registry holds. */
export interface ToolDefinition<TArgs = unknown, TCtx = unknown> {
  /** Unique name. Dotted naming for namespacing (memory.recall, livepeer.create_media). */
  name: string;
  description: string;
  /** JSON Schema for parameters. */
  parameters: Record<string, unknown>;
  /** Whether this tool is exposed via MCP. Default: false. [INV-7] */
  mcp_exposed?: boolean;
  /** Routing tier hint. Default: 1. */
  tier?: Tier;
  /** Execution function. */
  execute: (args: TArgs, ctx: TCtx) => Promise<string>;
}

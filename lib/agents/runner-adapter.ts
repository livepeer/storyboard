/**
 * Runner adapter — bridges the storyboard app's in-process state
 * (canvas/project stores, API key, provider choice) to the
 * @livepeer/agent AgentRunner.
 *
 * Consumed by lib/agents/{gemini,claude,openai}/index.ts plugins
 * in Phase 13.5.
 *
 * Phase 13.4: adds wrapStoryboardTool and registerStoryboardToolsInto
 * to bridge the storyboard ToolDefinition shape (execute → ToolResult)
 * to the core ToolDefinition shape (execute → string). Zero changes
 * to lib/tools/*.
 */

import {
  AgentRunner,
  ToolRegistry,
  WorkingMemoryStore,
  SessionMemoryStore,
  GeminiProvider,
  type LLMProvider,
  type ToolDefinition as CoreToolDefinition,
} from "@livepeer/agent";

import {
  registerProjectsPack,
  ProjectStore as PackProjectStore,
} from "@livepeer/agent-pack-projects";
import {
  registerCanvasPack,
  CanvasStore as PackCanvasStore,
} from "@livepeer/agent-pack-canvas";

import type { ToolDefinition as StoryboardToolDefinition } from "@/lib/tools/types";
import { listTools as listStoryboardTools } from "@/lib/tools/registry";
import { initializeTools } from "@/lib/tools/index";

// Eagerly populate the storyboard tool registry so that
// listStoryboardTools() returns all tools when registerStoryboardToolsInto
// is called. initializeTools() is idempotent-safe for our use: it calls
// registerTools() which overwrites on duplicate keys in the storyboard
// registry (Map.set), so calling it multiple times is harmless.
initializeTools();

export interface AdapterOptions {
  /** The LLM provider to use. Typically GeminiProvider({ apiKey }). */
  provider: LLMProvider;
  /** Shared canvas store (may be a zustand asAgentStore proxy in Phase 13.6). */
  canvasStore: PackCanvasStore;
  /** Shared project store (may be a zustand asAgentStore proxy in Phase 13.6). */
  projectStore: PackProjectStore;
  /** Working memory store. Fresh per session unless the caller wants to persist. */
  workingMemory?: WorkingMemoryStore;
  /** Session memory store. Fresh per session unless the caller wants to persist. */
  sessionMemory?: SessionMemoryStore;
}

/**
 * Convert a storyboard ToolDefinition (execute returns ToolResult) into
 * a core ToolDefinition (execute returns string). The core runner
 * serializes all tool outputs to strings for the LLM's context window,
 * so we JSON.stringify the ToolResult's data or error.
 *
 * mcp_exposed is always false — storyboard tools are internal to the
 * app and not part of the 8-tool MCP surface [INV-7].
 */
/**
 * Compress a tool description to ~80 chars by taking the first sentence
 * only. Gemini and Claude don't need multi-paragraph essays — the tool
 * name + one sentence is plenty of context.
 */
function compressDesc(full: string): string {
  const trimmed = full.trim();
  if (trimmed.length <= 80) return trimmed;
  // Take first sentence (up to first period-space or period-end)
  const firstSentence = trimmed.match(/^[^.!?]+[.!?]/);
  if (firstSentence && firstSentence[0].length <= 120) return firstSentence[0].trim();
  // Fallback: hard-truncate at 80 chars
  return trimmed.slice(0, 77) + "...";
}

/**
 * Strip parameter descriptions recursively. Keeps the JSON Schema
 * structure (type/required/enum/properties) but drops the "description"
 * fields that blow up token counts. Each param description is ~20-40
 * tokens and they add up fast across 10+ tools.
 */
function stripParamDescriptions(schema: unknown): unknown {
  if (!schema || typeof schema !== "object") return schema;
  if (Array.isArray(schema)) return schema.map(stripParamDescriptions);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema as Record<string, unknown>)) {
    if (k === "description") continue; // drop descriptions inside params
    out[k] = stripParamDescriptions(v);
  }
  return out;
}

export function wrapStoryboardTool(
  sbTool: StoryboardToolDefinition
): CoreToolDefinition {
  return {
    name: sbTool.name,
    description: compressDesc(sbTool.description),
    // Strip parameter-level descriptions. JSON Schema structure is
    // preserved so Gemini's function-call shape is still valid.
    parameters: stripParamDescriptions(sbTool.parameters) as Record<string, unknown>,
    mcp_exposed: false,
    async execute(args, _ctx) {
      const result = await sbTool.execute(args as Record<string, unknown>);
      if (result.success) {
        return JSON.stringify(result.data ?? {});
      }
      return JSON.stringify({ error: result.error ?? "unknown error" });
    },
  };
}

/**
 * Register ALL currently-registered storyboard tools into the given
 * core ToolRegistry. Call this AFTER the storyboard app has registered
 * its own tools (via lib/tools/index.ts side effects). Pack tools
 * (project/canvas) already exist in the registry via registerProjectsPack /
 * registerCanvasPack — we skip them here to avoid duplicate registration.
 *
 * Returns the number of tools actually registered (skipped duplicates
 * are not counted).
 */
export function registerStoryboardToolsInto(registry: ToolRegistry): number {
  const existing = new Set(registry.list().map((t) => t.name));
  let count = 0;
  for (const sbTool of listStoryboardTools()) {
    if (existing.has(sbTool.name)) continue; // skip pack duplicates
    registry.register(wrapStoryboardTool(sbTool));
    count++;
  }
  return count;
}

/**
 * Build an AgentRunner configured with the storyboard's tools and
 * pack stores. The returned runner has the exact same interface as
 * any other AgentRunner — run(options) returns Promise<RunResult>.
 *
 * Registers:
 *  1. pack-projects tools (via registerProjectsPack)
 *  2. pack-canvas tools (via registerCanvasPack)
 *  3. ALL existing storyboard tools via registerStoryboardToolsInto
 *     (skipping any name collisions with the pack-provided tools)
 */
export function buildStoryboardRunner(opts: AdapterOptions): AgentRunner {
  const tools = new ToolRegistry();
  registerProjectsPack({ tools, store: opts.projectStore });
  registerCanvasPack({ tools, store: opts.canvasStore });
  registerStoryboardToolsInto(tools);
  // TODO (Phase 13.5): plugins will wrap this runner and intercept
  // tool results for streaming to the React UI.
  const working = opts.workingMemory ?? new WorkingMemoryStore();
  const session = opts.sessionMemory ?? new SessionMemoryStore();
  return new AgentRunner(opts.provider, tools, working, session);
}

/**
 * Convenience factory for the most common case — a Gemini-backed
 * runner with fresh memory stores and both packs registered.
 */
export function buildGeminiStoryboardRunner(params: {
  apiKey: string;
  canvasStore: PackCanvasStore;
  projectStore: PackProjectStore;
}): AgentRunner {
  return buildStoryboardRunner({
    provider: new GeminiProvider({ apiKey: params.apiKey }),
    canvasStore: params.canvasStore,
    projectStore: params.projectStore,
  });
}

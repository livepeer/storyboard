/**
 * Runner adapter — bridges the storyboard app's in-process state
 * (canvas/project stores, API key, provider choice) to the
 * @livepeer/agent AgentRunner.
 *
 * Consumed by lib/agents/{gemini,claude,openai}/index.ts plugins
 * in Phase 13.5.
 *
 * Phase 13.3: this file exists but is not yet imported by the
 * plugins. It compiles green and is ready to wire in.
 */

import {
  AgentRunner,
  ToolRegistry,
  WorkingMemoryStore,
  SessionMemoryStore,
  GeminiProvider,
  type LLMProvider,
} from "@livepeer/agent";

import {
  registerProjectsPack,
  ProjectStore as PackProjectStore,
} from "@livepeer/agent-pack-projects";
import {
  registerCanvasPack,
  CanvasStore as PackCanvasStore,
} from "@livepeer/agent-pack-canvas";

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
 * Build an AgentRunner configured with the storyboard's tools and
 * pack stores. The returned runner has the exact same interface as
 * any other AgentRunner — run(options) returns Promise<RunResult>.
 *
 * Phase 13.4 will migrate lib/tools into register functions that
 * get wired into this runner's registry. For now the registry has
 * the pack tools (canvas + projects) available to call.
 */
export function buildStoryboardRunner(opts: AdapterOptions): AgentRunner {
  const tools = new ToolRegistry();
  registerProjectsPack({ tools, store: opts.projectStore });
  registerCanvasPack({ tools, store: opts.canvasStore });
  // TODO (Phase 13.4): registerCreateMedia(tools, { canvasStore, sdkClient })
  // TODO (Phase 13.4): registerScopeTools(tools, ...)
  // TODO (Phase 13.4): registerInferenceTool(tools, ...)

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

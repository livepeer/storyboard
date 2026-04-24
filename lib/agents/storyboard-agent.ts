/**
 * StoryboardAgent — unified agent base with provider injection.
 *
 * Handles the shared logic across all LLM plugins:
 *   1. Set user text context (for selectCapability)
 *   2. Classify intent
 *   3. Build system prompt via context-builder
 *   4. Filter + register tools based on intent
 *   5. Create AgentRunner + runStream
 *   6. Yield AgentEvents (text, tool_call, tool_result, done, error)
 *
 * Each plugin only provides the LLMProvider — everything else is shared.
 * Adding a new LLM (e.g., Llama, Mistral) requires ~10 lines.
 */

import {
  AgentRunner,
  ToolRegistry,
  WorkingMemoryStore,
  SessionMemoryStore,
  type LLMProvider,
} from "@livepeer/agent";
import { listTools as listStoryboardTools } from "@/lib/tools/registry";
import { useChatStore } from "@/lib/chat/store";
import { wrapStoryboardTool } from "./runner-adapter";
import { setCurrentUserText } from "@/lib/tools/compound-tools";
import { buildAgentContext } from "./context-builder";
import { useWorkingMemory } from "./working-memory";
import { useActiveRequest } from "./active-request";
import { classifyIntent } from "./intent";
import type { AgentEvent, AgentPlugin, CanvasContext, ConfigField } from "./types";

/** Tool filtering — pick relevant tools based on intent + user text. */
function pickTools(intentType: string, userText: string): Set<string> {
  const all = new Set(listStoryboardTools().map((t) => t.name));
  const lower = userText.toLowerCase();

  // Always available
  const base = new Set(["create_media", "canvas_create", "canvas_update", "canvas_get", "canvas_remove", "canvas_organize"]);

  // Add project tools for project-related intents
  if (["new_project", "continue", "add_scenes", "adjust_scene", "status"].includes(intentType)) {
    base.add("project_create");
    base.add("project_generate");
    base.add("project_iterate");
    base.add("project_status");
  }

  // Add scope tools for stream intents
  if (lower.includes("stream") || lower.includes("live") || lower.includes("lv2v") || intentType === "video_strategy") {
    base.add("scope_start");
    base.add("scope_control");
    base.add("scope_stop");
    base.add("scope_preset");
    base.add("scope_graph");
    base.add("scope_status");
  }

  // Add memory tools
  base.add("memory_style");
  base.add("memory_preference");

  // Filter to only tools that exist in the registry
  return new Set([...base].filter((t) => all.has(t)));
}

export interface StoryboardAgentConfig {
  id: string;
  name: string;
  description: string;
  configFields: ConfigField[];
  createProvider: (config: Record<string, string>) => LLMProvider;
  /** Extra system prompt constraints. Default: shared storyboard constraints. */
  extraConstraints?: string[];
  /** Max agent iterations per turn. Default: 10 */
  maxIterations?: number;
}

/**
 * Create a StoryboardAgent plugin from a config.
 * All the shared logic is handled here — only the LLM provider differs.
 */
export function createStoryboardAgent(cfg: StoryboardAgentConfig): AgentPlugin {
  let stopped = false;
  let savedConfig: Record<string, string> = {};

  return {
    id: cfg.id,
    name: cfg.name,
    description: cfg.description,
    configFields: cfg.configFields,

    configure(config: Record<string, string>) {
      savedConfig = config;
    },

    stop() {
      stopped = true;
    },

    async *sendMessage(
      text: string,
      context: CanvasContext,
    ): AsyncGenerator<AgentEvent, void, undefined> {
      stopped = false;
      const say = (msg: string, role: "agent" | "system" = "agent") =>
        useChatStore.getState().addMessage(msg, role);

      try {
        // 1. Set user text for downstream tools (selectCapability)
        setCurrentUserText(text);

        // 2. Classify intent
        const { useProjectStore } = await import("@/lib/projects/store");
        const projStore = useProjectStore.getState();
        const activeProj = projStore.getActiveProject();
        const pendingCount = activeProj
          ? activeProj.scenes.filter((s: { status: string }) => s.status === "pending" || s.status === "regenerating").length
          : 0;
        const intent = classifyIntent(text, !!activeProj, pendingCount);

        // 3. Update memory
        useActiveRequest.getState().applyTurn(text);
        useWorkingMemory.getState().appendDigest(`user: ${text.slice(0, 120)}`);

        // 4. Build system prompt
        const mem = useWorkingMemory.getState();
        const system = buildAgentContext(intent, {
          project: mem.project,
          digest: mem.digest,
          recentActions: mem.recentActions,
          preferences: mem.preferences,
          activeEpisodeId: mem.activeEpisodeId,
          canvasCards: context.cards.map((c) => ({
            refId: c.refId,
            type: c.type,
            title: c.title,
            url: c.url,
          })),
          selectedCard: context.selectedCard,
        });

        // 5. Register filtered tools
        const allowedTools = pickTools(intent.type, text);
        const tools = new ToolRegistry();
        for (const sbTool of listStoryboardTools()) {
          if (allowedTools.has(sbTool.name)) {
            tools.register(wrapStoryboardTool(sbTool));
          }
        }

        // 6. Create provider + runner
        const provider = cfg.createProvider(savedConfig);
        const working = new WorkingMemoryStore();
        working.setCriticalConstraints([
          system,
          ...(cfg.extraConstraints || []),
        ]);
        const session = new SessionMemoryStore();
        const runner = new AgentRunner(provider, tools, working, session);

        // 7. Run and yield events
        for await (const event of runner.runStream({
          user: text,
          maxIterations: cfg.maxIterations ?? 10,
        })) {
          if (stopped) {
            yield { type: "text", content: "Stopped." };
            break;
          }

          switch (event.kind) {
            case "text":
              if (event.text) {
                yield { type: "text", content: event.text };
                say(event.text, "agent");
              }
              break;
            case "tool_call":
              yield { type: "tool_call", name: event.name, input: {} };
              break;
            case "tool_result":
              yield { type: "tool_result", name: event.name, result: event.content };
              break;
            case "usage": {
              const totalTokens = event.usage.input + event.usage.output;
              if (totalTokens > 0) say(`${totalTokens.toLocaleString()} tokens`, "system");
              break;
            }
            case "error":
              yield { type: "error", content: event.error };
              say(`Error: ${event.error}`, "system");
              break;
          }
        }

        // 8. Sync working memory
        useWorkingMemory.getState().syncFromProjectStore();

      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        yield { type: "error", content: msg };
        say(`Agent error: ${msg}`, "system");
      }

      yield { type: "done" };
    },
  };
}

import type {
  AgentPlugin,
  AgentEvent,
  CanvasContext,
  ConfigField,
} from "../types";
import {
  AgentRunner,
  ToolRegistry,
  WorkingMemoryStore,
  SessionMemoryStore,
} from "@livepeer/agent";
import { listTools as listStoryboardTools } from "@/lib/tools/registry";
import { useChatStore } from "@/lib/chat/store";
import { loadSystemPrompt } from "./system-prompt";
import { trackUsage, checkBudget } from "./budget";
import { getConnectedServers } from "@/lib/mcp/store";
import { StoryboardClaudeProvider } from "../storyboard-providers";
import { wrapStoryboardTool } from "../runner-adapter";

// compactHistory import preserved — may be re-enabled in a follow-up
// import { compactHistory } from "./compaction";

const MAX_TOOL_ROUNDS = 20;

let stopped = false;

function say(text: string, role: "agent" | "system" = "agent") {
  useChatStore.getState().addMessage(text, role);
}

function setProcessing(v: boolean) {
  useChatStore.getState().setProcessing(v);
}

export const claudePlugin: AgentPlugin = {
  id: "claude",
  name: "Claude Agent",
  description:
    "Claude AI with tool use — intelligent model selection, multi-step reasoning, creative direction.",
  configFields: [
    {
      key: "anthropic_api_key",
      label: "Anthropic API Key (optional — uses server key by default)",
      type: "password",
      placeholder: "sk-ant-...",
    },
  ] as ConfigField[],

  configure(_config: Record<string, string>) {
    // API key is server-side only; client config is a no-op for now
  },

  stop() {
    stopped = true;
  },

  async *sendMessage(
    text: string,
    context: CanvasContext
  ): AsyncGenerator<AgentEvent> {
    stopped = false;
    setProcessing(true);

    try {
      // Budget check
      const budgetStatus = checkBudget();
      if (budgetStatus.exceeded) {
        yield {
          type: "error",
          content: "Daily token limit reached. Reset tomorrow or increase in Settings.",
        };
        say("Daily token limit reached.", "system");
        return;
      }
      if (budgetStatus.warning) {
        yield {
          type: "text",
          content: `Token usage at ${budgetStatus.pct}%. Daily limit: ${budgetStatus.limit}.`,
        };
      }

      // Load system prompt
      const system = await loadSystemPrompt(context);

      console.log(`[Claude] runStream: system=${system.length} chars, text="${text.slice(0, 80)}"`);

      // Build runner with StoryboardClaudeProvider (routes through /api/agent/chat proxy)
      const provider = new StoryboardClaudeProvider({
        getMcpServers: () => getConnectedServers(),
      });
      const tools = new ToolRegistry();
      for (const sbTool of listStoryboardTools()) {
        tools.register(wrapStoryboardTool(sbTool));
      }

      // Inject the system prompt via WorkingMemory criticalConstraints.
      // AgentRunner.runStream() marshals working.marshal().text into a system message
      // at the start of each run, so the LLM always sees the full context.
      const working = new WorkingMemoryStore();
      if (system) {
        working.setCriticalConstraints([system]);
      }
      const session = new SessionMemoryStore();
      const runner = new AgentRunner(provider, tools, working, session);

      for await (const event of runner.runStream({ user: text, maxIterations: MAX_TOOL_ROUNDS })) {
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
            yield {
              type: "tool_call",
              name: event.name,
              input: event.args,
            };
            break;

          case "tool_result": {
            let parsed: unknown;
            try {
              parsed = JSON.parse(event.content);
            } catch {
              parsed = { raw: event.content };
            }
            yield {
              type: "tool_result",
              name: event.name,
              result: parsed,
            };
            break;
          }

          case "usage":
            // Preserve budget tracking — trackUsage takes total token count
            trackUsage((event.usage.input ?? 0) + (event.usage.output ?? 0));
            break;

          case "error":
            yield { type: "error", content: event.error };
            say(`Claude error: ${event.error}`, "system");
            break;

          case "turn_done":
          case "done":
            // No UI action needed for these internal runner events
            break;
        }
      }

      yield { type: "done" };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      yield { type: "error", content: msg };
      say(`Claude error: ${msg}`, "system");
    } finally {
      setProcessing(false);
    }
  },
};

/**
 * Reset conversation history (e.g., "New conversation" button).
 * No-op: conversation state is now managed per-run by AgentRunner.
 */
export function resetConversation() {
  // No-op: conversation state is now managed per-run by AgentRunner.
  // Called by UI reset buttons — safe to keep as a no-op.
}

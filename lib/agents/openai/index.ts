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
import { loadSystemPrompt } from "../claude/system-prompt";
import { StoryboardOpenAIProvider } from "../storyboard-providers";
import { wrapStoryboardTool } from "../runner-adapter";

const MAX_TOOL_ROUNDS = 20;

let stopped = false;

function say(text: string, role: "agent" | "system" = "agent") {
  useChatStore.getState().addMessage(text, role);
}

function setProcessing(v: boolean) {
  useChatStore.getState().setProcessing(v);
}

export const openaiPlugin: AgentPlugin = {
  id: "openai",
  name: "OpenAI Agent",
  description:
    "GPT-4o with function calling — broad knowledge, fast responses, tool use.",
  configFields: [
    {
      key: "openai_api_key",
      label: "OpenAI API Key (optional — uses server key by default)",
      type: "password",
      placeholder: "sk-...",
    },
  ] as ConfigField[],

  configure(_config: Record<string, string>) {
    // API key is server-side only
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
      // Load system prompt
      const system = await loadSystemPrompt(context);

      console.log(`[OpenAI] runStream: system=${system.length} chars, text="${text.slice(0, 80)}"`);

      // Build runner with StoryboardOpenAIProvider (routes through /api/agent/openai proxy)
      const provider = new StoryboardOpenAIProvider();
      const tools = new ToolRegistry();
      for (const sbTool of listStoryboardTools()) {
        tools.register(wrapStoryboardTool(sbTool));
      }

      // Inject the system prompt via WorkingMemory criticalConstraints.
      // AgentRunner.runStream() marshals working.marshal().text into a system message
      // at the start of each run, so the LLM always sees the full context.
      const working = new WorkingMemoryStore();
      working.setCriticalConstraints(system ? [system] : []);
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
            yield { type: "tool_call", name: event.name, input: event.args };
            break;

          case "tool_result": {
            let parsed: unknown;
            try { parsed = JSON.parse(event.content); } catch { parsed = { raw: event.content }; }
            yield { type: "tool_result", name: event.name, result: parsed };
            break;
          }

          case "error":
            yield { type: "error", content: event.error };
            say(`OpenAI error: ${event.error}`, "system");
            break;

          case "turn_done":
          case "usage":
          case "done":
            // No UI action needed for these internal runner events
            break;
        }
      }

      yield { type: "done" };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      yield { type: "error", content: msg };
      say(`OpenAI error: ${msg}`, "system");
    } finally {
      setProcessing(false);
    }
  },
};

export function resetOpenAIConversation() {
  // No-op: conversation state is now managed per-run by AgentRunner.
  // Called by UI reset buttons — safe to keep as a no-op.
}

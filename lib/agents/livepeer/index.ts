/**
 * Livepeer Agent Plugin — routes LLM through Livepeer infrastructure.
 *
 * Same capabilities as the Gemini plugin but uses /api/llm/chat
 * (which routes through SDK → Gemini/Claude/OpenAI) instead of
 * calling Gemini API directly. Only needs a Daydream API key.
 *
 * Delegates to the Gemini plugin's sendMessage for all the complex
 * logic (intent detection, fast paths, tool filtering, etc.) by
 * sharing the same tool registry and memory systems. The only
 * difference is the LLM provider used.
 */

import type { AgentPlugin, CanvasContext, ConfigField, AgentEvent } from "../types";
import { LivepeerProvider } from "../livepeer-provider";
import {
  AgentRunner,
  ToolRegistry,
  WorkingMemoryStore,
  SessionMemoryStore,
} from "@livepeer/agent";
import { registerStoryboardToolsInto, wrapStoryboardTool } from "../runner-adapter";
import { listTools as listStoryboardTools } from "@/lib/tools/registry";
import { initializeTools } from "@/lib/tools/index";
import { useChatStore } from "@/lib/chat/store";

initializeTools();

let stopped = false;

export const livepeerPlugin: AgentPlugin = {
  id: "livepeer",
  name: "Livepeer Agent",
  description:
    "AI agent powered by Livepeer network — uses Daydream API key for all LLM + media generation. No separate Gemini/Claude key needed.",
  configFields: [
    {
      key: "livepeer_model",
      label: "Model (default: gemini-2.5-flash)",
      type: "text",
      placeholder: "gemini-2.5-flash",
    },
  ] as ConfigField[],

  configure(_config: Record<string, string>) {},

  stop() {
    stopped = true;
  },

  async *sendMessage(
    text: string,
    _context: CanvasContext
  ): AsyncGenerator<AgentEvent, void, undefined> {
    stopped = false;
    const say = (msg: string, role: "agent" | "system" = "agent") =>
      useChatStore.getState().addMessage(msg, role);

    // Build runner with LivepeerProvider
    const provider = new LivepeerProvider();
    const tools = new ToolRegistry();

    // Register all storyboard tools
    for (const sbTool of listStoryboardTools()) {
      tools.register(wrapStoryboardTool(sbTool));
    }

    const working = new WorkingMemoryStore();
    const session = new SessionMemoryStore();
    const runner = new AgentRunner(provider, tools, working, session);

    const startTime = Date.now();
    let agentGaveText = false;

    try {
      for await (const event of runner.runStream({ user: text, maxIterations: 10 })) {
        if (stopped) {
          yield { type: "text", content: "Stopped." };
          break;
        }

        switch (event.kind) {
          case "text":
            if (event.text) {
              yield { type: "text", content: event.text };
              say(event.text);
              agentGaveText = true;
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

          case "usage": {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            const total = event.usage.input + event.usage.output;
            if (total > 0) {
              say(
                `${elapsed}s — ${total.toLocaleString()} tokens (${event.usage.input.toLocaleString()} in / ${event.usage.output.toLocaleString()} out) via Livepeer`,
                "system"
              );
            }
            break;
          }

          case "error":
            yield { type: "error", content: event.error };
            say(`Livepeer error: ${event.error}`, "system");
            break;
        }
      }

      if (!agentGaveText) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        say(`Done in ${elapsed}s via Livepeer`, "system");
      }

      yield { type: "done" };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      yield { type: "error", content: msg };
      say(`Livepeer error: ${msg}`, "system");
    }
  },
};

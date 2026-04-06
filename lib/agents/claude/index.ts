import type {
  AgentPlugin,
  AgentEvent,
  CanvasContext,
  ConfigField,
} from "../types";
import { listTools, executeTool } from "@/lib/tools/registry";
import { useChatStore } from "@/lib/chat/store";
import { loadSystemPrompt } from "./system-prompt";
import { trackUsage, checkBudget } from "./budget";

interface Message {
  role: "user" | "assistant";
  content: ContentBlock[] | string;
}

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };

interface ApiResponse {
  id: string;
  content: ContentBlock[];
  stop_reason: string;
  usage?: { input_tokens?: number; output_tokens?: number };
}

const MAX_TOOL_ROUNDS = 20;

let stopped = false;
let messages: Message[] = [];

function say(text: string, role: "agent" | "system" = "agent") {
  useChatStore.getState().addMessage(text, role);
}

function setProcessing(v: boolean) {
  useChatStore.getState().setProcessing(v);
}

/**
 * Convert our tool registry to Anthropic's tool format.
 */
function buildToolSchemas() {
  return listTools().map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters,
  }));
}

/**
 * Call the /api/agent/chat proxy route.
 */
async function callApi(
  msgs: Message[],
  system: string,
  tools: ReturnType<typeof buildToolSchemas>
): Promise<ApiResponse> {
  const resp = await fetch("/api/agent/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: msgs,
      system,
      tools,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    if (resp.status === 429) {
      throw new Error("Rate limited — please wait a moment and try again.");
    }
    if (resp.status === 500 && text.includes("ANTHROPIC_API_KEY")) {
      throw new Error(
        "ANTHROPIC_API_KEY not configured. Add it via Vercel env vars or .env.local."
      );
    }
    throw new Error(`API error ${resp.status}: ${text.slice(0, 200)}`);
  }

  return resp.json();
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

      // Load system prompt + tool schemas
      const system = await loadSystemPrompt(context);
      const tools = buildToolSchemas();

      // Append user message to conversation
      messages.push({ role: "user", content: text });

      // Tool-use loop
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        if (stopped) {
          yield { type: "text", content: "Stopped." };
          break;
        }

        const response = await callApi(messages, system, tools);

        // Track token usage
        if (response.usage) {
          trackUsage(
            (response.usage.input_tokens ?? 0) +
              (response.usage.output_tokens ?? 0)
          );
        }

        // Process response content blocks
        const toolUseBlocks: Array<{
          type: "tool_use";
          id: string;
          name: string;
          input: Record<string, unknown>;
        }> = [];

        for (const block of response.content) {
          if (block.type === "text") {
            yield { type: "text", content: block.text };
            say(block.text, "agent");
          } else if (block.type === "tool_use") {
            toolUseBlocks.push(block);
            yield {
              type: "tool_call",
              name: block.name,
              input: block.input,
            };
          }
        }

        // Append assistant message
        messages.push({
          role: "assistant",
          content: response.content,
        });

        // If no tool calls, we're done
        if (response.stop_reason === "end_turn" || toolUseBlocks.length === 0) {
          break;
        }

        // Execute tools and send results back
        const toolResults: ContentBlock[] = [];
        for (const toolBlock of toolUseBlocks) {
          const result = await executeTool(toolBlock.name, toolBlock.input);

          yield {
            type: "tool_result",
            name: toolBlock.name,
            result: result.data ?? result.error,
          };

          toolResults.push({
            type: "tool_result",
            tool_use_id: toolBlock.id,
            content: JSON.stringify(
              result.success ? result.data : { error: result.error }
            ),
          });
        }

        // Append tool results as user message
        messages.push({
          role: "user",
          content: toolResults,
        });
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
 */
export function resetConversation() {
  messages = [];
}

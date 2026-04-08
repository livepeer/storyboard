import type {
  AgentPlugin,
  AgentEvent,
  CanvasContext,
  ConfigField,
} from "../types";
import { listTools, executeTool } from "@/lib/tools/registry";
import { useChatStore } from "@/lib/chat/store";
import { loadSystemPrompt } from "../claude/system-prompt";
import { compactHistory } from "../claude/compaction";

interface OaiMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: OaiToolCall[];
  tool_call_id?: string;
}

interface OaiToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface OaiResponse {
  choices: Array<{
    message: {
      role: "assistant";
      content: string | null;
      tool_calls?: OaiToolCall[];
    };
    finish_reason: string;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

const MAX_TOOL_ROUNDS = 20;

let stopped = false;
let messages: OaiMessage[] = [];

function say(text: string, role: "agent" | "system" = "agent") {
  useChatStore.getState().addMessage(text, role);
}

function setProcessing(v: boolean) {
  useChatStore.getState().setProcessing(v);
}

/**
 * Convert our tool registry to OpenAI's function calling format.
 */
function buildToolSchemas() {
  return listTools().map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

/**
 * Call the /api/agent/openai proxy route.
 */
async function callApi(
  msgs: OaiMessage[],
  tools: ReturnType<typeof buildToolSchemas>
): Promise<OaiResponse> {
  const resp = await fetch("/api/agent/openai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: msgs, tools }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    if (resp.status === 429) {
      throw new Error("Rate limited — please wait a moment and try again.");
    }
    if (resp.status === 500 && text.includes("OPENAI_API_KEY")) {
      throw new Error(
        "OPENAI_API_KEY not configured. Add it via Vercel env vars or .env.local."
      );
    }
    throw new Error(`API error ${resp.status}: ${text.slice(0, 200)}`);
  }

  return resp.json();
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
      // Load system prompt + tool schemas
      const system = await loadSystemPrompt(context);
      const tools = buildToolSchemas();

      // Ensure system message is first
      if (messages.length === 0 || messages[0].role !== "system") {
        messages.unshift({ role: "system", content: system });
      } else {
        messages[0].content = system;
      }

      // Append user message
      messages.push({ role: "user", content: text });

      // Tool-use loop
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        if (stopped) {
          yield { type: "text", content: "Stopped." };
          break;
        }

        // Compact old messages (skip system message at index 0)
        const [sysMsg, ...rest] = messages;
        const compacted = compactHistory(
          rest as Array<{ role: string; content: unknown }>,
          6
        );
        const apiMessages = [sysMsg, ...compacted] as OaiMessage[];

        const response = await callApi(apiMessages, tools);

        const choice = response.choices?.[0];
        if (!choice) {
          yield { type: "error", content: "No response from OpenAI" };
          break;
        }

        const { message } = choice;
        const toolCalls = message.tool_calls || [];

        // Emit text content
        if (message.content) {
          yield { type: "text", content: message.content };
          say(message.content, "agent");
        }

        // Emit tool call events
        for (const tc of toolCalls) {
          yield {
            type: "tool_call",
            name: tc.function.name,
            input: JSON.parse(tc.function.arguments || "{}"),
          };
        }

        // Append assistant message to history
        messages.push({
          role: "assistant",
          content: message.content,
          tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
        });

        // If no tool calls, we're done
        if (choice.finish_reason === "stop" || toolCalls.length === 0) {
          break;
        }

        // Execute tools and append results
        for (const tc of toolCalls) {
          let parsedInput: Record<string, unknown>;
          try {
            parsedInput = JSON.parse(tc.function.arguments || "{}");
          } catch {
            parsedInput = {};
          }

          const result = await executeTool(tc.function.name, parsedInput);

          yield {
            type: "tool_result",
            name: tc.function.name,
            result: result.data ?? result.error,
          };

          messages.push({
            role: "tool",
            content: JSON.stringify(
              result.success ? result.data : { error: result.error }
            ),
            tool_call_id: tc.id,
          });
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
  messages = [];
}

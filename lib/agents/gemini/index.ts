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

/**
 * Gemini message format.
 * roles: "user" | "model"
 * parts: text, functionCall, or functionResponse
 */
interface GeminiPart {
  text?: string;
  functionCall?: { name: string; id?: string; args: Record<string, unknown> };
  functionResponse?: { name: string; id?: string; response: Record<string, unknown> };
}

interface GeminiMessage {
  role: "user" | "model";
  parts: GeminiPart[];
}

interface GeminiResponse {
  candidates?: Array<{
    content: {
      role: string;
      parts: GeminiPart[];
    };
    finishReason?: string;
  }>;
  error?: { message: string };
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
  };
}

const MAX_TOOL_ROUNDS = 20;

let stopped = false;
let messages: GeminiMessage[] = [];

function say(text: string, role: "agent" | "system" = "agent") {
  useChatStore.getState().addMessage(text, role);
}

function setProcessing(v: boolean) {
  useChatStore.getState().setProcessing(v);
}

/**
 * Convert our tool registry to Gemini's functionDeclarations format.
 */
function buildToolSchemas() {
  return [
    {
      functionDeclarations: listTools().map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      })),
    },
  ];
}

/**
 * Call the /api/agent/gemini proxy route.
 */
async function callApi(
  contents: GeminiMessage[],
  tools: ReturnType<typeof buildToolSchemas>,
  systemInstruction?: string
): Promise<GeminiResponse> {
  // Gemini uses system_instruction at the top level, not as a message
  const body: Record<string, unknown> = { contents, tools };
  if (systemInstruction) {
    body.system_instruction = {
      parts: [{ text: systemInstruction }],
    };
  }

  const resp = await fetch("/api/agent/gemini", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    if (resp.status === 429) {
      throw new Error("Rate limited — please wait a moment and try again.");
    }
    if (resp.status === 500 && text.includes("GEMINI_API_KEY")) {
      throw new Error(
        "GEMINI_API_KEY not configured. Add it via Vercel env vars or .env.local."
      );
    }
    throw new Error(`API error ${resp.status}: ${text.slice(0, 200)}`);
  }

  return resp.json();
}

export const geminiPlugin: AgentPlugin = {
  id: "gemini",
  name: "Gemini Agent",
  description:
    "Google Gemini 2.5 Pro with function calling — best reasoning, multimodal, 1M context.",
  configFields: [
    {
      key: "gemini_api_key",
      label: "Gemini API Key (optional — uses server key by default)",
      type: "password",
      placeholder: "AIza...",
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
      const system = await loadSystemPrompt(context);
      const tools = buildToolSchemas();

      // Append user message
      messages.push({ role: "user", parts: [{ text }] });

      // Tool-use loop
      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        if (stopped) {
          yield { type: "text", content: "Stopped." };
          break;
        }

        // Compact old messages (Gemini format: role + parts with text)
        const compactable = messages.map((m) => ({
          role: m.role,
          content: m.parts
            .map((p) =>
              p.text || (p.functionResponse ? JSON.stringify(p.functionResponse.response) : "")
            )
            .join(""),
        }));
        const compacted = compactHistory(compactable, 6);
        // Rebuild Gemini messages from compacted
        const apiMessages: GeminiMessage[] = compacted.map((m, i) => {
          // If original message had functionCall/functionResponse parts, keep them
          if (i < messages.length && messages[i].parts.some((p) => p.functionCall || p.functionResponse)) {
            return messages[i];
          }
          return {
            role: m.role as "user" | "model",
            parts: [{ text: typeof m.content === "string" ? m.content : "" }],
          };
        });

        const response = await callApi(apiMessages, tools, system);

        if (response.error) {
          throw new Error(response.error.message);
        }

        const candidate = response.candidates?.[0];
        if (!candidate) {
          yield { type: "error", content: "No response from Gemini" };
          break;
        }

        const parts = candidate.content.parts || [];
        const functionCalls: Array<{ name: string; id?: string; args: Record<string, unknown> }> = [];

        // Process response parts
        for (const part of parts) {
          if (part.text) {
            yield { type: "text", content: part.text };
            say(part.text, "agent");
          }
          if (part.functionCall) {
            functionCalls.push(part.functionCall);
            yield {
              type: "tool_call",
              name: part.functionCall.name,
              input: part.functionCall.args,
            };
          }
        }

        // Append model message to history
        messages.push({
          role: "model",
          parts,
        });

        // If no function calls, we're done
        if (functionCalls.length === 0) {
          break;
        }

        // Execute tools and send results back as a user message with functionResponse parts
        const responseParts: GeminiPart[] = [];
        for (const fc of functionCalls) {
          const result = await executeTool(fc.name, fc.args);

          yield {
            type: "tool_result",
            name: fc.name,
            result: result.data ?? result.error,
          };

          responseParts.push({
            functionResponse: {
              name: fc.name,
              id: fc.id,
              response: result.success
                ? (result.data as Record<string, unknown>) ?? {}
                : { error: result.error },
            },
          });
        }

        // Append tool results as user message
        messages.push({
          role: "user",
          parts: responseParts,
        });
      }

      yield { type: "done" };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      yield { type: "error", content: msg };
      say(`Gemini error: ${msg}`, "system");
    } finally {
      setProcessing(false);
    }
  },
};

export function resetGeminiConversation() {
  messages = [];
}

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
    "Google Gemini 2.5 Flash with function calling — fast, multimodal, 1M context.",
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

      // Limit conversation history to prevent token overflow
      // Keep last 20 messages max — old ones get compacted anyway
      if (messages.length > 20) {
        messages = messages.slice(-20);
      }

      // Append user message
      messages.push({ role: "user", parts: [{ text }] });

      console.log(`[Gemini] Sending: ${messages.length} messages, ${tools.length} tools, system=${system.length} chars`);

      // Tool-use loop
      let lastRoundHadToolCalls = false;
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
        if (!candidate?.content?.parts) {
          const reason = candidate?.finishReason || "No response";
          console.warn(`[Gemini] Empty response: finishReason=${reason}, round=${round}, lastToolCalls=${lastRoundHadToolCalls}, messages=${messages.length}`);

          // MALFORMED_FUNCTION_CALL: auto-retry by injecting a simpler instruction
          if (reason === "MALFORMED_FUNCTION_CALL" && round < MAX_TOOL_ROUNDS - 1) {
            say("Simplifying request...", "system");
            messages.push({
              role: "user",
              parts: [{ text: "Your function call was too complex. Call create_media with fewer steps (max 3) and shorter prompts (under 30 words each). Do one batch at a time." }],
            });
            continue;
          }

          // STOP with no content: Gemini didn't act.
          // Enhance the prompt creatively and execute directly — don't just retry.
          if (reason === "STOP" && round === 0 && !lastRoundHadToolCalls) {
            console.warn("[Gemini] Empty STOP — enhancing prompt and executing directly");
            // Instead of retrying, enhance the vague prompt into something extraordinary
            // and call create_media directly — surprise the user
            messages[messages.length - 1] = {
              role: "user",
              parts: [{ text: `The user said: "${text}". They gave a brief prompt — this is your chance to be creative. Enhance it into a stunning visual. Add cinematic lighting, composition, mood, and detail. Then call create_media with ONE step using your enhanced prompt. Make it extraordinary — surprise them with something better than what they imagined. Do NOT ask questions, just create.` }],
            };
            continue;
          }

          if (!lastRoundHadToolCalls) {
            if (reason === "MALFORMED_FUNCTION_CALL") {
              say("Function call too complex even after retry. Try a simpler prompt.", "system");
              yield { type: "error", content: "Gemini: function call too complex. Try fewer scenes." };
            } else if (reason === "STOP") {
              say("No response from Gemini. Try rephrasing or a shorter prompt.", "system");
              yield { type: "error", content: "Gemini returned empty. Try again." };
            } else if (reason === "MAX_TOKENS") {
              say("Response too long — try a shorter prompt or fewer scenes.", "system");
              yield { type: "error", content: "Gemini: response exceeded token limit. Try fewer scenes." };
            } else if (reason === "SAFETY") {
              say("Content filtered by safety policy.", "system");
              yield { type: "error", content: "Gemini: blocked by safety filter." };
            } else if (reason === "RECITATION") {
              say("Content blocked — try rephrasing.", "system");
              yield { type: "error", content: "Gemini: recitation filter triggered." };
            } else {
              yield { type: "error", content: `Gemini: ${reason}` };
            }
          }
          break;
        }

        const parts = candidate.content.parts;
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
        lastRoundHadToolCalls = functionCalls.length > 0;
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

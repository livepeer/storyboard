import type {
  AgentPlugin,
  AgentEvent,
  CanvasContext,
  ConfigField,
} from "../types";
import { listTools, executeTool } from "@/lib/tools/registry";
import { useChatStore } from "@/lib/chat/store";
import { buildAgentContext } from "../context-builder";
import { useWorkingMemory } from "../working-memory";
import { classifyIntent } from "../intent";

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

/** Produce a brief human-readable result summary for a tool */
function briefToolResult(name: string, data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const d = data as Record<string, unknown>;
  switch (name) {
    case "create_media": {
      const cards = d.cards_created as string[] | undefined;
      const results = d.results as Array<{ capability?: string; elapsed_ms?: number; error?: string }> | undefined;
      if (!cards) return "";
      const ok = results?.filter(r => !r.error).length ?? cards.length;
      const fail = cards.length - ok;
      const cap = results?.[0]?.capability || "";
      if (fail > 0) return `${ok}/${cards.length} created (${cap})`;
      return `${cards.length} created (${cap})`;
    }
    case "project_create": return `${d.total_scenes || "?"} scenes planned`;
    case "project_generate": return `${d.completed || 0}/${d.total || "?"} done`;
    case "canvas_get": {
      const cards = d.cards as unknown[] | undefined;
      return cards ? `${cards.length} cards` : "";
    }
    default: return d.message ? String(d.message).slice(0, 50) : "";
  }
}

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
      // Build intent-aware system prompt from working memory
      const projStore = (await import("@/lib/projects/store")).useProjectStore.getState();
      const activeProj = projStore.getActiveProject();
      const pendingCount = activeProj
        ? activeProj.scenes.filter((s: { status: string }) => s.status === "pending" || s.status === "regenerating").length
        : 0;
      const intent = classifyIntent(text, !!activeProj, pendingCount);
      const mem = useWorkingMemory.getState();
      const system = buildAgentContext(intent, {
        project: mem.project,
        digest: mem.digest,
        recentActions: mem.recentActions,
        preferences: mem.preferences,
      });
      const tools = buildToolSchemas();

      // Limit conversation history to prevent token overflow
      // Keep last 20 messages max — old ones get compacted anyway
      if (messages.length > 20) {
        messages = messages.slice(-20);
      }

      // Append user message
      messages.push({ role: "user", parts: [{ text }] });

      console.log(`[Gemini] Sending: ${messages.length} messages, ${tools.length} tools, system=${system.length} chars`);

      // Tool-use loop — track results for completion summary
      let lastRoundHadToolCalls = false;
      let agentGaveText = false;
      const completedTools: Array<{ name: string; success: boolean; summary?: string }> = [];
      const startTime = Date.now();

      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        if (stopped) {
          yield { type: "text", content: "Stopped." };
          break;
        }

        // Sanitize messages: ensure strict user/model alternation.
        // Gemini requires this — merge consecutive same-role messages.
        const sanitized: GeminiMessage[] = [];
        for (const m of messages) {
          const last = sanitized[sanitized.length - 1];
          if (last && last.role === m.role) {
            // Merge into previous message of same role
            last.parts.push(...m.parts);
          } else {
            sanitized.push({ role: m.role, parts: [...m.parts] });
          }
        }

        // Use sanitized messages directly (compaction only when > 12 messages)
        let apiMessages: GeminiMessage[];
        if (sanitized.length > 12) {
          // Keep last 8 messages, summarize the rest
          const kept = sanitized.slice(-8);
          const dropped = sanitized.slice(0, -8);
          const summary = dropped
            .map((m) => m.parts.map((p) => p.text || "").filter(Boolean).join(" "))
            .filter(Boolean)
            .join("; ");
          apiMessages = summary
            ? [{ role: "user", parts: [{ text: `[Prior context: ${summary.slice(0, 500)}]` }] }, ...kept]
            : kept;
          // Ensure first message is user role (Gemini requirement)
          if (apiMessages[0]?.role !== "user") {
            apiMessages.unshift({ role: "user", parts: [{ text: "Continue." }] });
          }
        } else {
          apiMessages = sanitized;
        }

        // Ensure conversation starts with user message
        if (apiMessages.length > 0 && apiMessages[0].role !== "user") {
          apiMessages.unshift({ role: "user", parts: [{ text: "Continue." }] });
        }

        let response: GeminiResponse;
        try {
          response = await callApi(apiMessages, tools, system);
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e);
          // Gemini 400 on turn ordering — reset conversation and retry with just the user prompt
          if (errMsg.includes("function call turn") || errMsg.includes("function response turn")) {
            console.warn("[Gemini] Turn ordering error — resetting conversation");
            messages = [{ role: "user", parts: [{ text }] }];
            response = await callApi(messages, tools, system);
          } else {
            throw e;
          }
        }

        if (response.error) {
          // Same recovery for turn-ordering errors in response body
          if (response.error.message?.includes("function call turn")) {
            console.warn("[Gemini] Turn ordering error in response — resetting");
            messages = [{ role: "user", parts: [{ text }] }];
            continue;
          }
          throw new Error(response.error.message);
        }

        const candidate = response.candidates?.[0];
        if (!candidate?.content?.parts) {
          const reason = candidate?.finishReason || "No response";
          console.warn(`[Gemini] Empty response: finishReason=${reason}, round=${round}, lastToolCalls=${lastRoundHadToolCalls}, messages=${messages.length}`);

          // MALFORMED_FUNCTION_CALL: auto-retry with shorter instruction
          if (reason === "MALFORMED_FUNCTION_CALL" && round < MAX_TOOL_ROUNDS - 1) {
            messages.push({
              role: "user",
              parts: [{ text: "Function call too large. Use project_create for 6+ scenes with prompts UNDER 20 WORDS each. For 1-5 items use create_media with max 3 steps. Summarize — don't copy descriptions." }],
            });
            continue;
          }

          // STOP with no content: Gemini didn't act.
          // Detect multi-scene vs single-image and give appropriate instructions.
          if (reason === "STOP" && round <= 1 && !lastRoundHadToolCalls) {
            console.warn("[Gemini] Empty STOP on round", round, "— analyzing prompt type");

            // Detect multi-scene: look for scene/shot numbering patterns
            const isMultiScene = /scene\s*\d|shot\s*\d|\d\s*scene|\d[.\-)\s]+\w/i.test(text)
              || (text.match(/scene/gi) || []).length >= 3
              || text.length > 1500;

            if (isMultiScene) {
              // Route to project_create — the prompt is a storyboard brief
              console.warn("[Gemini] Detected multi-scene prompt, routing to project_create");
              messages[messages.length - 1] = {
                role: "user",
                parts: [{ text: `The user wants a multi-scene storyboard. Call project_create with:
- brief: A 1-sentence summary of the project
- style_guide: Extract visual_style, color_palette, mood, prompt_prefix from the brief
- scenes: Array of scenes. For EACH scene: index, title (short), prompt (UNDER 20 WORDS — just the key visual), action: "generate"

CRITICAL: Each scene prompt must be UNDER 20 WORDS. Summarize — do NOT copy the user's description.

Here is the brief:
${text.slice(0, 2000)}` }],
              };
            } else {
              // Single image — enhance creatively
              messages[messages.length - 1] = {
                role: "user",
                parts: [{ text: `Create a stunning image of: "${text.slice(0, 200)}". Call create_media with ONE step, prompt under 30 words. Be creative. Do NOT ask questions.` }],
              };
            }
            continue;
          }

          if (!lastRoundHadToolCalls) {
            // Context-only messages (from preprocessor) — Gemini has nothing to do.
            // Don't show an error; the preprocessor already handled the request.
            if (text.startsWith("[Context:")) {
              console.log("[Gemini] Context-only message — skipping (preprocessor handled)");
              break;
            }
            if (reason === "MALFORMED_FUNCTION_CALL") {
              say("Too complex — try a simpler prompt or fewer scenes.", "system");
            } else if (reason === "STOP") {
              say("Couldn't process that. Try rephrasing?", "system");
            } else if (reason === "MAX_TOKENS") {
              say("Response too long — try fewer scenes.", "system");
            } else if (reason === "SAFETY") {
              say("Blocked by safety filter.", "system");
            } else if (reason === "RECITATION") {
              say("Blocked — try rephrasing.", "system");
            } else {
              say(`Error: ${reason}`, "system");
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
            agentGaveText = true;
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
        let hasProjectCreate = false;
        let projectId: string | null = null;
        let hasProjectGenerate = false;
        let moreRemaining = false;

        for (const fc of functionCalls) {
          const result = await executeTool(fc.name, fc.args);

          yield {
            type: "tool_result",
            name: fc.name,
            result: result.data ?? result.error,
          };

          // Track for completion summary
          completedTools.push({
            name: fc.name,
            success: result.success,
            summary: result.success
              ? briefToolResult(fc.name, result.data)
              : (result.error || "failed"),
          });

          // Track project workflow state for auto-continuation
          if (fc.name === "project_create" && result.success) {
            hasProjectCreate = true;
            projectId = (result.data as Record<string, unknown>)?.project_id as string;
          }
          if (fc.name === "project_generate" && result.success) {
            hasProjectGenerate = true;
            const remaining = (result.data as Record<string, unknown>)?.remaining as number;
            if (remaining > 0) moreRemaining = true;
          }

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

        // Append tool results as user message.
        // Merge any continuation nudges INTO the same user message to avoid
        // consecutive user turns (Gemini requires strict user/model alternation).
        const userParts: GeminiPart[] = [...responseParts];

        if (hasProjectCreate && projectId && !hasProjectGenerate) {
          userParts.push({ text: `Project created. Now call project_generate with project_id="${projectId}" to start generating scenes.` });
        }
        if (hasProjectGenerate && moreRemaining) {
          userParts.push({ text: "More scenes remaining. Call project_generate again with the same project_id." });
        }

        messages.push({
          role: "user",
          parts: userParts,
        });
      }

      // Update working memory with action results
      const wmem = useWorkingMemory.getState();
      if (completedTools.length > 0) {
        const ok = completedTools.filter(t => t.success).length;
        wmem.recordAction({
          tool: completedTools.map(t => t.name).join("+"),
          summary: `${completedTools.length} tools`,
          outcome: `${ok}/${completedTools.length} succeeded`,
          success: ok === completedTools.length,
        });
      }
      wmem.syncFromProjectStore();

      // Completion summary — if agent didn't say anything after finishing tools,
      // generate a brief summary so the user knows what happened.
      if (completedTools.length > 0 && !agentGaveText) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const ok = completedTools.filter(t => t.success).length;
        const fail = completedTools.length - ok;

        // Build summary
        const parts: string[] = [];

        // Group by tool name for concise output
        const byName = new Map<string, { ok: number; fail: number; summaries: string[] }>();
        for (const t of completedTools) {
          const entry = byName.get(t.name) || { ok: 0, fail: 0, summaries: [] };
          if (t.success) entry.ok++;
          else entry.fail++;
          if (t.summary) entry.summaries.push(t.summary);
          byName.set(t.name, entry);
        }

        for (const [name, info] of byName) {
          const toolLabel: Record<string, string> = {
            create_media: "media",
            project_create: "project",
            project_generate: "scenes",
            canvas_get: "canvas lookup",
            load_skill: "skill",
            scope_start: "stream",
          };
          const label = toolLabel[name] || name;
          if (info.fail > 0 && info.ok === 0) {
            parts.push(`${label}: failed`);
          } else if (info.fail > 0) {
            parts.push(`${label}: ${info.ok} ok, ${info.fail} failed`);
          } else if (info.summaries[0]) {
            parts.push(`${label}: ${info.summaries[0]}`);
          }
        }

        const summaryText = fail === 0
          ? `Done in ${elapsed}s${parts.length ? " — " + parts.join(", ") : ""}`
          : `${ok}/${completedTools.length} succeeded (${elapsed}s)${parts.length ? " — " + parts.join(", ") : ""}`;

        say(summaryText, "system");
        yield { type: "text", content: summaryText };
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

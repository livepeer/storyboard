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
import { buildAgentContext } from "../context-builder";
import { useWorkingMemory } from "../working-memory";
import { classifyIntent } from "../intent";
import { StoryboardGeminiProvider } from "../storyboard-providers";
import { wrapStoryboardTool } from "../runner-adapter";

const MAX_TOOL_ROUNDS = 20;

let stopped = false;

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
        activeEpisodeId: mem.activeEpisodeId,
        canvasCards: context.cards.map((c) => ({
          refId: c.refId,
          type: c.type,
          title: c.title,
          url: c.url,
        })),
        selectedCard: context.selectedCard,
      });

      console.log(`[Gemini] runStream: system=${system.length} chars, text="${text.slice(0, 80)}"`);

      // Track results for completion summary
      let lastRoundHadToolCalls = false;
      let agentGaveText = false;
      const completedTools: Array<{ name: string; success: boolean; summary?: string }> = [];
      const startTime = Date.now();

      // Build runner with StoryboardGeminiProvider (routes through /api/agent/gemini proxy)
      const provider = new StoryboardGeminiProvider();
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
              agentGaveText = true;
            }
            break;

          case "tool_call":
            lastRoundHadToolCalls = true;
            yield {
              type: "tool_call",
              name: event.name,
              input: event.args,
            };
            // Emit a progress message for long-running generation tools so
            // the chat shows activity immediately (before the tool finishes).
            if (event.name === "project_generate") {
              say("Generating scenes...", "system");
            }
            break;

          case "tool_result": {
            // Parse the JSON string back into a shape for the UI
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
            completedTools.push({
              name: event.name,
              success: event.ok,
              summary: event.ok ? briefToolResult(event.name, parsed) : undefined,
            });
            // Emit inline progress for project_generate so the chat shows
            // generation status after each batch (UI feedback, matches test
            // expectations for "Generating scenes|scenes ready|done").
            if (event.name === "project_generate" && event.ok && parsed && typeof parsed === "object") {
              const d = parsed as Record<string, unknown>;
              const completed = d.completed as number | undefined;
              const total = d.total as number | undefined;
              const remaining = d.remaining as number | undefined;
              if (total !== undefined && completed !== undefined) {
                const progressMsg = remaining === 0 || remaining === undefined
                  ? `All ${completed} scenes ready.`
                  : `Generating scenes — ${completed}/${total} done`;
                say(progressMsg, "system");
              }
            }
            break;
          }

          case "error":
            yield { type: "error", content: event.error };
            say(`Gemini error: ${event.error}`, "system");
            break;

          case "turn_done":
          case "usage":
          case "done":
            // No UI action needed for these internal runner events
            break;
        }
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
        const summaryParts: string[] = [];

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
            summaryParts.push(`${label}: failed`);
          } else if (info.fail > 0) {
            summaryParts.push(`${label}: ${info.ok} ok, ${info.fail} failed`);
          } else if (info.summaries[0]) {
            summaryParts.push(`${label}: ${info.summaries[0]}`);
          }
        }

        const summaryText = fail === 0
          ? `Done in ${elapsed}s${summaryParts.length ? " — " + summaryParts.join(", ") : ""}`
          : `${ok}/${completedTools.length} succeeded (${elapsed}s)${summaryParts.length ? " — " + summaryParts.join(", ") : ""}`;

        say(summaryText, "system");
        yield { type: "text", content: summaryText };
      }

      // If no tools were called and no text was given, handle gracefully
      if (!lastRoundHadToolCalls && !agentGaveText && !text.startsWith("[Context:")) {
        say("Couldn't process that. Try rephrasing?", "system");
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
  // No-op: conversation state is now managed per-run by AgentRunner.
  // Called by UI reset buttons — safe to keep as a no-op.
}

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

      // Scene-iteration hard hint: if the user's message references
      // a specific "scene N" and there's an active project with that
      // scene, inject an explicit directive into the system prompt
      // telling the LLM to call project_iterate with the right indices
      // and NEVER create_media. Gemini otherwise defaults to
      // create_media and decomposes the request into N parallel
      // steps, which regenerates half the project.
      let sceneDirective = "";
      if (activeProj) {
        // Match "scene 4", "scene #4", "the 4th scene", "scene four", etc.
        const numMatch = text.match(/\bscene\s*#?\s*(\d+)\b/i);
        const ordinalMap: Record<string, number> = {
          first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6,
          seventh: 7, eighth: 8, ninth: 9, tenth: 10,
        };
        const ordinalMatch = text.toLowerCase().match(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s+scene\b/);
        const sceneNum = numMatch ? parseInt(numMatch[1], 10)
                       : ordinalMatch ? ordinalMap[ordinalMatch[1]]
                       : null;
        if (sceneNum !== null && sceneNum >= 1 && sceneNum <= activeProj.scenes.length) {
          const idx = sceneNum - 1;
          sceneDirective =
            `\n\nCRITICAL DIRECTIVE (must follow exactly):\n` +
            `The user is referring to scene ${sceneNum} (index ${idx}) of the active project "${activeProj.id}".\n` +
            `You MUST call EXACTLY ONE tool: project_iterate\n` +
            `Arguments: { project_id: "${activeProj.id}", scene_indices: [${idx}], feedback: "<the user's full request verbatim>" }\n` +
            `Do NOT call create_media. Do NOT decompose into multiple steps. Do NOT regenerate any other scene.\n` +
            `project_iterate will mark only scene ${idx} as regenerating and re-run that single scene with the feedback.`;
          console.log(`[Gemini] Scene iteration hint: scene ${sceneNum} (idx ${idx}) of project ${activeProj.id}`);
        }
      }
      const finalSystem = system + sceneDirective;

      console.log(`[Gemini] runStream: system=${finalSystem.length} chars, text="${text.slice(0, 80)}"`);

      // Track results for completion summary
      let lastRoundHadToolCalls = false;
      let agentGaveText = false;
      const completedTools: Array<{ name: string; success: boolean; summary?: string }> = [];
      const startTime = Date.now();

      // Track cumulative token usage for THIS prompt and for any
      // project the agent touches. Populated from RunEvent "usage"
      // events. Shown in the completion summary at the bottom.
      const promptTokens = { input: 0, output: 0, cached: 0 };
      const touchedProjectIds = new Set<string>();

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
      if (finalSystem) {
        working.setCriticalConstraints([finalSystem]);
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
            // Capture any project_id this tool touched so we can
            // attribute token usage to it after the run completes.
            if (parsed && typeof parsed === "object") {
              const pid = (parsed as Record<string, unknown>).project_id;
              if (typeof pid === "string" && pid.length > 0) {
                touchedProjectIds.add(pid);
              }
            }
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

          case "usage":
            promptTokens.input += event.usage.input;
            promptTokens.output += event.usage.output;
            promptTokens.cached += event.usage.cached ?? 0;
            break;

          case "turn_done":
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

        const tokenTotal = promptTokens.input + promptTokens.output;
        const tokenTag = tokenTotal > 0
          ? ` — ${tokenTotal.toLocaleString()} tokens (${promptTokens.input.toLocaleString()} in / ${promptTokens.output.toLocaleString()} out${promptTokens.cached > 0 ? `, ${promptTokens.cached.toLocaleString()} cached` : ""})`
          : "";

        const summaryText = fail === 0
          ? `Done in ${elapsed}s${summaryParts.length ? " — " + summaryParts.join(", ") : ""}${tokenTag}`
          : `${ok}/${completedTools.length} succeeded (${elapsed}s)${summaryParts.length ? " — " + summaryParts.join(", ") : ""}${tokenTag}`;

        say(summaryText, "system");
        yield { type: "text", content: summaryText };

        // Attribute tokens to every project this run touched, then
        // emit a per-project running total so the user sees what
        // each project has cost across all its turns.
        if (tokenTotal > 0 && touchedProjectIds.size > 0) {
          const { useProjectStore } = await import("@/lib/projects/store");
          const store = useProjectStore.getState();
          for (const pid of touchedProjectIds) {
            store.addProjectTokens(pid, promptTokens);
          }
          // Re-read after mutation so we report the latest totals
          const refreshed = useProjectStore.getState();
          for (const pid of touchedProjectIds) {
            const proj = refreshed.getProject(pid);
            if (!proj?.tokensUsed) continue;
            const t = proj.tokensUsed;
            const total = t.input + t.output;
            const label = proj.brief.slice(0, 40) + (proj.brief.length > 40 ? "…" : "");
            say(
              `Project "${label}" — ${total.toLocaleString()} tokens across ${t.turns} turn${t.turns === 1 ? "" : "s"}`,
              "system",
            );
          }
        }
      } else if (promptTokens.input + promptTokens.output > 0) {
        // No tools ran but we still consumed tokens (e.g., pure chat reply).
        // Emit a standalone token line so the user always sees the cost.
        const tokenTotal = promptTokens.input + promptTokens.output;
        say(
          `${tokenTotal.toLocaleString()} tokens (${promptTokens.input.toLocaleString()} in / ${promptTokens.output.toLocaleString()} out)`,
          "system",
        );
      }

      // If no tools were called and no text was given, ask the user for
      // more detail instead of giving up. This path fires when Gemini
      // returns an empty STOP (common on vague multi-scene prompts with
      // many tools available). We make a second runStream call with a
      // meta-prompt that asks Gemini to generate clarifying questions
      // referencing the user's original request.
      if (!lastRoundHadToolCalls && !agentGaveText && !text.startsWith("[Context:")) {
        console.warn("[Gemini] Empty runStream — asking clarifying questions");
        try {
          // Use a tool-less registry so Gemini is forced to produce text
          // instead of picking a tool.
          const clarifierTools = new ToolRegistry();
          const clarifierWorking = new WorkingMemoryStore();
          const clarifierSession = new SessionMemoryStore();
          const clarifierRunner = new AgentRunner(
            provider,
            clarifierTools,
            clarifierWorking,
            clarifierSession,
          );
          const clarifierPrompt =
            `The user asked: "${text.slice(0, 500)}"\n\n` +
            `You don't have enough detail to generate directly yet. ` +
            `Reply with a single short message (3 sentences max) that:\n` +
            `1. Acknowledges what they want in one line\n` +
            `2. Asks 2 or 3 specific clarifying questions about style, ` +
            `framing, or mood\n` +
            `3. Offers to proceed once they answer\n\n` +
            `Be warm and concise. Do not apologize. Do not list questions ` +
            `as bullet points — write them as a natural follow-up.`;

          let clarifierText = "";
          for await (const ev of clarifierRunner.runStream({
            user: clarifierPrompt,
            maxIterations: 1,
          })) {
            if (stopped) break;
            if (ev.kind === "text" && ev.text) {
              clarifierText += ev.text;
            }
          }
          if (clarifierText.trim().length > 0) {
            yield { type: "text", content: clarifierText };
            say(clarifierText, "agent");
          } else {
            // Even the clarifier failed — fall back to a static prompt
            // that still engages the user instead of giving up.
            const fallback =
              "I can help with that. Tell me a bit more: what visual style " +
              "(e.g., cinematic photograph, watercolor, anime), and what " +
              "should each shot show differently?";
            yield { type: "text", content: fallback };
            say(fallback, "agent");
          }
        } catch (clarifierErr) {
          const errMsg =
            clarifierErr instanceof Error ? clarifierErr.message : "Unknown error";
          console.warn("[Gemini] Clarifier failed:", errMsg);
          const fallback =
            "I can help with that. Tell me a bit more: what visual style " +
            "(e.g., cinematic photograph, watercolor, anime), and what " +
            "should each shot show differently?";
          yield { type: "text", content: fallback };
          say(fallback, "agent");
        }
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

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
import { trackUsage, checkBudget } from "./budget";
import { getConnectedServers } from "@/lib/mcp/store";
import { StoryboardClaudeProvider } from "../storyboard-providers";
import { wrapStoryboardTool } from "../runner-adapter";
import { setCurrentUserText } from "@/lib/tools/compound-tools";
import { buildAgentContext } from "../context-builder";
import { useWorkingMemory } from "../working-memory";
import { useActiveRequest } from "../active-request";
import { classifyIntent } from "../intent";

// compactHistory import preserved — may be re-enabled in a follow-up
// import { compactHistory } from "./compaction";

const MAX_TOOL_ROUNDS = 20;

function pickToolsForIntent(intentType: string, userText: string): Set<string> {
  const core = new Set<string>([
    "create_media", "canvas_get", "canvas_create", "canvas_update",
    "canvas_remove", "canvas_organize", "project_create",
    "project_generate", "project_iterate", "project_status",
  ]);
  const lower = userText.toLowerCase();
  const wantsStream = /\b(stream|webcam|live|camera|preset|lv2v|scope)\b/.test(lower);
  const wantsEpisode = /\bepisode\b/.test(lower);
  const wantsSdk = /\b(capab|sdk|inference|orch|capabilit)/.test(lower);
  const wantsSkill = /\b(skill|load\s+skill)\b/.test(lower);
  const allowed = new Set(core);
  if (intentType !== "status" && intentType !== "none") {
    allowed.add("memory_style"); allowed.add("memory_rate"); allowed.add("memory_preference");
  } else if (intentType === "none") {
    allowed.add("memory_style"); allowed.add("memory_preference");
  }
  if (wantsStream) {
    for (const t of ["scope_start","scope_control","scope_stop","scope_preset","scope_graph","scope_status"]) allowed.add(t);
  }
  if (wantsEpisode) {
    for (const t of ["episode_create","episode_update","episode_activate","episode_list","episode_get","episode_remove"]) allowed.add(t);
  }
  if (wantsSdk) { allowed.add("inference"); allowed.add("list_capabilities"); }
  if (wantsSkill) { allowed.add("load_skill"); }
  if (intentType === "status") return new Set(["canvas_get", "project_status"]);
  return allowed;
}

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

      // L1: ActiveRequest — track subject across turns
      setCurrentUserText(text);
      useActiveRequest.getState().applyTurn(text);

      // L2: Digest — rolling turn log for session continuity
      useWorkingMemory.getState().appendDigest(`user: ${text.slice(0, 120)}`);

      // Intent-aware system prompt (replaces static loadSystemPrompt)
      const projStore = (await import("@/lib/projects/store")).useProjectStore.getState();
      let activeProj = projStore.getActiveProject();
      if (!activeProj) {
        const all = projStore.projects ?? [];
        if (all.length > 0) activeProj = all[all.length - 1];
      }
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
        canvasCards: context.cards.map((c) => ({
          refId: c.refId, type: c.type, title: c.title, url: c.url,
        })),
        selectedCard: context.selectedCard,
        activeEpisodeId: mem.activeEpisodeId,
      });

      console.log(`[Claude] runStream: system=${system.length} chars, text="${text.slice(0, 80)}"`);

      // Intent-based tool filtering — same pickToolsForIntent as Gemini.
      // Cuts tool schema overhead from ~11k (all 45 tools) to ~2k (8-12 relevant).
      const allowedTools = pickToolsForIntent(intent.type, text);

      // Build runner with StoryboardClaudeProvider (routes through /api/agent/chat proxy)
      const provider = new StoryboardClaudeProvider({
        getMcpServers: () => getConnectedServers(),
      });
      const tools = new ToolRegistry();
      let registeredCount = 0;
      for (const sbTool of listStoryboardTools()) {
        if (allowedTools.has(sbTool.name)) {
          tools.register(wrapStoryboardTool(sbTool));
          registeredCount++;
        }
      }
      console.log(`[Claude] Tool filtering: intent=${intent.type}, registered ${registeredCount}/${listStoryboardTools().length} tools`);

      // Inject the system prompt via WorkingMemory criticalConstraints.
      const working = new WorkingMemoryStore();
      if (system) {
        working.setCriticalConstraints([system]);
      }
      const session = new SessionMemoryStore();
      const runner = new AgentRunner(provider, tools, working, session);

      const promptTokens = { input: 0, output: 0, cached: 0 };
      const touchedProjectIds = new Set<string>();
      const completedTools: Array<{ name: string; success: boolean }> = [];
      const startTime = Date.now();
      let sawAnyToolCall = false;

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
            sawAnyToolCall = true;
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
            completedTools.push({ name: event.name, success: event.ok });
            if (parsed && typeof parsed === "object") {
              const pid = (parsed as Record<string, unknown>).project_id;
              if (typeof pid === "string" && pid.length > 0) {
                touchedProjectIds.add(pid);
              }
            }
            break;
          }

          case "usage":
            // Preserve budget tracking — trackUsage takes total token count
            trackUsage((event.usage.input ?? 0) + (event.usage.output ?? 0));
            promptTokens.input += event.usage.input;
            promptTokens.output += event.usage.output;
            promptTokens.cached += event.usage.cached ?? 0;
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

      // L2: log agent outcome + sync working memory
      const wmem = useWorkingMemory.getState();
      if (completedTools.length > 0) {
        const okCount = completedTools.filter((t) => t.success).length;
        wmem.recordAction({
          tool: completedTools.map((t) => t.name).join("+"),
          summary: `${completedTools.length} tools`,
          outcome: `${okCount}/${completedTools.length} succeeded`,
          success: okCount === completedTools.length,
        });
        wmem.appendDigest(`agent: ran ${okCount}/${completedTools.length} ${completedTools.map((t) => t.name).slice(0, 3).join("+")}`);
      }
      wmem.syncFromProjectStore();

      // L3: auto-seed CreativeContext on first substantive generation
      try {
        const hasGeneratedMedia = completedTools.some(
          (t) => t.success && (t.name === "create_media" || t.name === "project_generate")
        );
        if (hasGeneratedMedia && typeof window !== "undefined") {
          const seedKey = "storyboard:creative-context-autoseeded";
          if (window.sessionStorage.getItem(seedKey) !== "1") {
            const { useSessionContext } = await import("../session-context");
            if (!useSessionContext.getState().context) {
              const active = useActiveRequest.getState().snapshot();
              const seedText = [active.subject, ...active.modifiers].filter(Boolean).join(", ");
              if (seedText.trim().length >= 5) {
                useSessionContext.getState().setContext({
                  style: "", palette: "", characters: active.subject.slice(0, 200),
                  setting: active.modifiers.slice(0, 3).join(", ").slice(0, 200),
                  rules: "", mood: "",
                });
                window.sessionStorage.setItem(seedKey, "1");
              }
            }
          }
        }
      } catch (e) { console.warn("[Claude] Auto-seed failed:", e); }

      // Per-prompt + per-project token summary
      const tokenTotal = promptTokens.input + promptTokens.output;
      if (tokenTotal > 0) {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        const tag = `${tokenTotal.toLocaleString()} tokens (${promptTokens.input.toLocaleString()} in / ${promptTokens.output.toLocaleString()} out${promptTokens.cached > 0 ? `, ${promptTokens.cached.toLocaleString()} cached` : ""})`;
        const line = sawAnyToolCall
          ? `Done in ${elapsed}s — ${tag}`
          : tag;
        say(line, "system");

        if (touchedProjectIds.size > 0) {
          const { useProjectStore } = await import("@/lib/projects/store");
          const store = useProjectStore.getState();
          for (const pid of touchedProjectIds) store.addProjectTokens(pid, promptTokens);
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

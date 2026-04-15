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
import { useActiveRequest } from "../active-request";
import { classifyIntent } from "../intent";
import { StoryboardGeminiProvider } from "../storyboard-providers";
import { wrapStoryboardTool } from "../runner-adapter";
import { setCurrentUserText } from "@/lib/tools/compound-tools";

const MAX_TOOL_ROUNDS = 20;

let stopped = false;

/**
 * Pick a subset of storyboard tool names that's relevant for the
 * current intent. Reduces input token overhead by ~80% on the common
 * case — the full storyboard registry has 45 tools, but most intents
 * only need 6-12 of them.
 *
 * Core tools are ALWAYS included so the agent has escape hatches:
 *   create_media, canvas_get, canvas_create, canvas_organize,
 *   project_create, project_generate, project_iterate, project_status
 *
 * Extras are added based on intent:
 *   - new_project / continue / add_scenes → memory_* (for recall/style)
 *   - status                              → canvas_get only (minimal)
 *   - stream-ish user text                → scope_* family
 *   - episode-ish user text               → episode_* family
 *   - none (default creative)             → memory_* for style continuity
 */
function pickToolsForIntent(intentType: string, userText: string): Set<string> {
  const core = new Set<string>([
    "create_media",
    "canvas_get",
    "canvas_create",
    "canvas_update",
    "canvas_remove",
    "canvas_organize",
    "project_create",
    "project_generate",
    "project_iterate",
    "project_status",
  ]);

  const lower = userText.toLowerCase();
  const wantsStream = /\b(stream|webcam|live|camera|preset|lv2v|scope)\b/.test(lower);
  const wantsEpisode = /\bepisode\b/.test(lower);
  const wantsSdk = /\b(capab|sdk|inference|orch|capabilit)/.test(lower);
  const wantsSkill = /\b(skill|load\s+skill)\b/.test(lower);

  const allowed = new Set(core);

  // Memory tools — always useful for style/preference continuity on
  // creative intents.
  if (intentType !== "status" && intentType !== "none" ) {
    allowed.add("memory_style");
    allowed.add("memory_rate");
    allowed.add("memory_preference");
  } else if (intentType === "none") {
    allowed.add("memory_style");
    allowed.add("memory_preference");
  }

  if (wantsStream) {
    allowed.add("scope_start");
    allowed.add("scope_control");
    allowed.add("scope_stop");
    allowed.add("scope_preset");
    allowed.add("scope_graph");
    allowed.add("scope_status");
  }

  if (wantsEpisode) {
    allowed.add("episode_create");
    allowed.add("episode_update");
    allowed.add("episode_activate");
    allowed.add("episode_list");
    allowed.add("episode_get");
    allowed.add("episode_remove");
  }

  if (wantsSdk) {
    allowed.add("inference");
    allowed.add("list_capabilities");
  }

  if (wantsSkill) {
    allowed.add("load_skill");
  }

  // Status intent: minimal surface
  if (intentType === "status") {
    return new Set(["canvas_get", "project_status"]);
  }

  return allowed;
}

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
      // Make the user's raw text available to downstream tools (used
      // by compound-tools' selectCapability to detect edit-intent).
      setCurrentUserText(text);

      // Update ActiveRequest BEFORE buildAgentContext so the injected
      // "Active request:" line reflects this turn's patch. Pure
      // deterministic extractor — no LLM cost. Handles new request,
      // clarification answer, and correction. See
      // lib/agents/active-request.ts for the classifier.
      useActiveRequest.getState().applyTurn(text);

      // L2: log the user turn to the rolling digest so prior turns
      // survive as ~200 words of "Session: ..." context across runs.
      useWorkingMemory.getState().appendDigest(`user: ${text.slice(0, 120)}`);

      // Find the best candidate project for "scene N" references:
      // prefer active, fall back to the most recently created project
      // with >= N scenes. This handles the case where the user just
      // created a project but the store hasn't marked it active yet.
      let activeProj = projStore.getActiveProject();
      if (!activeProj) {
        const all = projStore.projects ?? [];
        if (all.length > 0) {
          activeProj = all[all.length - 1];
        }
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
      let sceneIterationDetected = false;
      let sceneAnimateDetected = false;
      let sceneIterationIndex = -1;
      let resolvedSceneCardUrl: string | undefined;
      // Skip scene-iteration detection if the user is clearly starting
      // a new project. Otherwise a brief that says "Scene 1 ... Scene 2
      // ... Scene 3" would trigger project_iterate on the stale active
      // project's scene 1, hard-filter out scope_start + create_media,
      // and silently do nothing. Two signals:
      //   1. intent classifier already said "new_project"
      //   2. the text contains multiple "Scene N" markers — a multi-
      //      scene brief, not a single-scene adjustment
      const multipleSceneMatches =
        (text.match(/\bscene\s*#?\s*\d+\b/gi) || []).length;
      const isNewBrief =
        intent.type === "new_project" || multipleSceneMatches >= 2;

      // Stream / video intent in a new multi-scene brief. The default
      // new_project directive (see context-builder.ts) tells Gemini to
      // call project_create → project_generate, which is the IMAGE
      // path. When the user explicitly wants live streams or videos,
      // we need to override that with guidance to use scope_start
      // (LV2V) or veo-t2v (pre-rendered video) instead. Without this
      // the agent silently returns 3 images for "3 live streams".
      const lowerText = text.toLowerCase();
      const wantsLiveStream = /\blive\s+streams?\b|\blv2v\b/.test(lowerText);
      const wantsVideos =
        /\b(video|videos|animated|animation|animations|clip|clips|film|films)\b/.test(
          lowerText
        ) && !wantsLiveStream;
      const streamCountMatch = lowerText.match(
        /\b(\d+)\s+(?:live\s+)?(?:streams?|videos?|clips?|animations?)\b/
      );
      const streamCount = streamCountMatch
        ? parseInt(streamCountMatch[1], 10)
        : multipleSceneMatches > 0
          ? multipleSceneMatches
          : 0;
      let streamOverrideDirective = "";
      if (isNewBrief && (wantsLiveStream || wantsVideos)) {
        if (wantsLiveStream) {
          streamOverrideDirective =
            `\n\n## Override: Live Stream Brief\n` +
            `User wants ${streamCount || "multiple"} LIVE streams (LV2V), NOT a static image storyboard. ` +
            `Do NOT call project_create or project_generate. For each scene, call scope_start with: ` +
            `graph={"nodes":[{"id":"longlive","type":"pipeline","pipeline_id":"longlive"},{"id":"output","type":"sink"}],"edges":[{"from":"longlive","from_port":"video","to_node":"output","to_port":"video","kind":"stream"}]}, ` +
            `prompts="<scene description under 25 words>", and an appropriate preset. ` +
            `Call scope_start once per scene so the user gets ${streamCount || "N"} concurrent streams.`;
        } else {
          streamOverrideDirective =
            `\n\n## Override: Video Brief\n` +
            `User wants ${streamCount || "multiple"} VIDEOS, NOT a static image storyboard. ` +
            `Do NOT call project_create or project_generate. Call create_media ONCE with ${streamCount || "N"} steps, each with action="generate" and a motion-rich text prompt under 25 words. ` +
            `The capability resolver will route to veo-t2v / ltx-t2v automatically. Include the style from the user's brief (e.g. "studio ghibli style").`;
        }
        console.log(
          `[Gemini] Stream override: wantsLiveStream=${wantsLiveStream}, wantsVideos=${wantsVideos}, count=${streamCount}`
        );
      }
      if (activeProj && isNewBrief) {
        console.log(
          `[Gemini] Skipping scene-iteration: intent=${intent.type}, multipleSceneMatches=${multipleSceneMatches} — treating as new multi-scene brief`
        );
      }
      if (activeProj && !isNewBrief) {
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
          sceneIterationDetected = true;
          sceneIterationIndex = idx;

          // Detect animate intent WITHIN the scene iteration. If the
          // user wants to turn scene N into a video, project_iterate is
          // wrong — it only regenerates the scene's existing media type
          // (image). We need to route through create_media with
          // action=animate + source_url=<scene's current image URL>.
          //
          // Triggers: explicit "animate" verb, explicit "video"/"clip"
          // noun, or explicit duration paired with motion language.
          const hasAnimateVerb = /\banimate\b/i.test(text);
          const hasVideoNoun = /\b(video|clip|animation|motion|movie|film)\b/i.test(text);
          const hasDurationHint = /\b\d+\s*s(?:ec|econds?)?\b/i.test(text);
          const hasMotionLang = /\b(tilt|pan|zoom|drift|dolly|crane|tracking|fade|dissolve|upward|downward|sweep|glide|rotate|orbit|push|pull|slow motion)\b/i.test(text);
          const isAnimateScene = hasAnimateVerb || hasVideoNoun || (hasMotionLang && hasDurationHint);

          // Try to resolve scene N's existing card URL so we can pass
          // it as source_url without a round-trip to canvas_get.
          try {
            const refId = activeProj.scenes[idx]?.cardRefId;
            if (refId) {
              const { useCanvasStore } = await import("@/lib/canvas/store");
              const card = useCanvasStore.getState().cards.find((c: { refId?: string; url?: string }) => c.refId === refId);
              resolvedSceneCardUrl = card?.url;
            }
          } catch { /* non-fatal — Gemini will call canvas_get if needed */ }

          if (isAnimateScene && resolvedSceneCardUrl) {
            // Animate-scene path: call create_media with action=animate
            // and source_url pre-populated. compound-tools will route
            // this to veo-i2v (or ltx-i2v fallback) via selectCapability.
            sceneAnimateDetected = true;
            const durMatch = text.match(/\b(\d+)\s*s(?:ec|econds?)?\b/i);
            const duration = durMatch ? Math.min(30, parseInt(durMatch[1], 10)) : 8;
            sceneDirective =
              `\n\nAnimate scene ${sceneNum}. Call create_media with exactly ONE step: ` +
              `{action:"animate", source_url:"${resolvedSceneCardUrl}", duration:${duration}, prompt:"<extract the motion and mood description from the user, under 25 words>"}. ` +
              `Do not call project_iterate.`;
            console.log(`[Gemini] Scene animate detected: scene ${sceneNum} (idx ${idx}) → veo-i2v with source_url, duration=${duration}s`);
          } else {
            // Image-iterate path (existing behavior): regenerate the
            // scene's image with the user's feedback.
            sceneDirective =
              `\n\nCall project_iterate with project_id="${activeProj.id}" and scene_indices=[${idx}]. Pass the user's request as the feedback field.`;
            console.log(`[Gemini] Scene iteration detected: scene ${sceneNum} (idx ${idx}) of project ${activeProj.id}`);
          }
        }
      }
      const finalSystem = system + sceneDirective + streamOverrideDirective;

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

      // Intent-based tool filtering — cuts tool schema overhead from
      // ~11k input tokens (all 45 storyboard tools) to ~2k (the 8-12
      // tools relevant to this intent). Only tools in the allowed set
      // get registered with the core runner for this single run.
      const allowedTools = pickToolsForIntent(intent.type, text);

      // Preprocessor handoff detection: when ChatPanel.preprocessPrompt
      // has already created projects and passed a rewritten instruction
      // like 'Project "proj_..." created with 6 scenes. Call
      // project_generate ONCE ...', Gemini should call project_generate,
      // NOT create_media. Force that by removing create_media from the
      // tool set when the text looks like a preprocessor handoff.
      //
      // AGGRESSIVE trim: when we KNOW the only valid move is
      // project_generate followed by canvas_organize, strip every
      // other tool. Saves ~700 tokens of schema overhead per call.
      const isPreprocHandoff = /\bProject\s+"proj_[^"]+"\s+created\b/i.test(text)
        && /\bproject_generate\b/i.test(text);
      if (isPreprocHandoff) {
        // Completely rebuild the allowed set — only these 3 tools are
        // needed for the handoff path.
        allowedTools.clear();
        allowedTools.add("project_generate");
        allowedTools.add("canvas_organize");
        allowedTools.add("canvas_get");
        console.log(`[Gemini] Preprocessor handoff detected — forcing minimal tool set: project_generate + canvas_organize + canvas_get`);
      }

      // Scene iteration override: same aggressive minimal-tool-set
      // treatment as the preprocessor handoff path. When we know the
      // user wants scene N regenerated, project_iterate is the ONLY
      // scene-affecting tool that should reach Gemini — removing
      // everything else cuts ~1,500 tokens of schema overhead.
      if (sceneIterationDetected) {
        allowedTools.clear();
        allowedTools.add("project_iterate");
        allowedTools.add("project_status");
        allowedTools.add("canvas_get");
        console.log(`[Gemini] Scene iteration override: forcing minimal tool set: project_iterate + project_status + canvas_get`);
      }

      let registeredCount = 0;
      for (const sbTool of listStoryboardTools()) {
        if (allowedTools.has(sbTool.name)) {
          tools.register(wrapStoryboardTool(sbTool));
          registeredCount++;
        }
      }
      console.log(`[Gemini] Tool filtering: intent=${intent.type}, sceneIter=${sceneIterationDetected}, registered ${registeredCount}/${listStoryboardTools().length} tools`);

      // Inject the system prompt via WorkingMemory criticalConstraints.
      // AgentRunner.runStream() marshals working.marshal().text into a system message
      // at the start of each run, so the LLM always sees the full context.
      const working = new WorkingMemoryStore();
      if (finalSystem) {
        working.setCriticalConstraints([finalSystem]);
      }
      const session = new SessionMemoryStore();
      const runner = new AgentRunner(provider, tools, working, session);

      // Scene animate fast path: we've already resolved the source URL
      // and duration, so there's no ambiguity. Calling Gemini here lets
      // it sometimes decompose the request into multiple create_media
      // steps (splitting audio from video, etc.), causing partial veo-i2v
      // failures. Bypass the LLM entirely — invoke create_media once
      // with one deterministically-built step, yield the same events the
      // runner would, and fall through to the completion-summary block.
      if (sceneAnimateDetected && sceneIterationIndex >= 0 && activeProj && resolvedSceneCardUrl) {
        // Extract motion description from the user's text by stripping
        // "animate scene N (...)", duration markers, and ambient audio
        // clauses. What remains is the visual motion description.
        const motionPrompt = (() => {
          let rest = text
            .replace(/^[^:]*?\bscene\s*#?\s*\d+\s*(?:\([^)]*\))?\s*:?\s*/i, "")
            .trim();
          rest = rest.replace(/\b\d+\s*s(?:ec|econds?)?\b/gi, "").trim();
          rest = rest.replace(/,?\s*ambient\s*audio\s*[-—:].*$/i, "").trim();
          rest = rest.replace(/,?\s*audio\s*:.*$/i, "").trim();
          rest = rest.replace(/\s+/g, " ").replace(/^[,\s]+|[,\s]+$/g, "");
          return rest.slice(0, 300) || "smooth cinematic camera motion";
        })();
        const durMatch = text.match(/\b(\d+)\s*s(?:ec|econds?)?\b/i);
        const duration = durMatch ? Math.min(30, parseInt(durMatch[1], 10)) : 8;
        const step = {
          action: "animate",
          source_url: resolvedSceneCardUrl,
          duration,
          prompt: motionPrompt,
        };
        console.log(`[Gemini] Scene animate fast path: step=`, step);

        // Emit the same tool_call/tool_result events the runner would,
        // so the UI card path is identical.
        yield { type: "tool_call", name: "create_media", input: { steps: [step] } };
        lastRoundHadToolCalls = true;
        say(`Animating scene ${sceneIterationIndex + 1}...`, "system");

        // Load the registered tool wrapper so our call goes through the
        // exact same execute path as Gemini-originated calls.
        const { listTools } = await import("@/lib/tools/registry");
        const sbTool = listTools().find((t) => t.name === "create_media");
        if (!sbTool) {
          yield { type: "error", content: "create_media tool not registered" };
          completedTools.push({ name: "create_media", success: false });
        } else {
          try {
            const result = await sbTool.execute({ steps: [step] });
            const ok = !!result.success;
            yield {
              type: "tool_result",
              name: "create_media",
              result: ok ? result.data : { error: result.error ?? "unknown" },
            };
            completedTools.push({
              name: "create_media",
              success: ok,
              summary: ok
                ? `1 animated (veo-i2v) for scene ${sceneIterationIndex + 1}`
                : undefined,
            });
          } catch (e) {
            const raw = e instanceof Error ? e.message : "Unknown error";
            console.warn("[Gemini] Scene animate fast path threw:", raw);
            yield { type: "error", content: `Animation failed: ${raw}` };
            completedTools.push({ name: "create_media", success: false });
          }
        }
        // Fall through to the completion summary block below.
      } else {
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
      } // end else (runStream path)

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

      // L2: log the agent's outcome to the rolling digest. One line.
      const outcomeBits: string[] = [];
      if (completedTools.length > 0) {
        const ok = completedTools.filter(t => t.success).length;
        outcomeBits.push(`ran ${ok}/${completedTools.length} ${completedTools.map(t => t.name).slice(0, 3).join("+")}`);
      }
      if (outcomeBits.length > 0) {
        wmem.appendDigest(`agent: ${outcomeBits.join(", ").slice(0, 120)}`);
      }

      // L3: auto-seed CreativeContext on first substantive generation.
      // Only runs once per session (flag on sessionStorage). If the
      // user already ran /context gen, this is a no-op. The seeded
      // context carries style/characters across future turns even if
      // ActiveRequest expires.
      try {
        const hasGeneratedMedia = completedTools.some(
          (t) => t.success && (t.name === "create_media" || t.name === "project_generate")
        );
        if (hasGeneratedMedia && typeof window !== "undefined") {
          const seedKey = "storyboard:creative-context-autoseeded";
          const alreadySeeded = window.sessionStorage.getItem(seedKey) === "1";
          const { useSessionContext } = await import("../session-context");
          const existing = useSessionContext.getState().context;
          if (!alreadySeeded && !existing) {
            const active = useActiveRequest.getState().snapshot();
            const seedText = [active.subject, ...active.modifiers].filter(Boolean).join(", ");
            if (seedText.trim().length >= 5) {
              // Seed only the fields we can derive deterministically.
              // Style/palette/mood need an LLM to extract properly —
              // leave them empty so /context show tells the user to
              // enrich via /context gen, but subject/characters land.
              useSessionContext.getState().setContext({
                style: "",
                palette: "",
                characters: active.subject.slice(0, 200),
                setting: active.modifiers.slice(0, 3).join(", ").slice(0, 200),
                rules: "",
                mood: "",
              });
              window.sessionStorage.setItem(seedKey, "1");
              console.log(`[Gemini] Auto-seeded CreativeContext from ActiveRequest: ${seedText.slice(0, 80)}`);
            }
          }
        }
      } catch (e) {
        console.warn("[Gemini] Auto-seed failed (non-fatal):", e);
      }

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

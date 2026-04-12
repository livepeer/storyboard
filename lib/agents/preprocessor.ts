/**
 * Prompt preprocessor — the creative engine behind storyboard generation.
 *
 * For multi-scene briefs: owns the ENTIRE lifecycle (plan + generate all
 * batches) with personality messages. The LLM agent only handles creative
 * conversation afterward.
 *
 * For simple prompts: passes through to the agent untouched.
 *
 * For follow-ups ("continue", "where are my pictures"): detects context
 * and resumes generation or provides helpful responses.
 */

import { executeTool } from "@/lib/tools/registry";
import { useChatStore } from "@/lib/chat/store";
import { useProjectStore } from "@/lib/projects/store";
import { useCanvasStore } from "@/lib/canvas/store";
import { useSessionContext, extractCreativeContext, updateContextFromFeedback } from "./session-context";
import { classifyIntent, type Intent } from "./intent";
import {
  detectVideoIntent,
  extractDurations,
  extractColorArc,
  extractCharacterLock,
  extractPerSceneNotes,
  buildLockedPrefix,
  planVideoStrategy,
} from "./video-intent";
import { breakSceneIntoBeatsFallback } from "./beat-extractor";

// ---------------------------------------------------------------------------
// Personality — the creative partner voice
// ---------------------------------------------------------------------------

const REACTIONS = {
  excited: [
    "Oh, I love this brief!",
    "This is going to be gorgeous.",
    "What a vision — let me bring this to life.",
    "Now THIS is a creative challenge I'm here for.",
  ],
  planning: [
    "Let me break this down into scenes...",
    "Planning the visual flow...",
    "Mapping out the storyboard...",
  ],
  generating: [
    "Bringing your scenes to life...",
    "The canvas is about to get interesting...",
    "Creating the magic...",
  ],
  batchDone: [
    "Looking good so far!",
    "These are coming together beautifully.",
    "Love how these turned out.",
  ],
  allDone: [
    "All scenes are on your canvas!",
    "Your storyboard is ready!",
    "Everything's laid out — take a look!",
  ],
  askFeedback: [
    "Want me to adjust any of them?",
    "Which scenes speak to you? I can refine the rest.",
    "Any scenes you'd like me to rethink?",
  ],
};

function pick(arr: string[]): string {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

export interface PreprocessResult {
  handled: boolean;
  agentPrompt?: string;
}

function isMultiScene(text: string): boolean {
  const lower = text.toLowerCase();
  const sceneCount = (lower.match(/scene\s*\d|shot\s*\d|frame\s*\d/gi) || []).length;
  if (sceneCount >= 3) return true;
  const numberedItems = (text.match(/^\s*\d+[\.\)\-]\s+\S/gm) || []).length;
  if (numberedItems >= 4) return true;
  const sceneDash = (text.match(/scene\s+\d+\s*[—\-–:]/gi) || []).length;
  if (sceneDash >= 3) return true;
  if (text.length > 1500 && (lower.includes("storyboard") || lower.includes("campaign") || lower.includes("scenes"))) return true;
  return false;
}

/**
 * LLM-powered intent resolver — called when the fast classifier returns "none"
 * but there's an active project (ambiguous intent that needs reasoning).
 *
 * Uses a tiny Gemini call with NO tools — just text classification.
 * ~500ms, ~100 tokens. Much cheaper than a full tool-calling round.
 */
async function llmClassifyIntent(
  text: string,
  projectSummary: string,
  canvasSummary: string
): Promise<Intent> {
  try {
    const resp = await fetch("/api/agent/gemini", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [{
              text: `Classify this user message into ONE intent. Reply with ONLY the intent label, nothing else.

Context:
- Active project: ${projectSummary}
- Canvas: ${canvasSummary}

User message: "${text.slice(0, 300)}"

Intents:
- ADD_SCENES:N — user wants N more scenes (default 4)
- ADJUST — user wants to change specific scene content
- STYLE — user is correcting the visual style/palette/mood
- CONTINUE — user wants to resume generation
- STATUS — user is asking where results are
- CONVERSATION — anything else (chat, new request, feedback)

Reply ONLY the label:`,
            }],
          },
        ],
        // No tools — pure text classification
      }),
    });

    if (!resp.ok) return { type: "none" };
    const data = await resp.json();
    const answer = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

    const addMatch = answer.match(/ADD_SCENES:?(\d*)/i);
    if (addMatch) return { type: "add_scenes", count: parseInt(addMatch[1]) || 4, direction: text };
    if (/ADJUST/i.test(answer)) return { type: "adjust_scene", feedback: text };
    if (/STYLE/i.test(answer)) return { type: "style_correction", feedback: text };
    if (/CONTINUE/i.test(answer)) return { type: "continue" };
    if (/STATUS/i.test(answer)) return { type: "status" };
    return { type: "none" };
  } catch {
    return { type: "none" };
  }
}

// ---------------------------------------------------------------------------
// Scene extraction
// ---------------------------------------------------------------------------

function extractScenes(text: string): Array<{ title: string; description: string; prompt: string }> {
  const scenes: Array<{ title: string; description: string; prompt: string }> = [];

  // Strip "style direction/notes" section at the end — it's not a scene
  const cleanText = text.replace(/\n\s*(style\s+(direction|notes?)|visual\s+style|ghibli\s+style|colour|color\s+palette)[\s\S]*$/i, "");

  // "Scene N — Title\nDescription"
  const sceneRegex = /(?:scene|shot|frame)\s*(\d+)\s*[—\-–:]\s*([^\n]+)\n([\s\S]*?)(?=(?:scene|shot|frame)\s*\d+\s*[—\-–:]|$)/gi;
  let match;
  while ((match = sceneRegex.exec(cleanText)) !== null) {
    const title = match[2].trim();
    const desc = match[3].trim();
    if (desc.length < 10) continue; // skip empty/fragment matches
    scenes.push({ title, description: desc.slice(0, 200), prompt: summarize(title, desc) });
  }
  if (scenes.length >= 3) return scenes;

  // Numbered list: "1. Title\nDescription"
  const numberedRegex = /(\d+)[\.\)\-]\s+([^\n]+)\n([\s\S]*?)(?=\d+[\.\)\-]\s+|$)/g;
  while ((match = numberedRegex.exec(cleanText)) !== null) {
    const title = match[2].trim();
    const desc = match[3].trim();
    if (desc.length < 10) continue;
    scenes.push({ title, description: desc.slice(0, 200), prompt: summarize(title, desc) });
  }
  return scenes;
}

function summarize(title: string, description: string): string {
  const firstSentence = description.split(/[.!?\n]/)[0]?.trim() || "";
  const combined = `${title}. ${firstSentence}`;
  const words = combined.split(/\s+/);
  return words.length <= 25 ? combined : words.slice(0, 25).join(" ");
}

function extractStyleGuide(text: string) {
  const lower = text.toLowerCase();
  let visual_style = "";
  let color_palette = "";
  let mood = "";

  const styleMatch = text.match(/(?:visual\s+style|style\s*:)[:\s]*([^.\n]+)/i);
  if (styleMatch) visual_style = styleMatch[1].trim().slice(0, 100);
  else if (lower.includes("ghibli")) visual_style = "Studio Ghibli hand-painted watercolor animation";
  else if (lower.includes("photorealistic")) visual_style = "photorealistic CGI";
  else if (lower.includes("watercolor")) visual_style = "watercolor illustration";
  else if (lower.includes("anime")) visual_style = "anime style";

  const colorMatch = text.match(/(?:colour|color)\s*(?:palette)?[:\s]*([^.\n]+)/i);
  if (colorMatch) color_palette = colorMatch[1].trim().slice(0, 100);

  const moodMatch = text.match(/(?:mood|tone)[:\s]*([^.\n]+)/i);
  if (moodMatch) mood = moodMatch[1].trim().slice(0, 100);

  const prefixParts: string[] = [];
  if (visual_style) prefixParts.push(visual_style);
  if (color_palette) prefixParts.push(color_palette);
  const prompt_prefix = prefixParts.length > 0 ? prefixParts.join(", ") + ", " : "";

  return { visual_style, color_palette, mood, prompt_prefix };
}

// ---------------------------------------------------------------------------
// Main preprocessor
// ---------------------------------------------------------------------------

/**
 * Preprocess a prompt. For multi-scene briefs: plan + generate everything.
 * For follow-ups: detect and resume. For simple prompts: pass through.
 */
export async function preprocessPrompt(text: string): Promise<PreprocessResult> {
  const say = useChatStore.getState().addMessage;

  // --- Two-stage intent classification ---
  // Stage 1: Fast regex classifier (~0ms, handles 80% of cases)
  // Stage 2: LLM classifier (~500ms, handles ambiguous messages when project active)
  const activeProject = useProjectStore.getState().getActiveProject();
  const pendingScenes = activeProject
    ? activeProject.scenes.filter(s => s.status !== "done").length
    : 0;
  let intent = classifyIntent(text, !!activeProject, pendingScenes);

  // Stage 2: If fast classifier can't decide but there's an active project,
  // ask the LLM to reason about what the user means. This handles:
  // "make the story more interesting", "give me 8 more", "that's too dark"
  if (intent.type === "none" && activeProject && text.length < 500) {
    const projectSummary = `${activeProject.scenes.length} scenes, ${activeProject.scenes.filter(s => s.status === "done").length} done, style: ${activeProject.styleGuide?.visualStyle || "unset"}`;
    const cardCount = useCanvasStore.getState().cards.length;
    const canvasSummary = `${cardCount} cards on canvas`;
    const llmIntent = await llmClassifyIntent(text, projectSummary, canvasSummary);
    if (llmIntent.type !== "none") {
      console.log(`[Preprocessor] LLM reclassified "${text.slice(0, 50)}" as ${llmIntent.type}`);
      intent = llmIntent;
    }
  }

  if (intent.type === "continue") {
    if (activeProject) {
      const done = activeProject.scenes.filter(s => s.status === "done").length;
      const total = activeProject.scenes.length;
      if (done < total) {
        say(`On it — picking up where we left off (${done}/${total} done)...`, "agent");
        await generateAllBatches(activeProject.id, total);
        say(`${pick(REACTIONS.allDone)} ${pick(REACTIONS.askFeedback)}`, "agent");
        return { handled: true };
      }
    }
    return { handled: false };
  }

  if (intent.type === "add_scenes") {
    const count = intent.count ?? 4;
    if (activeProject) {
      say(`Love the ambition! Adding ${count} more scenes to expand the story...`, "agent");
      const existingCount = activeProject.scenes.length;
      const ctx = useSessionContext.getState().context;
      // Build explicit creative constraints from session context
      const constraints: string[] = [];
      if (ctx?.style) constraints.push(`STYLE: ${ctx.style}`);
      if (ctx?.characters) constraints.push(`CHARACTERS: ${ctx.characters} (keep consistent — do NOT change gender, age, or appearance)`);
      if (ctx?.setting) constraints.push(`SETTING: ${ctx.setting}`);
      if (ctx?.palette) constraints.push(`PALETTE: ${ctx.palette}`);
      if (ctx?.mood) constraints.push(`MOOD: ${ctx.mood}`);
      const constraintBlock = constraints.length > 0
        ? `\n\nCRITICAL — every prompt MUST follow these creative rules:\n${constraints.join("\n")}\n`
        : "";
      return {
        handled: false,
        agentPrompt: `[Context: The user has a ${existingCount}-scene storyboard and wants ${count} more.${intent.direction ? ` They said: "${intent.direction}"` : ""}${constraintBlock}
Use create_media with ${Math.min(count, 5)} steps. Each prompt MUST start with the style (e.g., "Studio Ghibli watercolor, ") and mention the main character consistently. Under 25 words each. After creating, call canvas_organize.]`,
      };
    }
    return { handled: false };
  }

  if (intent.type === "adjust_scene") {
    if (activeProject) {
      const sceneHint = intent.sceneHint ? `scene ${intent.sceneHint}` : "the scene they described";
      say(`Got it — let me rework ${sceneHint}...`, "agent");
      const ctxPrefix = useSessionContext.getState().buildPrefix();
      return {
        handled: false,
        agentPrompt: `[Context: The user wants to adjust ${sceneHint} in their storyboard (project "${activeProject.id}"). Their feedback: "${intent.feedback}". ${ctxPrefix ? `Style context: ${ctxPrefix}` : ""} Use project_iterate with the scene index and their feedback. Keep it brief.]`,
      };
    }
    return { handled: false };
  }

  if (intent.type === "style_correction") {
    // Update the session context based on user feedback
    const currentCtx = useSessionContext.getState().context;
    if (currentCtx) {
      say("Updating the creative direction...", "agent");
      const patch = await updateContextFromFeedback(currentCtx, intent.feedback ?? "");
      if (patch) {
        useSessionContext.getState().updateContext(patch);
        const updated = useSessionContext.getState().context!;
        const changes = Object.keys(patch).join(", ");
        say(`Got it — updated ${changes}. New generations will use: ${useSessionContext.getState().summary}`, "agent");
      }
    } else {
      // No context yet — create one from the feedback
      say("Setting up the creative direction...", "agent");
    }
    // Let agent handle the actual regeneration with updated context
    const ctxPrefix = useSessionContext.getState().buildPrefix();
    return {
      handled: false,
      agentPrompt: `[Context: The user corrected the style. ${ctxPrefix ? `Updated creative context: ${ctxPrefix}` : ""} Their feedback: "${intent.feedback}". Regenerate the problematic scenes with the corrected style. Use create_media or project_iterate. Keep prompts under 25 words but include the style direction.]`,
    };
  }

  if (intent.type === "status") {
    if (activeProject) {
      const done = activeProject.scenes.filter(s => s.status === "done").length;
      const total = activeProject.scenes.length;
      if (done < total) {
        say(`Working on it — ${done}/${total} scenes done so far. Let me continue...`, "agent");
        await generateAllBatches(activeProject.id, total);
        say(`${pick(REACTIONS.allDone)} ${pick(REACTIONS.askFeedback)}`, "agent");
        return { handled: true };
      } else {
        say(`All ${total} scenes are on the canvas! Take a look.`, "agent");
        return { handled: true };
      }
    }
    return { handled: false };
  }

  // --- Multi-scene detection ---
  if (!isMultiScene(text)) {
    return { handled: false };
  }

  const scenes = extractScenes(text);
  if (scenes.length < 3) {
    return { handled: false };
  }

  // --- Personality: acknowledge the brief ---
  say(pick(REACTIONS.excited), "agent");
  say(`${pick(REACTIONS.planning)} ${scenes.length} scenes, coming right up.`, "agent");

  // --- Create project ---
  const style = extractStyleGuide(text);
  const briefWords = text.split(/\s+/).slice(0, 30).join(" ");
  const brief = briefWords + (text.split(/\s+/).length > 30 ? "..." : "");

  // --- Video intent detection ---
  const isVideo = detectVideoIntent(text);
  let videoStrategy: { mode: "overview" | "full" | "custom"; perScene: number[]; totalClips: number } | null = null;
  let videoConsistency: {
    lockedPrefix: string;
    colorArc: string[];
    characterLock: string;
  } | null = null;

  if (isVideo) {
    say(`\uD83C\uDFAC Detected video brief — extracting durations and consistency layers...`, "system");
    const durations = extractDurations(text);
    const totalDuration = durations.reduce((s, d) => s + d.seconds, 0);

    if (totalDuration === 0 || totalDuration <= 60) {
      videoStrategy = planVideoStrategy("overview", durations.map((d) => d.seconds));
      if (videoStrategy.perScene.length === 0) {
        videoStrategy = {
          mode: "overview",
          totalClips: scenes.length,
          perScene: scenes.map(() => 1),
        };
      }
      say(`Strategy: overview \u2014 1 clip per scene at ~10s each (${scenes.length} clips total).`, "system");
    } else {
      videoStrategy = planVideoStrategy("overview", durations.map((d) => d.seconds));
      const fullPlan = planVideoStrategy("full", durations.map((d) => d.seconds));
      say(`\u26A0 Total declared duration: ${totalDuration}s. Each clip is 5\u201310s.\nUsing OVERVIEW: ${videoStrategy.totalClips} clips at 10s each.\nFor FULL coverage (${fullPlan.totalClips} clips covering ${totalDuration}s), reply: "full coverage"`, "system");
    }

    const ctxStore = useSessionContext.getState();
    const ctx = ctxStore.context;
    videoConsistency = {
      lockedPrefix: buildLockedPrefix({
        style: ctx?.style || style.visual_style || "",
        characters: ctx?.characters || extractCharacterLock(text),
        setting: ctx?.setting || "",
        palette: ctx?.palette || style.color_palette || "",
        mood: ctx?.mood || style.mood || "",
        rules: ctx?.rules || "",
      }),
      colorArc: extractColorArc(text),
      characterLock: extractCharacterLock(text),
    };
    say(`Locked prefix: "${videoConsistency.lockedPrefix.slice(0, 80)}..."`, "system");
  }

  const sceneObjects = scenes.map((s, i) => {
    const baseScene: Record<string, unknown> = {
      index: i,
      title: s.title,
      description: s.description,
      prompt: s.prompt,
      action: isVideo ? "video_keyframe" : "generate",
    };

    if (isVideo && videoStrategy) {
      const clipsPerScene = videoStrategy.perScene[i] || 1;
      baseScene.clipsPerScene = clipsPerScene;
      if (clipsPerScene > 1) {
        baseScene.beats = breakSceneIntoBeatsFallback(s.description, clipsPerScene);
      }
      const notes = extractPerSceneNotes(s.description);
      if (notes.visualLanguage) baseScene.visualLanguage = notes.visualLanguage;
      if (notes.cameraNotes) baseScene.cameraNotes = notes.cameraNotes;
      if (notes.score) baseScene.score = notes.score;
    }

    return baseScene;
  });

  const createResult = await executeTool("project_create", {
    brief,
    style_guide: style,
    scenes: sceneObjects,
    is_video: isVideo,
    video_consistency: videoConsistency,
  });

  if (!createResult.success) {
    say(`Hmm, couldn't set up the project: ${createResult.error}`, "agent");
    return { handled: false };
  }

  const data = createResult.data as Record<string, unknown>;
  const projectId = data.project_id as string;
  const totalScenes = data.total_scenes as number;

  // --- Extract Creative DNA (SYNC — must complete before user asks for "8 more") ---
  console.log("[Preprocessor] Starting Creative DNA extraction...");
  try {
    const ctx = await extractCreativeContext(text);
    console.log("[Preprocessor] Extraction result:", ctx);
    if (ctx) {
      useSessionContext.getState().setContext(ctx);
      const summary = useSessionContext.getState().summary;
      console.log("[Preprocessor] Context saved, summary:", summary);
      say(`Creative context saved: ${summary}`, "system");
    } else {
      console.warn("[Preprocessor] Creative DNA extraction returned null — Gemini may not have returned structured format");
      // Fallback: build context from the style guide we already extracted
      const fallbackCtx = {
        style: style.visual_style || "illustrated storyboard",
        palette: style.color_palette || "",
        characters: "",
        setting: "",
        rules: "",
        mood: style.mood || "",
      };
      // Try to extract character/setting from the brief's first paragraph
      const firstPara = text.split("\n\n")[0] || text.slice(0, 300);
      const charMatch = firstPara.match(/(?:follows?|about|featuring|with)\s+(?:a\s+)?([^,.]+(?:girl|boy|woman|man|child|character)[^,.]*)/i);
      if (charMatch) fallbackCtx.characters = charMatch[1].trim().slice(0, 100);
      const settingMatch = firstPara.match(/(?:through|in|at|across)\s+(?:a\s+)?([^,.]+(?:village|city|town|forest|mountain|world|land)[^,.]*)/i);
      if (settingMatch) fallbackCtx.setting = settingMatch[1].trim().slice(0, 100);

      if (fallbackCtx.style || fallbackCtx.characters) {
        useSessionContext.getState().setContext(fallbackCtx);
        const summary = useSessionContext.getState().summary;
        say(`Creative context saved: ${summary}`, "system");
        console.log("[Preprocessor] Fallback context saved:", fallbackCtx);
      }
    }
  } catch (e) {
    console.warn("[Preprocessor] Creative DNA extraction failed:", e);
  }

  // --- Hand off to agent for generation ---
  say(pick(REACTIONS.generating), "agent");

  // Return agentPrompt so the agent calls project_generate (instead of
  // the preprocessor driving the entire lifecycle). This lets the agent
  // loop, auto-continue, and report results through the normal tool-use flow.
  return {
    handled: false,
    agentPrompt: `Project "${projectId}" created with ${totalScenes} scenes. Call project_generate with project_id="${projectId}" to start generating. Keep calling project_generate until all scenes are done. After completion call canvas_organize.`,
  };
}

/**
 * Generate all remaining batches for a project, with progress messages.
 */
async function generateAllBatches(projectId: string, totalScenes: number): Promise<void> {
  const say = useChatStore.getState().addMessage;
  const startTime = Date.now();
  let batchNum = 0;

  for (let safety = 0; safety < 10; safety++) {
    const store = useProjectStore.getState();
    const project = store.getProject(projectId);
    if (!project) break;

    const done = project.scenes.filter(s => s.status === "done").length;
    if (done >= totalScenes || store.isProjectComplete(projectId)) break;

    batchNum++;
    const batchStart = done + 1;
    const batchEnd = Math.min(done + 5, totalScenes);
    say(`Generating scenes ${batchStart}-${batchEnd}...`, "system");

    const result = await executeTool("project_generate", { project_id: projectId });

    if (!result.success) {
      say(`Batch ${batchNum} had issues: ${result.error || "unknown error"}. Trying to continue...`, "system");
      continue;
    }

    const batchData = result.data as Record<string, unknown>;
    const completed = batchData.completed as number;
    const remaining = (batchData.remaining as number) || 0;

    if (remaining === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      say(`${pick(REACTIONS.batchDone)} All ${completed} scenes ready (${elapsed}s).`, "system");
      break;
    } else {
      say(`${completed}/${totalScenes} done — ${pick(REACTIONS.batchDone)}`, "system");
    }
  }

  // Auto-organize canvas
  await executeTool("canvas_organize", {});
}

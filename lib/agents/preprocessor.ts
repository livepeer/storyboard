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

type Intent =
  | { type: "continue" }
  | { type: "add_scenes"; count: number; direction?: string }
  | { type: "adjust_scene"; sceneHint?: string; feedback: string }
  | { type: "style_correction"; feedback: string }
  | { type: "status" }
  | { type: "none" };

/**
 * Context-aware intent classifier.
 *
 * Uses the user's message + active project state to understand intent.
 * No LLM call needed for 90% of cases — context resolves ambiguity.
 *
 * Key insight: when an active project exists, messages about "more",
 * "better", "expand", "interesting" are about that project.
 */
function classifyIntent(text: string, hasActiveProject: boolean, pendingScenes: number): Intent {
  const lower = text.toLowerCase().trim();

  // --- Explicit continue ---
  if (/^(continue|keep going|go|next|do the rest|finish|carry on|proceed|go ahead)\.?$/i.test(lower))
    return { type: "continue" };
  if (/continue generating|keep going|finish (it|them|the rest)|do the rest|next batch|remaining scenes/i.test(lower))
    return { type: "continue" };

  // --- Explicit add N more ---
  const moreCountMatch = lower.match(/(?:give|make|add|create|do|generate)\s+(?:me\s+)?(\d+)\s+more/i);
  if (moreCountMatch)
    return { type: "add_scenes", count: parseInt(moreCountMatch[1]), direction: text };

  // --- "More" with creative direction (only if project exists) ---
  if (hasActiveProject) {
    // "add more scenes", "more scenes", "expand the storyboard"
    if (/(?:add|give|make|create)\s+(?:me\s+)?more|more scenes|expand.*stor|extend/i.test(lower))
      return { type: "add_scenes", count: 4, direction: text };

    // "make the story more interesting/dramatic/funny" — creative expansion
    if (/make.*(story|storyboard|it).*(more|better|interesting|dramatic|funny|exciting|emotional|longer)/i.test(lower))
      return { type: "add_scenes", count: 4, direction: text };

    // "I want more" / "not enough" / "need more scenes"
    if (/(?:i\s+)?(?:want|need)\s+more|not enough|too few|too short/i.test(lower))
      return { type: "add_scenes", count: 4, direction: text };

    // --- Adjust specific scene ---
    const sceneRef = lower.match(/scene\s*(\d+)|(\d+)(?:st|nd|rd|th)\s+(?:scene|one|image|picture|frame)/i);
    if (sceneRef && /change|adjust|redo|fix|update|too|more|less|different|rethink|modify|improve|tweak/i.test(lower))
      return { type: "adjust_scene", sceneHint: sceneRef[1] || sceneRef[2], feedback: text };

    // "the market scene needs..." / "that bridge scene..."
    if (/(?:the|that)\s+\w+\s+(?:scene|one|image|picture).*(?:needs?|should|could|is too|isn't|looks)/i.test(lower))
      return { type: "adjust_scene", feedback: text };

    // If there are pending scenes and user is just saying something short + vague
    if (pendingScenes > 0 && lower.length < 30 && !/^(hey|hi|hello|thanks|ok|yes|no|what|how|why|can|please)/i.test(lower))
      return { type: "continue" };
  }

  // --- Style correction (with or without project) ---
  if (/wrong style|style is wrong|should be|use .*style|not.*right.*style|change.*style|switch.*style|too.*style|style.*wrong/i.test(lower))
    return { type: "style_correction", feedback: text };
  if (/do it again.*(?:in|with|using)|redo.*(?:in|with|using)|try again.*(?:in|with|using)/i.test(lower))
    return { type: "style_correction", feedback: text };

  // --- Status check ---
  if (/where.*(picture|image|scene|result)|don't see|can't see|nothing (show|appear|happen)|no (picture|image|result)|still waiting|what happened/i.test(lower))
    return { type: "status" };

  return { type: "none" };
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
    const count = intent.count;
    if (activeProject) {
      say(`Love the ambition! Adding ${count} more scenes to expand the story...`, "agent");
      const existingCount = activeProject.scenes.length;
      const style = activeProject.styleGuide;
      const styleDesc = style?.visualStyle || "matching the existing storyboard style";
      return {
        handled: false,
        agentPrompt: `[Context: The user has a ${existingCount}-scene storyboard on the canvas and wants ${count} more scenes.${intent.direction ? ` They said: "${intent.direction}"` : ""} Use create_media with ${Math.min(count, 5)} steps. Each prompt under 25 words, style: ${styleDesc}. Be creative — add new perspectives, emotional beats, unexpected moments. After creating, call canvas_organize.]`,
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
      const patch = await updateContextFromFeedback(currentCtx, intent.feedback);
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

  const createResult = await executeTool("project_create", {
    brief,
    style_guide: style,
    scenes: scenes.map((s, i) => ({
      index: i,
      title: s.title,
      description: s.description,
      prompt: s.prompt,
      action: "generate",
    })),
  });

  if (!createResult.success) {
    say(`Hmm, couldn't set up the project: ${createResult.error}`, "agent");
    return { handled: false };
  }

  const data = createResult.data as Record<string, unknown>;
  const projectId = data.project_id as string;
  const totalScenes = data.total_scenes as number;

  // --- Extract Creative DNA (async, don't block generation) ---
  extractCreativeContext(text).then((ctx) => {
    if (ctx) {
      useSessionContext.getState().setContext(ctx);
      const summary = useSessionContext.getState().summary;
      say(`Creative context saved: ${summary}`, "system");
      console.log("[Preprocessor] Creative DNA extracted:", ctx);
    }
  });

  // --- Generate ALL batches with progress ---
  say(pick(REACTIONS.generating), "agent");
  await generateAllBatches(projectId, totalScenes);

  // --- Completion with personality (said directly, not via agent) ---
  say(`${pick(REACTIONS.allDone)} ${pick(REACTIONS.askFeedback)}`, "agent");

  // No agentPrompt needed — we already said everything. But give the agent
  // context so it can handle follow-up conversation about the scenes.
  return {
    handled: true,
    agentPrompt: `[Context: A ${totalScenes}-scene storyboard was just generated and is on the canvas. The user may want to adjust specific scenes (use project_iterate), add more scenes (use create_media), or discuss the results. Be brief and enthusiastic.]`,
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

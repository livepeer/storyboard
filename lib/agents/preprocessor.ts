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

/** Detect follow-up messages that mean "keep going" or "where are my results" */
function isFollowUp(text: string): { type: "continue" | "status" | "none" } {
  const lower = text.toLowerCase().trim();
  // Continue patterns
  if (/^(continue|keep going|go|next|more|do the rest|finish|carry on|proceed|go ahead)\.?$/i.test(lower))
    return { type: "continue" };
  if (/continue|keep going|remaining|finish (it|them|the rest)|do the rest|next batch/i.test(lower))
    return { type: "continue" };
  // "Where are my pictures" patterns
  if (/where.*(picture|image|scene|result)|don't see|can't see|nothing (show|appear|happen)|no (picture|image|result)|still waiting/i.test(lower))
    return { type: "status" };
  return { type: "none" };
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

  // --- Follow-up detection ---
  const followUp = isFollowUp(text);
  if (followUp.type === "continue") {
    const activeProject = useProjectStore.getState().getActiveProject();
    if (activeProject) {
      const done = activeProject.scenes.filter(s => s.status === "done").length;
      const total = activeProject.scenes.length;
      if (done < total) {
        say(`On it — picking up where we left off (${done}/${total} done)...`, "agent");
        await generateAllBatches(activeProject.id, total);
        return { handled: true, agentPrompt: `All ${total} scenes are generated. Tell the user their storyboard is complete and ask which scenes they'd like to adjust.` };
      } else {
        return { handled: false }; // All done, let agent respond
      }
    }
    // No active project — let agent handle
    return { handled: false };
  }

  if (followUp.type === "status") {
    const activeProject = useProjectStore.getState().getActiveProject();
    if (activeProject) {
      const done = activeProject.scenes.filter(s => s.status === "done").length;
      const total = activeProject.scenes.length;
      if (done < total) {
        say(`Working on it — ${done}/${total} scenes done so far. Let me continue...`, "agent");
        await generateAllBatches(activeProject.id, total);
        return { handled: true, agentPrompt: `All ${total} scenes are now generated. The user was asking about progress — tell them everything is ready on the canvas and ask for feedback.` };
      } else {
        say(`All ${total} scenes are on the canvas! Take a look.`, "agent");
        return { handled: true, agentPrompt: `All ${total} scenes are already generated and on the canvas. Ask the user what they think and if they want to adjust any scenes.` };
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

  // --- Generate ALL batches with progress ---
  say(pick(REACTIONS.generating), "agent");
  await generateAllBatches(projectId, totalScenes);

  // --- Completion with personality ---
  const doneMsg = `${pick(REACTIONS.allDone)} ${pick(REACTIONS.askFeedback)}`;

  return {
    handled: true,
    agentPrompt: `I just created and generated a ${totalScenes}-scene storyboard. All scenes are on the canvas. Say something like: "${doneMsg}" Keep it brief — the canvas shows the results. If the user wants changes, use project_iterate.`,
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

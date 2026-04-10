/**
 * Prompt preprocessor — intercepts large multi-scene briefs and breaks them
 * down into a project plan before they reach the LLM agent.
 *
 * Problem: Gemini can't handle 800-word storyboard briefs + 21 tool schemas
 * in one shot. It returns empty STOP or MALFORMED_FUNCTION_CALL.
 *
 * Solution: Detect multi-scene prompts client-side, extract scenes and style,
 * call project_create directly, then hand a short "generate the project"
 * instruction to the agent.
 *
 * Flow:
 *   User: "Create a 9-scene cinematic storyboard for BYD..."
 *   Preprocessor detects 9 scenes → extracts scenes + style
 *   Preprocessor calls project_create tool directly
 *   Returns short instruction: "Project created (9 scenes). Call project_generate."
 *   Agent sees only this short instruction → calls project_generate → works.
 */

import { executeTool } from "@/lib/tools/registry";
import { useChatStore } from "@/lib/chat/store";

interface PreprocessResult {
  /** If true, the preprocessor handled the prompt. Agent gets `agentPrompt` instead. */
  handled: boolean;
  /** Short prompt for the agent (replaces the original) */
  agentPrompt?: string;
}

/** Detect if a prompt is a multi-scene brief */
function isMultiScene(text: string): boolean {
  const lower = text.toLowerCase();
  // Count scene/shot references
  const sceneCount = (lower.match(/scene\s*\d|shot\s*\d|frame\s*\d/gi) || []).length;
  if (sceneCount >= 3) return true;
  // Numbered list pattern (1. xxx 2. xxx 3. xxx)
  const numberedItems = (text.match(/^\s*\d+[\.\)\-]\s+\S/gm) || []).length;
  if (numberedItems >= 4) return true;
  // "Scene N —" pattern
  const sceneDash = (text.match(/scene\s+\d+\s*[—\-–:]/gi) || []).length;
  if (sceneDash >= 3) return true;
  // Very long prompt with scene-like keywords
  if (text.length > 1500 && (lower.includes("storyboard") || lower.includes("campaign") || lower.includes("scenes"))) return true;
  return false;
}

/** Extract scenes from a multi-scene brief using pattern matching */
function extractScenes(text: string): Array<{ title: string; description: string; prompt: string }> {
  const scenes: Array<{ title: string; description: string; prompt: string }> = [];

  // Try "Scene N — Title\nDescription" pattern
  const sceneRegex = /(?:scene|shot|frame)\s*(\d+)\s*[—\-–:]\s*([^\n]+)\n([\s\S]*?)(?=(?:scene|shot|frame)\s*\d+\s*[—\-–:]|style\s+direction|$)/gi;
  let match;
  while ((match = sceneRegex.exec(text)) !== null) {
    const title = match[2].trim();
    const desc = match[3].trim();
    // Summarize to under 25 words for the prompt
    const prompt = summarizeToPrompt(title, desc);
    scenes.push({ title, description: desc.slice(0, 200), prompt });
  }

  if (scenes.length >= 3) return scenes;

  // Try numbered list pattern: "1. Title\nDescription"
  const numberedRegex = /(\d+)[\.\)\-]\s+([^\n]+)\n([\s\S]*?)(?=\d+[\.\)\-]\s+|$)/g;
  while ((match = numberedRegex.exec(text)) !== null) {
    const title = match[2].trim();
    const desc = match[3].trim();
    const prompt = summarizeToPrompt(title, desc);
    scenes.push({ title, description: desc.slice(0, 200), prompt });
  }

  return scenes;
}

/** Summarize a scene title + description into a concise visual prompt (under 25 words) */
function summarizeToPrompt(title: string, description: string): string {
  // Take the title and first sentence of description
  const firstSentence = description.split(/[.!?\n]/)[0]?.trim() || "";
  const combined = `${title}. ${firstSentence}`;

  // Truncate to ~25 words
  const words = combined.split(/\s+/);
  if (words.length <= 25) return combined;
  return words.slice(0, 25).join(" ");
}

/** Extract style guide from the brief */
function extractStyleGuide(text: string): {
  visual_style: string;
  color_palette: string;
  mood: string;
  prompt_prefix: string;
} {
  const lower = text.toLowerCase();

  // Look for style-related sentences
  let visual_style = "";
  let color_palette = "";
  let mood = "";

  // Visual style
  const styleMatch = text.match(/(?:visual\s+style|style\s*:)[:\s]*([^.\n]+)/i);
  if (styleMatch) visual_style = styleMatch[1].trim().slice(0, 100);
  else if (lower.includes("photorealistic")) visual_style = "photorealistic CGI";
  else if (lower.includes("watercolor")) visual_style = "watercolor illustration";
  else if (lower.includes("anime")) visual_style = "anime style";

  // Color palette
  const colorMatch = text.match(/(?:colour|color)\s*(?:palette)?[:\s]*([^.\n]+)/i);
  if (colorMatch) color_palette = colorMatch[1].trim().slice(0, 100);

  // Mood
  const moodMatch = text.match(/(?:mood|tone)[:\s]*([^.\n]+)/i);
  if (moodMatch) mood = moodMatch[1].trim().slice(0, 100);

  // Build prefix from style keywords
  const prefixParts: string[] = [];
  if (visual_style) prefixParts.push(visual_style);
  if (color_palette) prefixParts.push(color_palette);
  const prompt_prefix = prefixParts.length > 0 ? prefixParts.join(", ") + ", " : "";

  return { visual_style, color_palette, mood, prompt_prefix };
}

/**
 * Preprocess a user prompt. If it's a multi-scene brief, create the project
 * directly and return a short instruction for the agent.
 */
export async function preprocessPrompt(text: string): Promise<PreprocessResult> {
  if (!isMultiScene(text)) {
    return { handled: false };
  }

  const say = useChatStore.getState().addMessage;

  // Step 1: Extract scenes
  const scenes = extractScenes(text);
  if (scenes.length < 3) {
    // Couldn't parse — let agent handle it
    return { handled: false };
  }

  say(`Planning ${scenes.length}-scene project...`, "system");

  // Step 2: Extract style guide
  const style = extractStyleGuide(text);

  // Step 3: Build a 1-line brief
  const briefWords = text.split(/\s+/).slice(0, 30).join(" ");
  const brief = briefWords + (text.split(/\s+/).length > 30 ? "..." : "");

  // Step 4: Call project_create directly (bypasses Gemini entirely)
  const result = await executeTool("project_create", {
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

  if (!result.success) {
    say(`Project planning failed: ${result.error}`, "system");
    return { handled: false };
  }

  const data = result.data as Record<string, unknown>;
  const projectId = data.project_id as string;
  const totalScenes = data.total_scenes as number;

  say(`Project planned: ${totalScenes} scenes. Generating...`, "system");

  // Step 5: Return short instruction for agent — just call project_generate
  return {
    handled: true,
    agentPrompt: `Project "${projectId}" created with ${totalScenes} scenes. Call project_generate with project_id="${projectId}" now. After each batch, call project_generate again until all scenes are done. Then tell the user all scenes are ready and ask for feedback.`,
  };
}

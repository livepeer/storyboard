/**
 * Intent Planner — LLM-powered understanding of what the user actually wants.
 *
 * The old flow:
 *   user prompt → regex classifier → if multi-scene → project_create
 *                                   → else → pass to agent verbatim
 *
 * The new flow:
 *   user prompt → LLM intent planner → structured plan
 *     → "compare_models" → create_media with N steps, one per model
 *     → "multi_scene" → project_create (existing flow)
 *     → "single" → pass to agent (existing flow)
 *     → "batch" → create_media with N steps, same model
 *     → "variations" → variation engine
 *
 * This is a LIGHTWEIGHT LLM call (~200 tokens out, ~300ms). No tools,
 * no conversation history. Just: "what does this prompt mean?"
 *
 * Only fires when the fast regex classifier returns "none" AND the
 * prompt looks complex enough to warrant understanding (>50 chars,
 * mentions models, or has multiple clauses).
 */

import { getCachedCapabilities } from "@/lib/sdk/capabilities";

export type PlanType =
  | "compare_models"  // Same prompt, different models side by side
  | "multi_scene"     // Story/storyboard with multiple scenes
  | "batch"           // Multiple different images (not scenes)
  | "single"          // One image/video, pass to agent
  | "passthrough";    // Don't intercept, let agent handle naturally

export interface IntentPlan {
  type: PlanType;
  /** For compare_models: which models to use */
  models?: string[];
  /** The cleaned creative prompt (without model names / meta-instructions) */
  prompt?: string;
  /** For batch: individual prompts */
  prompts?: string[];
  /** For multi_scene: number of scenes */
  sceneCount?: number;
  /** Brief explanation for logging */
  reason: string;
}

// Known model names that users might mention
const MODEL_ALIASES: Record<string, string> = {
  "gpt": "gpt-image",
  "gpt-image": "gpt-image",
  "gpt image": "gpt-image",
  "gpt-image-2": "gpt-image",
  "dalle": "gpt-image",
  "dall-e": "gpt-image",
  "flux": "flux-dev",
  "flux-dev": "flux-dev",
  "flux dev": "flux-dev",
  "recraft": "recraft-v4",
  "recraft-v4": "recraft-v4",
  "nano": "nano-banana",
  "nanobana": "nano-banana",
  "nano-banana": "nano-banana",
  "nanobanana": "nano-banana",
  "gemini": "gemini-image",
  "gemini-image": "gemini-image",
  "seedream": "seedream-5-lite",
  "kontext": "kontext-edit",
  "kontext-edit": "kontext-edit",
};

/**
 * Extract model names mentioned in the prompt.
 * Returns resolved capability names.
 */
function extractMentionedModels(text: string): string[] {
  const lower = text.toLowerCase();
  const found = new Set<string>();

  // Sort aliases by length (longest first) to match "gpt-image" before "gpt"
  const sorted = Object.entries(MODEL_ALIASES).sort((a, b) => b[0].length - a[0].length);
  for (const [alias, capability] of sorted) {
    if (lower.includes(alias)) {
      found.add(capability);
    }
  }

  return Array.from(found);
}

/**
 * Fast heuristic check: does this prompt need LLM intent planning?
 * Most prompts don't — "a cat on a roof" should go straight to the agent.
 */
function needsPlanning(text: string): boolean {
  const lower = text.toLowerCase();

  // Mentions multiple models → comparison intent
  if (extractMentionedModels(text).length >= 2) return true;

  // Mentions "compare" or "side by side" explicitly
  if (/compare|side.by.side|versus|vs\b|each model|all models|every model/i.test(lower)) return true;

  // Lists multiple distinct items with "and" or commas (batch intent)
  // e.g., "a cat, a dog, and a bird" — but NOT "a cat with spots and stripes"
  const commaItems = text.split(/,/).length;
  if (commaItems >= 3 && /\b(each|every|all|separately|individual)\b/i.test(lower)) return true;

  return false;
}

/**
 * Plan the user's intent. Fast path (no LLM) for clear cases.
 *
 * Returns null if the prompt should go through the normal agent flow.
 */
export function planIntent(text: string): IntentPlan | null {
  if (!needsPlanning(text)) return null;

  const models = extractMentionedModels(text);

  // Clear comparison intent: multiple models mentioned
  if (models.length >= 2) {
    // Strip model names from the prompt to get the clean creative description
    let cleanPrompt = text;
    // Remove the "using X, Y, Z" prefix
    cleanPrompt = cleanPrompt.replace(
      /(?:using|with|via|try|compare|test)\s+[\w\s,\-]+(?:to\s+(?:create|generate|make|produce|draw|render))/i,
      ""
    ).trim();
    // Remove individual model name mentions
    for (const alias of Object.keys(MODEL_ALIASES)) {
      cleanPrompt = cleanPrompt.replace(new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, "gi"), "");
    }
    // Clean up leftover punctuation and whitespace
    cleanPrompt = cleanPrompt
      .replace(/^[\s,;:.\-]+/, "")
      .replace(/[\s,;:.\-]+$/, "")
      .replace(/\s{2,}/g, " ")
      .trim();

    // If cleaning removed everything, use original
    if (cleanPrompt.length < 10) cleanPrompt = text;

    return {
      type: "compare_models",
      models,
      prompt: cleanPrompt,
      reason: `Compare ${models.length} models: ${models.join(", ")}`,
    };
  }

  return null;
}

/**
 * Execute a comparison plan — creates one card per model, all in parallel.
 */
export async function executeComparisonPlan(plan: IntentPlan): Promise<string> {
  if (plan.type !== "compare_models" || !plan.models || !plan.prompt) {
    return "";
  }

  const { executeTool } = await import("@/lib/tools/registry");

  // Build steps: one per model, same prompt, each with model_override
  const steps = plan.models.map((model) => ({
    action: "generate",
    prompt: plan.prompt!,
    model_override: model,
  }));

  const result = await executeTool("create_media", { steps });

  if (result.success) {
    const data = result.data as { results?: Array<{ refId: string; capability: string }> };
    const summary = data?.results?.map(
      (r) => `${r.refId} (${r.capability})`
    ).join(", ");
    return `Model comparison: ${plan.models!.length} versions created — ${summary}`;
  }

  return `Comparison started but some models failed: ${result.error || "check canvas"}`;
}

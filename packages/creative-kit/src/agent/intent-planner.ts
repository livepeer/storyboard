/**
 * Intent Planner — understand what the user actually wants before routing.
 *
 * Shared across apps (storyboard, creative-stage). Each app wires its own
 * execution logic; this module provides intent detection only.
 *
 * Detects:
 * - "compare_models" — user names 2+ models, wants side-by-side comparison
 * - more intents can be added without touching app code
 */

export type PlanType =
  | "compare_models"
  | "passthrough";

export interface IntentPlan {
  type: PlanType;
  models?: string[];
  prompt?: string;
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
export function extractMentionedModels(text: string): string[] {
  const lower = text.toLowerCase();
  const found = new Set<string>();
  const sorted = Object.entries(MODEL_ALIASES).sort((a, b) => b[0].length - a[0].length);
  for (const [alias, capability] of sorted) {
    if (lower.includes(alias)) {
      found.add(capability);
    }
  }
  return Array.from(found);
}

/**
 * Strip model names and meta-instructions from a prompt,
 * returning just the creative description.
 */
export function cleanPrompt(text: string): string {
  let clean = text;
  // Remove "using X, Y, Z to create/generate/make" prefix
  clean = clean.replace(
    /(?:using|with|via|try|compare|test)\s+[\w\s,\-]+(?:to\s+(?:create|generate|make|produce|draw|render))/i,
    ""
  ).trim();
  // Remove individual model names
  for (const alias of Object.keys(MODEL_ALIASES)) {
    clean = clean.replace(new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, "gi"), "");
  }
  // Clean up leftover punctuation
  clean = clean
    .replace(/,\s*,/g, ",")
    .replace(/^[\s,;:.\-]+/, "")
    .replace(/[\s,;:.\-]+$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  // Remove meta phrases like "so i can compare", "the image of the following"
  clean = clean
    .replace(/so\s+i\s+can\s+compare\.?/i, "")
    .replace(/the\s+image\s+of\s+the\s+following\s*[,.]?\s*/i, "")
    .trim();
  return clean.length >= 10 ? clean : text;
}

/**
 * Detect user intent from prompt text. Returns null if no special
 * intent detected (should go through normal agent flow).
 */
export function planIntent(text: string): IntentPlan | null {
  const models = extractMentionedModels(text);
  if (models.length >= 2) {
    return {
      type: "compare_models",
      models,
      prompt: cleanPrompt(text),
      reason: `Compare ${models.length} models: ${models.join(", ")}`,
    };
  }
  return null;
}

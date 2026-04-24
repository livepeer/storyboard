/**
 * Intent Planner — LLM-powered understanding of user intent.
 *
 * Three-tier fallback:
 *   1. LLM classifier (reads skill file + preferences, ~300ms)
 *   2. Regex classifier (hardcoded patterns, <1ms)
 *   3. Human-in-loop (ask user to clarify, 0ms + wait)
 *
 * The LLM's "knowledge" of what intents exist comes from a skill file
 * (skills/intent-classifier.md by default). Users can modify this file
 * or load additional intent skills to extend the classifier's vocabulary.
 *
 * On Vercel: skill files live in /public/skills/ (static assets). The
 * LLM call goes through the app's existing /api/agent/gemini route.
 * No server state, no database — works identically in dev and prod.
 */

// ── Types ──

export type PlanType =
  | "compare_models"
  | "batch_generate"
  | "style_sweep"
  | "variations"
  | "story"
  | "single"
  | "unclear"
  | "passthrough";

export interface IntentPlan {
  type: PlanType;
  confidence: number;
  /** For compare_models */
  models?: string[];
  /** The cleaned creative prompt */
  prompt?: string;
  /** For batch_generate: individual prompts */
  prompts?: string[];
  /** For style_sweep: style descriptions */
  styles?: string[];
  /** For batch/variations: count */
  count?: number;
  /** Brief explanation */
  reason: string;
  /** For unclear: what we'd guess if forced */
  fallbackIntent?: PlanType;
}

// ── Model alias resolution ──

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

export function extractMentionedModels(text: string): string[] {
  const lower = text.toLowerCase();
  const found = new Set<string>();
  const sorted = Object.entries(MODEL_ALIASES).sort((a, b) => b[0].length - a[0].length);
  for (const [alias, capability] of sorted) {
    if (lower.includes(alias)) found.add(capability);
  }
  return Array.from(found);
}

export function cleanPrompt(text: string): string {
  let clean = text;
  clean = clean.replace(
    /(?:using|with|via|try|compare|test)\s+[\w\s,\-]+(?:to\s+(?:create|generate|make|produce|draw|render))/i,
    ""
  ).trim();
  for (const alias of Object.keys(MODEL_ALIASES)) {
    clean = clean.replace(new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, "gi"), "");
  }
  clean = clean
    .replace(/,\s*,/g, ",")
    .replace(/^[\s,;:.\-]+/, "")
    .replace(/[\s,;:.\-]+$/, "")
    .replace(/\s{2,}/g, " ")
    .replace(/so\s+i\s+can\s+compare\.?/i, "")
    .replace(/the\s+image\s+of\s+the\s+following\s*[,.]?\s*/i, "")
    .trim();
  return clean.length >= 10 ? clean : text;
}

// ── Tier 1: LLM classifier ──

export interface LLMClassifierConfig {
  /** URL to POST Gemini-format messages (e.g. "/api/agent/gemini") */
  llmEndpoint: string;
  /** Loaded skill content (markdown). If null, uses regex fallback. */
  skillContent: string | null;
  /** User preferences summary from creative memory */
  preferencesSummary?: string;
  /** Canvas state summary ("5 images, 2 videos") */
  canvasSummary?: string;
}

/**
 * Classify intent using LLM with skill knowledge.
 * Returns null on LLM failure (caller should fall back to regex).
 */
export async function classifyWithLLM(
  text: string,
  config: LLMClassifierConfig,
): Promise<IntentPlan | null> {
  if (!config.skillContent) return null;

  const systemPrompt = [
    config.skillContent,
    config.preferencesSummary ? `\nUser preferences: ${config.preferencesSummary}` : "",
    config.canvasSummary ? `\nCanvas state: ${config.canvasSummary}` : "",
  ].join("");

  try {
    const resp = await fetch(config.llmEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          { role: "user", parts: [{ text: `${systemPrompt}\n\n---\nUser message: "${text.slice(0, 500)}"\n\nClassify and respond with JSON only:` }] },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 300,
        },
      }),
    });

    if (!resp.ok) return null;
    const data = await resp.json();
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";

    // Extract JSON from response (might be wrapped in ```json blocks)
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as {
      intent: string;
      confidence: number;
      params: Record<string, unknown>;
      reason: string;
      fallback_intent?: string;
    };

    // Map LLM intent string to our PlanType
    const intentMap: Record<string, PlanType> = {
      "COMPARE_MODELS": "compare_models",
      "BATCH_GENERATE": "batch_generate",
      "STYLE_SWEEP": "style_sweep",
      "VARIATIONS": "variations",
      "STORY": "story",
      "SINGLE": "single",
      "UNCLEAR": "unclear",
    };

    const type = intentMap[parsed.intent] || "single";
    const plan: IntentPlan = {
      type,
      confidence: parsed.confidence ?? 0.5,
      reason: parsed.reason || "LLM classified",
      prompt: (parsed.params.prompt as string) || cleanPrompt(text),
    };

    // Populate type-specific fields
    if (type === "compare_models") {
      const rawModels = parsed.params.models as string[] | undefined;
      plan.models = rawModels?.map((m) => MODEL_ALIASES[m.toLowerCase()] || m) || extractMentionedModels(text);
      if (!plan.models || plan.models.length < 2) return null; // not a valid comparison
    }
    if (type === "batch_generate") {
      plan.prompts = parsed.params.prompts as string[] | undefined;
      plan.count = (parsed.params.count as number) || plan.prompts?.length || 1;
    }
    if (type === "style_sweep") {
      plan.styles = parsed.params.styles as string[] | undefined;
    }
    if (type === "variations") {
      plan.count = (parsed.params.count as number) || 4;
    }
    if (type === "unclear") {
      const fb = parsed.fallback_intent;
      plan.fallbackIntent = fb ? (intentMap[fb] || "single") : "single";
    }

    // Validate: plan must be executable
    if (!plan.prompt && !plan.prompts?.length) {
      plan.prompt = cleanPrompt(text);
    }

    return plan;
  } catch (e) {
    console.warn("[IntentPlanner] LLM classification failed:", e);
    return null;
  }
}

// ── Auto-fill: pick diverse models when user asks for N but names fewer ──

/** Default image models in preference order for comparison. */
const DEFAULT_IMAGE_MODELS = [
  "flux-dev", "gpt-image", "recraft-v4", "nano-banana",
  "gemini-image", "seedream-5-lite", "kontext-edit",
];

/**
 * If user requests N models but only names some, auto-fill the rest
 * from defaults (excluding already-named ones).
 */
function autoFillModels(named: string[], requested: number): string[] {
  const result = [...named];
  for (const m of DEFAULT_IMAGE_MODELS) {
    if (result.length >= requested) break;
    if (!result.includes(m)) result.push(m);
  }
  return result.slice(0, requested);
}

/**
 * Detect "N models" / "N different models" pattern.
 * Returns the requested count, or 0 if not detected.
 */
function detectModelCountRequest(text: string): number {
  const lower = text.toLowerCase();
  // "4 different models", "using 3 models", "compare 5 models"
  const m = lower.match(/(\d+)\s+(?:different\s+)?(?:models?|ai\s+models?)/);
  if (m) return parseInt(m[1], 10);
  // "multiple models", "several models", "various models"
  if (/(?:multiple|several|various|many|all)\s+(?:different\s+)?(?:models?|ai\s+models?)/.test(lower)) return 4;
  return 0;
}

// ── Tier 2: Regex classifier (fast fallback) ──

export function classifyWithRegex(text: string): IntentPlan {
  const lower = text.toLowerCase();
  const models = extractMentionedModels(text);

  // Compare models: 2+ model names explicitly
  if (models.length >= 2) {
    return {
      type: "compare_models",
      confidence: 0.95,
      models,
      prompt: cleanPrompt(text),
      reason: `Detected ${models.length} model names`,
    };
  }

  // Compare models: "N models" / "N different models" (partially named)
  const requestedCount = detectModelCountRequest(text);
  if (requestedCount >= 2) {
    const filled = autoFillModels(models, requestedCount);
    return {
      type: "compare_models",
      confidence: 0.85,
      models: filled,
      prompt: cleanPrompt(text),
      reason: `User requested ${requestedCount} models (${models.length} named, ${filled.length - models.length} auto-filled): ${filled.join(", ")}`,
    };
  }

  // Variations: explicit keywords
  if (/\b(variations?|alternatives?|options|versions|different ways)\b/i.test(lower) && !/story|scene|shot/i.test(lower)) {
    return {
      type: "variations",
      confidence: 0.8,
      prompt: cleanPrompt(text),
      count: 4,
      reason: "Variation keywords detected",
    };
  }

  // Style sweep: "in X, Y, and Z style"
  const styleMatch = lower.match(/\b(?:in|as|using)\s+(\w+(?:\s+\w+)?)\s*,\s*(\w+(?:\s+\w+)?)\s*(?:,\s*(\w+(?:\s+\w+)?))?\s*(?:and\s+(\w+(?:\s+\w+)?))?\s*(?:style|look|aesthetic)/i);
  if (styleMatch) {
    const styles = [styleMatch[1], styleMatch[2], styleMatch[3], styleMatch[4]].filter(Boolean) as string[];
    if (styles.length >= 2) {
      return {
        type: "style_sweep",
        confidence: 0.8,
        styles,
        prompt: cleanPrompt(text),
        reason: `Detected ${styles.length} style names`,
      };
    }
  }

  // Batch: "make a X, a Y, and a Z" (distinct articles/items)
  const articleItems = text.match(/\ba\s+\w+(?:\s+\w+){0,3}(?=\s*[,]|\s+and\s)/gi);
  if (articleItems && articleItems.length >= 3) {
    return {
      type: "batch_generate",
      confidence: 0.6,
      prompts: articleItems.map((a) => a.trim()),
      count: articleItems.length,
      prompt: cleanPrompt(text),
      reason: `Detected ${articleItems.length} distinct items`,
    };
  }

  // Story: scene markers or long text
  if (/scene\s*\d/i.test(lower) && (lower.match(/scene/gi) || []).length >= 3) {
    return { type: "story", confidence: 0.95, prompt: text, reason: "Scene markers detected" };
  }
  if (text.length > 500 && /storyboard|campaign|scenes/i.test(lower)) {
    return { type: "story", confidence: 0.7, prompt: text, reason: "Long brief with story keywords" };
  }

  // Default: single image
  return {
    type: "single",
    confidence: 0.5,
    prompt: text,
    reason: "No special intent detected — single generation",
  };
}

// ── Tier 3: Combined planner ──

/**
 * Plan the user's intent with full fallback chain.
 *
 * Priority order:
 *   1. Deterministic regex checks (model names, scene markers) — these are
 *      FACTS about the text that an LLM can get wrong. Run first.
 *   2. LLM classifier for ambiguous cases
 *   3. Regex fallback for everything else
 *   4. If unclear + confidence < 0.5, return "unclear" for human-in-loop
 *
 * Never returns null. Always returns an executable plan.
 */
export async function planIntent(
  text: string,
  config?: LLMClassifierConfig,
): Promise<IntentPlan> {
  // Tier 0: Deterministic checks — ALWAYS run first.
  // Model names are facts. If 2+ model names appear, it's a comparison.
  const models = extractMentionedModels(text);
  if (models.length >= 2) {
    const plan: IntentPlan = {
      type: "compare_models",
      confidence: 0.99,
      models,
      prompt: cleanPrompt(text),
      reason: `${models.length} model names detected: ${models.join(", ")}`,
    };
    console.log(`[IntentPlanner] Deterministic: ${plan.reason}`);
    return plan;
  }

  // "N different models" / "4 models" — user wants comparison but named
  // fewer than N. Auto-fill from defaults (e.g. "4 models, include gpt-image"
  // → gpt-image + flux-dev + recraft-v4 + nano-banana)
  const requestedCount = detectModelCountRequest(text);
  if (requestedCount >= 2) {
    const filled = autoFillModels(models, requestedCount);
    const plan: IntentPlan = {
      type: "compare_models",
      confidence: 0.90,
      models: filled,
      prompt: cleanPrompt(text),
      reason: `User requested ${requestedCount} models (${models.length} named, auto-filled to ${filled.length}): ${filled.join(", ")}`,
    };
    console.log(`[IntentPlanner] Deterministic (auto-fill): ${plan.reason}`);
    return plan;
  }

  // Tier 1: LLM (if available) — for ambiguous intents where regex can't decide
  if (config?.skillContent) {
    const llmPlan = await classifyWithLLM(text, config);
    if (llmPlan && llmPlan.confidence >= 0.5) {
      console.log(`[IntentPlanner] LLM: ${llmPlan.type} (${llmPlan.confidence}) — ${llmPlan.reason}`);
      return llmPlan;
    }
    if (llmPlan?.type === "unclear" && llmPlan.fallbackIntent) {
      console.log(`[IntentPlanner] LLM uncertain, suggesting ${llmPlan.fallbackIntent}`);
      return llmPlan; // caller should ask user
    }
  }

  // Tier 2: Regex for remaining patterns
  const regexPlan = classifyWithRegex(text);
  console.log(`[IntentPlanner] Regex: ${regexPlan.type} (${regexPlan.confidence}) — ${regexPlan.reason}`);
  return regexPlan;
}

// ── Plan Validation (Tier between classify and execute) ──

export interface ValidationResult {
  valid: boolean;
  plan: IntentPlan;
  /** What was fixed or why it failed */
  notes: string;
}

/**
 * Validate a plan: ensure it's executable and matches user intent.
 *
 * Checks:
 * 1. Required fields present (prompt, models, etc.)
 * 2. Models exist in live capability list (if provided)
 * 3. LLM review: does the plan match what the user actually asked? (~200ms)
 * 4. Auto-fix: fill in defaults for missing optional fields
 *
 * Returns the (possibly fixed) plan with validation notes.
 */
export async function validatePlan(
  plan: IntentPlan,
  originalText: string,
  config?: LLMClassifierConfig,
): Promise<ValidationResult> {
  const fixes: string[] = [];

  // Structural validation — fix missing fields
  if (!plan.prompt && !plan.prompts?.length) {
    plan.prompt = cleanPrompt(originalText);
    fixes.push("Added missing prompt from original text");
  }

  if (plan.type === "compare_models") {
    if (!plan.models || plan.models.length < 2) {
      const detected = extractMentionedModels(originalText);
      if (detected.length >= 2) {
        plan.models = detected;
        fixes.push(`Fixed models from text: ${detected.join(", ")}`);
      } else {
        return { valid: false, plan, notes: "Comparison needs 2+ models but none found in text" };
      }
    }
  }

  if (plan.type === "batch_generate" && (!plan.prompts || plan.prompts.length === 0)) {
    if (plan.prompt) {
      plan.prompts = [plan.prompt];
      plan.count = 1;
      fixes.push("Batch with single prompt → treated as single generation");
      plan.type = "single";
    }
  }

  if (plan.type === "style_sweep" && (!plan.styles || plan.styles.length < 2)) {
    fixes.push("Style sweep needs 2+ styles — falling back to single");
    plan.type = "single";
  }

  if (plan.type === "variations") {
    plan.count = plan.count || 4;
  }

  // LLM review (optional, only if endpoint available and plan is non-trivial)
  if (config?.llmEndpoint && plan.type !== "single" && plan.type !== "passthrough") {
    try {
      const reviewResp = await fetch(config.llmEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            role: "user",
            parts: [{
              text: `Review this execution plan. Reply with JSON: {"approved": true/false, "fix": "what to change or null"}

User said: "${originalText.slice(0, 300)}"

Plan:
- Type: ${plan.type}
- Models: ${plan.models?.join(", ") || "default"}
- Prompt: "${plan.prompt?.slice(0, 200) || ""}"
- Count: ${plan.count || "N/A"}
${plan.styles ? `- Styles: ${plan.styles.join(", ")}` : ""}
${plan.prompts ? `- Prompts: ${plan.prompts.length} items` : ""}

Does this plan match what the user wants? Is anything missing?`,
            }],
          }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 150 },
        }),
      });

      if (reviewResp.ok) {
        const reviewData = await reviewResp.json();
        const reviewText = reviewData.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
        const jsonMatch = reviewText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const review = JSON.parse(jsonMatch[0]) as { approved: boolean; fix?: string };
          if (!review.approved && review.fix) {
            fixes.push(`LLM review: ${review.fix}`);
            // Don't reject — just note the concern. The plan is still valid.
          }
        }
      }
    } catch {
      // LLM review failed — plan is still valid from structural checks
    }
  }

  console.log(`[IntentPlanner] Validation: ${fixes.length > 0 ? fixes.join("; ") : "OK"}`);
  return {
    valid: true,
    plan,
    notes: fixes.length > 0 ? fixes.join("; ") : "Plan validated",
  };
}

// Backwards-compatible sync version for simple cases (model comparison detection)
export function planIntentSync(text: string): IntentPlan | null {
  const models = extractMentionedModels(text);
  if (models.length >= 2) {
    return {
      type: "compare_models",
      confidence: 0.95,
      models,
      prompt: cleanPrompt(text),
      reason: `Compare ${models.length} models: ${models.join(", ")}`,
    };
  }
  return null;
}

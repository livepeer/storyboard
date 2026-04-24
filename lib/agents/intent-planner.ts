/**
 * Intent Planner — storyboard wrapper around creative-kit's planner.
 *
 * Adds:
 * - Skill file loading (fetches /skills/intent-classifier.md + user skills)
 * - Creative memory preferences injection
 * - Canvas state summary
 * - Storyboard-specific execution (create_media, project_create, etc.)
 * - Human-in-loop for unclear intents
 */

export { planIntentSync, cleanPrompt, extractMentionedModels, type IntentPlan, type PlanType } from "@livepeer/creative-kit";
import { planIntent as planIntentFull, validatePlan, type IntentPlan, type LLMClassifierConfig } from "@livepeer/creative-kit";

// ── Skill loading ──

let cachedSkillContent: string | null = null;
let skillLoadAttempted = false;

/**
 * Load the intent classifier skill file.
 * Fetches from /skills/intent-classifier.md (static asset on Vercel).
 * Caches in-memory after first load. Also loads any user-added intent skills.
 */
async function loadIntentSkill(): Promise<string | null> {
  if (skillLoadAttempted) return cachedSkillContent;
  skillLoadAttempted = true;

  try {
    const resp = await fetch("/skills/intent-classifier.md");
    if (!resp.ok) return null;
    cachedSkillContent = await resp.text();

    // Also load user-added intent skills from the skill store
    try {
      const { useSkillStore } = await import("@/lib/skills/store");
      const store = useSkillStore.getState();
      const intentSkills = store.registry.filter(
        (s) => s.category === "intent" || s.id.startsWith("intent-")
      );
      for (const skill of intentSkills) {
        if (store.loaded.includes(skill.id)) {
          const content = store.contentCache[skill.id];
          if (content) cachedSkillContent += "\n\n---\n" + content;
        }
      }
    } catch { /* user skills optional */ }

    return cachedSkillContent;
  } catch {
    return null;
  }
}

// ── Context gathering ──

async function buildConfig(): Promise<LLMClassifierConfig> {
  const skillContent = await loadIntentSkill();

  let preferencesSummary: string | undefined;
  try {
    const { buildPreferencePrefix, getPreferredModel } = await import("@livepeer/creative-kit");
    const prefix = buildPreferencePrefix();
    const model = getPreferredModel();
    if (prefix || model) {
      preferencesSummary = [
        prefix ? `Style preferences: ${prefix}` : "",
        model ? `Preferred model: ${model}` : "",
      ].filter(Boolean).join(". ");
    }
  } catch { /* preferences optional */ }

  let canvasSummary: string | undefined;
  try {
    const { useCanvasStore } = await import("@/lib/canvas/store");
    const cards = useCanvasStore.getState().cards;
    const byType: Record<string, number> = {};
    for (const c of cards) byType[c.type] = (byType[c.type] || 0) + 1;
    canvasSummary = Object.entries(byType).map(([t, n]) => `${n} ${t}s`).join(", ") || "empty canvas";
  } catch { /* canvas optional */ }

  return {
    llmEndpoint: "/api/agent/gemini",
    skillContent,
    preferencesSummary,
    canvasSummary,
  };
}

// ── Public API ──

/**
 * Full pipeline: classify → validate → return executable plan.
 *
 *   classify(text) → raw plan
 *   validate(plan, text) → fix missing fields, LLM review
 *   → return validated plan (always executable, never empty)
 */
export async function classifyIntent(text: string): Promise<IntentPlan> {
  const config = await buildConfig();

  // Step 1: Classify
  const rawPlan = await planIntentFull(text, config);

  // Step 2: Validate (fix missing fields, LLM sanity check)
  if (rawPlan.type !== "single" && rawPlan.type !== "passthrough") {
    const validation = await validatePlan(rawPlan, text, config);
    console.log(`[IntentPlanner] Validation: ${validation.notes}`);
    return validation.plan;
  }

  return rawPlan;
}

/**
 * Execute a plan. Returns a chat message summary, or null if the caller
 * should let the agent handle it (single/story/passthrough).
 */
export async function executePlan(plan: IntentPlan): Promise<string | null> {
  switch (plan.type) {
    case "compare_models":
      return executeComparisonPlan(plan);
    case "batch_generate":
      return executeBatchPlan(plan);
    case "style_sweep":
      return executeStyleSweepPlan(plan);
    case "variations":
      return executeVariationsPlan(plan);
    case "unclear":
      // Return null — caller should ask the user via human-in-loop
      return null;
    default:
      // single, story, passthrough — let the agent handle
      return null;
  }
}

// ── Plan executors ──

async function executeComparisonPlan(plan: IntentPlan): Promise<string> {
  const { executeTool } = await import("@/lib/tools/registry");
  const steps = (plan.models || []).map((model) => ({
    action: "generate",
    prompt: plan.prompt!,
    model_override: model,
  }));
  const result = await executeTool("create_media", { steps });
  if (result.success) {
    const data = result.data as { results?: Array<{ refId: string; capability: string }> };
    const summary = data?.results?.map((r) => `${r.refId} (${r.capability})`).join(", ");
    return `Model comparison: ${plan.models!.length} versions — ${summary}`;
  }
  return `Comparison failed: ${result.error || "check canvas"}`;
}

async function executeBatchPlan(plan: IntentPlan): Promise<string> {
  const { executeTool } = await import("@/lib/tools/registry");
  const prompts = plan.prompts || [plan.prompt!];
  const steps = prompts.map((p) => ({ action: "generate", prompt: p }));
  const result = await executeTool("create_media", { steps });
  if (result.success) {
    return `Created ${prompts.length} images`;
  }
  return `Batch generation: ${result.error || "check canvas"}`;
}

async function executeStyleSweepPlan(plan: IntentPlan): Promise<string> {
  const { executeTool } = await import("@/lib/tools/registry");
  const styles = plan.styles || [];
  const basePrompt = plan.prompt || "";
  const steps = styles.map((style) => ({
    action: "generate",
    prompt: `${style} style, ${basePrompt}`,
  }));
  const result = await executeTool("create_media", { steps });
  if (result.success) {
    return `Style sweep: ${styles.length} versions — ${styles.join(", ")}`;
  }
  return `Style sweep: ${result.error || "check canvas"}`;
}

async function executeVariationsPlan(plan: IntentPlan): Promise<string> {
  const { executeTool } = await import("@/lib/tools/registry");
  const { buildVariationSteps } = await import("@livepeer/creative-kit");
  const steps = buildVariationSteps({
    sourceRefId: "",
    sourceUrl: "",
    prompt: plan.prompt!,
    capability: "flux-dev",
    count: plan.count || 4,
    strategy: "mixed",
  });
  // For text-only variations (no source), change action to "generate"
  const genSteps = steps.map((s) => ({
    action: "generate" as const,
    prompt: s.prompt,
  }));
  const result = await executeTool("create_media", { steps: genSteps });
  if (result.success) {
    return `${genSteps.length} variations created`;
  }
  return `Variations: ${result.error || "check canvas"}`;
}

/**
 * Intent Planner — storyboard app wrapper around creative-kit's planner.
 *
 * Re-exports the shared planner + adds storyboard-specific execution
 * (uses create_media tool with model_override per step).
 */

export { planIntent, cleanPrompt, extractMentionedModels, type IntentPlan, type PlanType } from "@livepeer/creative-kit";

import type { IntentPlan } from "@livepeer/creative-kit";

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

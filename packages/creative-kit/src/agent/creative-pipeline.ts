/**
 * Creative Pipeline — the primary API for the agent SDK.
 *
 * Unified pipeline: classify → validate → execute → evaluate
 *
 * Usage:
 *   const pipeline = createCreativePipeline({ llmEndpoint, sdkUrl, ... });
 *   const plan = await pipeline.classify("compare gpt and flux for a sunset");
 *   const validated = await pipeline.validate(plan, originalText);
 *   const result = await pipeline.execute(validated.plan);
 *   // result.cards are on the canvas, user evaluates visually
 *
 * This is the recommended entry point for all creative intent processing.
 * Apps wire their own execution backends (storyboard uses create_media,
 * creative-stage uses direct SDK inference calls).
 */

import {
  planIntent,
  validatePlan,
  classifyWithRegex,
  type IntentPlan,
  type LLMClassifierConfig,
  type ValidationResult,
} from "./intent-planner";

// ── Types ──

export interface PipelineConfig {
  /** LLM endpoint for classification + validation (e.g. "/api/agent/gemini") */
  llmEndpoint?: string;
  /** Intent classifier skill content (markdown). Null = regex only. */
  skillContent?: string | null;
  /** User preference summary from creative memory */
  preferencesSummary?: string;
  /** Canvas state summary */
  canvasSummary?: string;
  /** Executor: how to actually run inference. Apps provide this. */
  executor: PipelineExecutor;
}

export interface PipelineExecutor {
  /** Run a single inference step. Returns the output URL or null on failure. */
  infer(prompt: string, model: string, params?: Record<string, unknown>): Promise<{ url: string } | null>;
  /** Place a result on the canvas/artifact store. */
  addResult(opts: { type: string; title: string; url: string; model: string; index: number }): void;
  /** Show a message to the user. */
  say(msg: string): void;
}

export interface PipelineResult {
  plan: IntentPlan;
  validation: ValidationResult;
  /** Whether the pipeline handled the request (false = pass to agent) */
  handled: boolean;
  /** Number of successful outputs */
  successCount: number;
  /** Total attempted */
  totalCount: number;
  /** Summary message */
  summary: string;
}

// ── Pipeline ──

export interface CreativePipeline {
  /** Step 1: Classify user intent */
  classify(text: string): Promise<IntentPlan>;
  /** Step 2: Validate the plan */
  validate(plan: IntentPlan, originalText: string): Promise<ValidationResult>;
  /** Step 3: Execute the validated plan */
  execute(plan: IntentPlan): Promise<PipelineResult>;
  /** Full pipeline: classify → validate → execute */
  run(text: string): Promise<PipelineResult>;
}

export function createCreativePipeline(config: PipelineConfig): CreativePipeline {
  const llmConfig: LLMClassifierConfig = {
    llmEndpoint: config.llmEndpoint || "",
    skillContent: config.skillContent ?? null,
    preferencesSummary: config.preferencesSummary,
    canvasSummary: config.canvasSummary,
  };

  const { executor } = config;

  return {
    async classify(text: string): Promise<IntentPlan> {
      return planIntent(text, llmConfig.skillContent ? llmConfig : undefined);
    },

    async validate(plan: IntentPlan, originalText: string): Promise<ValidationResult> {
      return validatePlan(plan, originalText, llmConfig.llmEndpoint ? llmConfig : undefined);
    },

    async execute(plan: IntentPlan): Promise<PipelineResult> {
      const passthrough: PipelineResult = {
        plan,
        validation: { valid: true, plan, notes: "Passthrough" },
        handled: false,
        successCount: 0,
        totalCount: 0,
        summary: "Passed to agent",
      };

      // Only execute actionable plan types
      if (plan.type === "single" || plan.type === "passthrough" || plan.type === "story") {
        return passthrough;
      }

      if (plan.type === "unclear") {
        executor.say("I'm not sure what you'd like. Could you be more specific?");
        return { ...passthrough, summary: "Asked user to clarify" };
      }

      // Build task list based on plan type
      let tasks: Array<{ prompt: string; model: string }> = [];

      switch (plan.type) {
        case "compare_models":
          if (!plan.models?.length) return passthrough;
          executor.say(`Comparing ${plan.models.length} models: ${plan.models.join(", ")}`);
          tasks = plan.models.map((m) => ({ prompt: plan.prompt!, model: m }));
          break;

        case "batch_generate":
          if (!plan.prompts?.length && !plan.prompt) return passthrough;
          const prompts = plan.prompts?.length ? plan.prompts : [plan.prompt!];
          executor.say(`Generating ${prompts.length} images…`);
          tasks = prompts.map((p) => ({ prompt: p, model: "flux-dev" }));
          break;

        case "style_sweep":
          if (!plan.styles?.length) return passthrough;
          executor.say(`Style sweep: ${plan.styles.join(", ")}`);
          tasks = plan.styles.map((s) => ({ prompt: `${s} style, ${plan.prompt}`, model: "flux-dev" }));
          break;

        case "variations":
          const count = plan.count || 4;
          executor.say(`Generating ${count} variations…`);
          tasks = Array.from({ length: count }, (_, i) => ({
            prompt: i === 0 ? plan.prompt! : `alternative composition ${i + 1}, ${plan.prompt}`,
            model: "flux-dev",
          }));
          break;
      }

      if (tasks.length === 0) return passthrough;

      // Execute all tasks in parallel
      const results = await Promise.allSettled(
        tasks.map((t) => executor.infer(t.prompt, t.model))
      );

      let ok = 0;
      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        if (r.status === "fulfilled" && r.value) {
          executor.addResult({
            type: "image",
            title: `${tasks[i].model}: ${plan.prompt?.slice(0, 25) || ""}`,
            url: r.value.url,
            model: tasks[i].model,
            index: i,
          });
          ok++;
        }
      }

      const summary = `${ok}/${tasks.length} succeeded`;
      executor.say(`Done — ${summary}`);

      return {
        plan,
        validation: { valid: true, plan, notes: "Executed" },
        handled: true,
        successCount: ok,
        totalCount: tasks.length,
        summary,
      };
    },

    async run(text: string): Promise<PipelineResult> {
      // Full pipeline: classify → validate → execute
      const plan = await this.classify(text);

      if (plan.type === "single" || plan.type === "passthrough" || plan.type === "story") {
        return {
          plan,
          validation: { valid: true, plan, notes: "Passthrough" },
          handled: false,
          successCount: 0,
          totalCount: 0,
          summary: "Passed to agent",
        };
      }

      const validation = await this.validate(plan, text);
      if (!validation.valid) {
        executor.say(`Plan invalid: ${validation.notes}`);
        return {
          plan: validation.plan,
          validation,
          handled: false,
          successCount: 0,
          totalCount: 0,
          summary: `Invalid: ${validation.notes}`,
        };
      }

      return this.execute(validation.plan);
    },
  };
}

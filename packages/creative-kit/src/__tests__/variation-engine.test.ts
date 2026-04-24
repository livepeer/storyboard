import { describe, it, expect } from "vitest";
import { buildVariationSteps, type VariationOptions } from "../agent/variation-engine";

const BASE_OPTS: VariationOptions = {
  sourceRefId: "img-1",
  sourceUrl: "https://example.com/image.png",
  prompt: "a futuristic city at sunset",
  capability: "flux-dev",
  strategy: "mixed",
};

describe("buildVariationSteps", () => {
  it("generates 4 steps by default", () => {
    const steps = buildVariationSteps(BASE_OPTS);
    expect(steps).toHaveLength(4);
  });

  it('all steps have source_url and action="restyle"', () => {
    const steps = buildVariationSteps(BASE_OPTS);
    for (const step of steps) {
      expect(step.action).toBe("restyle");
      expect(step.source_url).toBe(BASE_OPTS.sourceUrl);
    }
  });

  it("seed strategy: same prompt for all", () => {
    const steps = buildVariationSteps({ ...BASE_OPTS, strategy: "seed" });
    for (const step of steps) {
      expect(step.prompt).toBe(BASE_OPTS.prompt);
      expect(step.seed).toBeTypeOf("number");
    }
  });

  it("prompt strategy: varies prompts", () => {
    const steps = buildVariationSteps({ ...BASE_OPTS, strategy: "prompt" });
    const prompts = steps.map((s) => s.prompt);
    // All should contain the original prompt but have different prefixes
    for (const p of prompts) {
      expect(p).toContain(BASE_OPTS.prompt);
    }
    // At least some prompts should differ from each other
    const unique = new Set(prompts);
    expect(unique.size).toBeGreaterThan(1);
  });

  it("custom count works", () => {
    const steps = buildVariationSteps({ ...BASE_OPTS, count: 7 });
    expect(steps).toHaveLength(7);
  });

  it("mixed strategy: first step has no capability_hint, second has kontext-edit", () => {
    const steps = buildVariationSteps({ ...BASE_OPTS, strategy: "mixed" });
    expect(steps[0].capability_hint).toBeUndefined();
    expect(steps[1].capability_hint).toBe("kontext-edit");
  });

  it("model strategy: odd indices have kontext-edit hint", () => {
    const steps = buildVariationSteps({ ...BASE_OPTS, strategy: "model", count: 4 });
    expect(steps[0].capability_hint).toBeUndefined();
    expect(steps[1].capability_hint).toBe("kontext-edit");
    expect(steps[2].capability_hint).toBeUndefined();
    expect(steps[3].capability_hint).toBe("kontext-edit");
  });

  it("all steps have numeric seeds", () => {
    const steps = buildVariationSteps({ ...BASE_OPTS, strategy: "seed" });
    for (const step of steps) {
      expect(step.seed).toBeTypeOf("number");
      expect(step.seed).toBeGreaterThan(0);
    }
  });
});

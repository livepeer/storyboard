import { describe, it, expect } from "vitest";
import { planIntent } from "@/lib/agents/intent-planner";

describe("planIntent", () => {
  it("detects comparison when multiple models are named", () => {
    const plan = planIntent(
      "using gpt, flux-dev, recraft, nanobana, to create the image of a cat"
    );
    expect(plan).not.toBeNull();
    expect(plan!.type).toBe("compare_models");
    expect(plan!.models).toContain("gpt-image");
    expect(plan!.models).toContain("flux-dev");
    expect(plan!.models).toContain("recraft-v4");
    expect(plan!.models).toContain("nano-banana");
    expect(plan!.models).toHaveLength(4);
  });

  it("extracts the creative prompt without model names", () => {
    const plan = planIntent(
      "using gpt, flux-dev, recraft to create a sunset over mountains"
    );
    expect(plan!.prompt).toContain("sunset");
    expect(plan!.prompt).toContain("mountains");
    expect(plan!.prompt).not.toMatch(/\bgpt\b/i);
    expect(plan!.prompt).not.toMatch(/\bflux-dev\b/i);
  });

  it("returns null for simple prompts with no models", () => {
    const plan = planIntent("a cat sitting on a roof");
    expect(plan).toBeNull();
  });

  it("returns null for single model mention (not comparison)", () => {
    const plan = planIntent("use flux-dev to make a landscape");
    expect(plan).toBeNull();
  });

  it("detects comparison with 'compare' keyword", () => {
    const plan = planIntent("compare gpt and recraft for a portrait photo");
    expect(plan).not.toBeNull();
    expect(plan!.type).toBe("compare_models");
    expect(plan!.models).toContain("gpt-image");
    expect(plan!.models).toContain("recraft-v4");
  });

  it("handles the full user prompt from the real scenario", () => {
    const plan = planIntent(
      `using gpt, flux-dev, recraft, nanobana, to create the image of the following, so i can compare.
a picture of Soft poetic children's book illustration with watercolor and gouache textures.
Clear gentle daylight with slightly brighter highlights.
Two children in calm conversation, soft connection forming.`
    );
    expect(plan).not.toBeNull();
    expect(plan!.type).toBe("compare_models");
    expect(plan!.models).toHaveLength(4);
    expect(plan!.prompt).toContain("children");
    expect(plan!.prompt).toContain("watercolor");
  });
});

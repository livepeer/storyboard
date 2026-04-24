import { describe, it, expect } from "vitest";
import { classifyWithRegex, extractMentionedModels, cleanPrompt } from "@livepeer/creative-kit";

describe("extractMentionedModels", () => {
  it("finds multiple models", () => {
    const models = extractMentionedModels("using gpt, flux-dev, recraft, nanobana");
    expect(models).toContain("gpt-image");
    expect(models).toContain("flux-dev");
    expect(models).toContain("recraft-v4");
    expect(models).toContain("nano-banana");
  });

  it("returns empty for no models", () => {
    expect(extractMentionedModels("a cat on a roof")).toEqual([]);
  });

  it("deduplicates aliases", () => {
    const models = extractMentionedModels("use gpt and gpt-image and dall-e");
    expect(models).toEqual(["gpt-image"]);
  });
});

describe("cleanPrompt", () => {
  it("strips model names and meta phrases", () => {
    const clean = cleanPrompt("using gpt, flux-dev, recraft to create the image of the following, so i can compare. a sunset over mountains");
    expect(clean).toContain("sunset");
    expect(clean).toContain("mountains");
    expect(clean).not.toMatch(/\bgpt\b/i);
    expect(clean).not.toMatch(/\bflux/i);
    expect(clean).not.toMatch(/compare/i);
  });

  it("preserves short prompts", () => {
    expect(cleanPrompt("a cat")).toBe("a cat");
  });
});

describe("classifyWithRegex", () => {
  it("detects compare_models with 2+ models", () => {
    const plan = classifyWithRegex("using gpt, flux-dev, recraft, nanobana to create a cat");
    expect(plan.type).toBe("compare_models");
    expect(plan.models).toHaveLength(4);
    expect(plan.confidence).toBeGreaterThan(0.9);
  });

  it("detects variations intent", () => {
    const plan = classifyWithRegex("show me 4 different variations of a sunset");
    expect(plan.type).toBe("variations");
    expect(plan.count).toBe(4);
  });

  it("detects story with scene markers", () => {
    const plan = classifyWithRegex("Scene 1 — intro\nScene 2 — middle\nScene 3 — end\nScene 4 — credits");
    expect(plan.type).toBe("story");
  });

  it("defaults to single for plain prompts", () => {
    const plan = classifyWithRegex("a cat sitting on a roof at sunset");
    expect(plan.type).toBe("single");
  });

  it("detects batch_generate with listed items", () => {
    const plan = classifyWithRegex("make a ginger tabby, a black cat, a siamese, and a calico");
    expect(plan.type).toBe("batch_generate");
    expect(plan.count).toBeGreaterThanOrEqual(3);
  });

  it("always returns a prompt (never empty)", () => {
    const plan = classifyWithRegex("hello");
    expect(plan.prompt).toBeTruthy();
    expect(plan.prompt!.length).toBeGreaterThan(0);
  });

  it("full user scenario: multi-model comparison", () => {
    const plan = classifyWithRegex(
      `using gpt, flux-dev, recraft, nanobana, to create the image of the following, so i can compare.
a picture of Soft poetic children's book illustration with watercolor and gouache textures.
Clear gentle daylight with slightly brighter highlights.
Two children in calm conversation, soft connection forming.`
    );
    expect(plan.type).toBe("compare_models");
    expect(plan.models).toHaveLength(4);
    expect(plan.prompt).toContain("children");
    expect(plan.prompt).toContain("watercolor");
  });

  it("detects 'N different models' with auto-fill", () => {
    const plan = classifyWithRegex(
      "using 4 different models, include gpt-image to Generate an image of a manuscript"
    );
    expect(plan.type).toBe("compare_models");
    expect(plan.models).toHaveLength(4);
    expect(plan.models).toContain("gpt-image");
    // Should auto-fill 3 more from defaults
    expect(plan.models!.length).toBe(4);
    expect(plan.reason).toContain("auto-filled");
  });

  it("detects 'multiple models' without count", () => {
    const plan = classifyWithRegex(
      "use multiple models to create a sunset painting"
    );
    expect(plan.type).toBe("compare_models");
    expect(plan.models!.length).toBe(4); // defaults to 4
  });

  it("detects 'N models' with no named models", () => {
    const plan = classifyWithRegex(
      "using 3 models to compare a portrait photo"
    );
    expect(plan.type).toBe("compare_models");
    expect(plan.models!.length).toBe(3);
    // All auto-filled from defaults
    expect(plan.models).toContain("flux-dev");
  });

  it("auto-fill puts named model first, then defaults", () => {
    const plan = classifyWithRegex(
      "using 4 different models, include recraft to make a logo"
    );
    expect(plan.models![0]).toBe("recraft-v4"); // named model first
    expect(plan.models).toContain("recraft-v4");
    expect(plan.models!.length).toBe(4);
    // remaining 3 should be from defaults, no duplicates
    expect(new Set(plan.models).size).toBe(4);
  });
});

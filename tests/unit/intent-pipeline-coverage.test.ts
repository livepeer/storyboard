/**
 * Intent Pipeline — comprehensive coverage tests.
 *
 * Tests real user inputs against the classifier to find gaps.
 * Each test documents: input, expected intent, and WHY.
 */
import { describe, it, expect } from "vitest";
import { classifyWithRegex, extractMentionedModels, cleanPrompt, type IntentPlan } from "@livepeer/creative-kit";

// Helper: assert plan type and key fields
function expectPlan(plan: IntentPlan, type: string, checks?: {
  models?: number;
  modelsInclude?: string[];
  promptContains?: string[];
  promptNotContains?: string[];
  count?: number;
  confidence?: number;
}) {
  expect(plan.type).toBe(type);
  if (checks?.models) expect(plan.models?.length).toBe(checks.models);
  if (checks?.modelsInclude) {
    for (const m of checks.modelsInclude) expect(plan.models).toContain(m);
  }
  if (checks?.promptContains) {
    for (const s of checks.promptContains) expect(plan.prompt?.toLowerCase()).toContain(s.toLowerCase());
  }
  if (checks?.promptNotContains) {
    for (const s of checks.promptNotContains) expect(plan.prompt?.toLowerCase()).not.toContain(s.toLowerCase());
  }
  if (checks?.count) expect(plan.count).toBe(checks.count);
  if (checks?.confidence) expect(plan.confidence).toBeGreaterThanOrEqual(checks.confidence);
}

// ═══════════════════════════════════════════════════════════════
// 1. COMPARE MODELS — explicit model names
// ═══════════════════════════════════════════════════════════════
describe("compare_models: explicit model names", () => {
  it("basic: 'using gpt, flux to make X'", () => {
    expectPlan(
      classifyWithRegex("using gpt, flux-dev to create a sunset"),
      "compare_models",
      { models: 2, modelsInclude: ["gpt-image", "flux-dev"], promptContains: ["sunset"] }
    );
  });

  it("4 models with verbose prompt", () => {
    expectPlan(
      classifyWithRegex("using gpt, flux-dev, recraft, nanobana, to create the image of soft watercolor children's book illustration"),
      "compare_models",
      { models: 4, promptContains: ["watercolor", "children"] }
    );
  });

  it("models with 'compare' keyword", () => {
    expectPlan(
      classifyWithRegex("compare gpt and recraft for a portrait photo"),
      "compare_models",
      { models: 2 }
    );
  });

  it("models with 'vs' keyword", () => {
    expectPlan(
      classifyWithRegex("flux vs gemini for landscape photography"),
      "compare_models",
      { models: 2, modelsInclude: ["flux-dev", "gemini-image"] }
    );
  });

  it("models mixed into a long sentence", () => {
    expectPlan(
      classifyWithRegex("I want to see how gpt-image handles this portrait compared to what recraft produces"),
      "compare_models",
      { models: 2 }
    );
  });

  it("dall-e alias resolves to gpt-image", () => {
    expectPlan(
      classifyWithRegex("try dall-e and flux for a logo"),
      "compare_models",
      { modelsInclude: ["gpt-image", "flux-dev"] }
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// 2. COMPARE MODELS — "N models" with auto-fill
// ═══════════════════════════════════════════════════════════════
describe("compare_models: N models with auto-fill", () => {
  it("'4 different models, include gpt-image'", () => {
    expectPlan(
      classifyWithRegex("using 4 different models, include gpt-image to Generate an image of a manuscript"),
      "compare_models",
      { models: 4, modelsInclude: ["gpt-image"] }
    );
  });

  it("'3 models' with no named models", () => {
    expectPlan(
      classifyWithRegex("use 3 models to generate a portrait"),
      "compare_models",
      { models: 3 }
    );
  });

  it("'multiple models'", () => {
    expectPlan(
      classifyWithRegex("try multiple models for this landscape"),
      "compare_models",
      { models: 4 } // defaults to 4
    );
  });

  it("'several AI models'", () => {
    expectPlan(
      classifyWithRegex("use several AI models to create a cat"),
      "compare_models",
      { models: 4 }
    );
  });

  it("'5 different models, include recraft and nano'", () => {
    expectPlan(
      classifyWithRegex("compare with 5 different models including recraft and nano to make a logo"),
      "compare_models",
      { models: 5, modelsInclude: ["recraft-v4", "nano-banana"] }
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// 3. BATCH GENERATE — multiple distinct subjects
// ═══════════════════════════════════════════════════════════════
describe("batch_generate: multiple distinct subjects", () => {
  it("'a cat, a dog, a bird, and a fish'", () => {
    expectPlan(
      classifyWithRegex("make a ginger cat, a black dog, a blue bird, and a goldfish"),
      "batch_generate",
      { count: 4 }
    );
  });

  it("should NOT detect batch in compound descriptions", () => {
    // "a cat with a hat and a bow" is ONE subject, not three
    const plan = classifyWithRegex("draw a cat with a hat and a bow tie");
    expect(plan.type).not.toBe("batch_generate");
  });
});

// ═══════════════════════════════════════════════════════════════
// 4. VARIATIONS — alternatives to pick from
// ═══════════════════════════════════════════════════════════════
describe("variations: multiple alternatives", () => {
  it("'show me variations'", () => {
    expectPlan(
      classifyWithRegex("show me variations of a sunset painting"),
      "variations",
      { count: 4 }
    );
  });

  it("'4 different options'", () => {
    expectPlan(
      classifyWithRegex("give me 4 different options for a company logo"),
      "variations"
    );
  });

  it("'alternatives'", () => {
    expectPlan(
      classifyWithRegex("I need some alternatives for this portrait"),
      "variations"
    );
  });

  it("should NOT detect variations when story keywords present", () => {
    // "different versions of scene 3" is an adjust, not variations
    const plan = classifyWithRegex("show me different versions of this story scene");
    expect(plan.type).not.toBe("variations");
  });
});

// ═══════════════════════════════════════════════════════════════
// 5. STYLE SWEEP — same subject, multiple styles
// ═══════════════════════════════════════════════════════════════
describe("style_sweep: same subject, different styles", () => {
  it("'in watercolor, oil, and pencil style'", () => {
    expectPlan(
      classifyWithRegex("draw a sunset in watercolor, oil, and pencil style"),
      "style_sweep"
    );
  });

  // This is a known hard case — the regex might miss it
  it("'try anime style, realistic style, and pixel art style'", () => {
    const plan = classifyWithRegex("create a warrior in anime style, realistic style, and pixel art style");
    // If this fails, it's a gap to close
    if (plan.type !== "style_sweep") {
      console.warn("[GAP] style sweep not detected for comma-separated 'X style' pattern");
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// 6. STORY — multi-scene narratives
// ═══════════════════════════════════════════════════════════════
describe("story: multi-scene narratives", () => {
  it("scene markers", () => {
    expectPlan(
      classifyWithRegex("Scene 1 — the beginning\nScene 2 — the middle\nScene 3 — the end\nScene 4 — epilogue"),
      "story"
    );
  });

  it("long storyboard brief", () => {
    const longBrief = "Create a storyboard for a coffee brand campaign. " + "A barista makes the perfect cup. ".repeat(30);
    expectPlan(
      classifyWithRegex(longBrief),
      "story"
    );
  });
});

// ═══════════════════════════════════════════════════════════════
// 7. SINGLE — simple prompts (must NOT be misclassified)
// ═══════════════════════════════════════════════════════════════
describe("single: simple prompts (no false positives)", () => {
  const singlePrompts = [
    "a cat sitting on a roof",
    "sunset over the ocean",
    "generate a portrait of a woman with red hair",
    "make me a logo for my coffee shop",
    "draw a fantasy landscape with dragons",
    "create an image of a cozy library",
    "beautiful mountain scenery at dawn",
    "a child reading a book under a tree",
    // Edge: mentions a model name in the description (not as a tool to use)
    "a painting of a person looking at a gemini constellation",
    // Edge: mentions "model" but not as AI model
    "a fashion model walking on a runway",
  ];

  for (const prompt of singlePrompts) {
    it(`"${prompt.slice(0, 50)}..." → single`, () => {
      expectPlan(classifyWithRegex(prompt), "single");
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// 8. EDGE CASES — tricky inputs
// ═══════════════════════════════════════════════════════════════
describe("edge cases", () => {
  it("empty string → single", () => {
    const plan = classifyWithRegex("");
    expect(plan.type).toBe("single");
    expect(plan.prompt).toBeDefined();
  });

  it("just a model name → single (not comparison, only 1 model)", () => {
    const plan = classifyWithRegex("use flux to make a cat");
    expect(plan.type).toBe("single");
  });

  it("model name as subject, not tool", () => {
    // "nano banana" could be a fruit description, not the model
    const plan = classifyWithRegex("draw a nano banana on a table");
    // This might false-positive — if it does, that's a gap
    if (plan.type !== "single") {
      console.warn("[GAP] 'nano banana' in description falsely triggers model detection");
    }
  });

  it("'gemini' as zodiac sign, not AI model", () => {
    const plan = classifyWithRegex("draw a gemini zodiac constellation");
    // This might false-positive with 1 model — but shouldn't be comparison
    expect(plan.type).not.toBe("compare_models");
  });

  it("numbers that look like model count but aren't", () => {
    // "3 cats" should NOT trigger "3 models"
    const plan = classifyWithRegex("draw 3 cats playing in a garden");
    expect(plan.type).not.toBe("compare_models");
  });

  it("'different' without 'models'", () => {
    // "4 different cats" should NOT trigger model comparison
    const plan = classifyWithRegex("generate 4 different cats");
    expect(plan.type).not.toBe("compare_models");
  });

  it("the user's actual failing prompt", () => {
    const plan = classifyWithRegex(
      `using 4 different models, include gpt-image to Generate an image of the authentic manuscript of some classic text title

Generate an image of the authentic manuscript of some classic text, and incorporate the emotional core of the work into the calligraphy`
    );
    expectPlan(plan, "compare_models", {
      models: 4,
      modelsInclude: ["gpt-image"],
      promptContains: ["manuscript"],
    });
  });
});

// ═══════════════════════════════════════════════════════════════
// 9. PROMPT CLEANING — model names stripped properly
// ═══════════════════════════════════════════════════════════════
describe("cleanPrompt", () => {
  it("strips 'using X, Y to create' prefix", () => {
    const clean = cleanPrompt("using gpt, flux-dev to create a beautiful sunset");
    expect(clean).toContain("sunset");
    expect(clean).not.toMatch(/\bgpt\b/i);
    expect(clean).not.toMatch(/flux/i);
  });

  it("strips 'so i can compare'", () => {
    const clean = cleanPrompt("make a cat so i can compare");
    expect(clean).not.toMatch(/compare/i);
    expect(clean).toContain("cat");
  });

  it("preserves the creative description", () => {
    const clean = cleanPrompt(
      "using gpt, flux-dev, recraft, nanobana, to create the image of the following, so i can compare. " +
      "Soft poetic children's book illustration with watercolor and gouache textures."
    );
    expect(clean).toContain("watercolor");
    expect(clean).toContain("gouache");
    expect(clean.length).toBeGreaterThan(20);
  });

  it("doesn't destroy short prompts", () => {
    expect(cleanPrompt("a cat")).toBe("a cat");
  });

  it("handles prompt with only model names", () => {
    const clean = cleanPrompt("gpt flux recraft");
    // Should return something non-empty (falls back to original)
    expect(clean.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════
// 10. MODEL EXTRACTION — alias resolution
// ═══════════════════════════════════════════════════════════════
describe("extractMentionedModels", () => {
  it("resolves all known aliases", () => {
    expect(extractMentionedModels("gpt")).toContain("gpt-image");
    expect(extractMentionedModels("dall-e")).toContain("gpt-image");
    expect(extractMentionedModels("flux")).toContain("flux-dev");
    expect(extractMentionedModels("recraft")).toContain("recraft-v4");
    expect(extractMentionedModels("nanobana")).toContain("nano-banana");
    expect(extractMentionedModels("nano-banana")).toContain("nano-banana");
    expect(extractMentionedModels("gemini")).toContain("gemini-image");
    expect(extractMentionedModels("seedream")).toContain("seedream-5-lite");
    expect(extractMentionedModels("kontext")).toContain("kontext-edit");
  });

  it("deduplicates aliases for same model", () => {
    const models = extractMentionedModels("gpt and gpt-image and dall-e");
    expect(models).toEqual(["gpt-image"]);
  });

  it("returns empty for no models", () => {
    expect(extractMentionedModels("a beautiful sunset over mountains")).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════
// 11. NEW EDGE CASES — deeper intent understanding
// ═══════════════════════════════════════════════════════════════
describe("deeper intent edge cases", () => {
  it("single model override: 'use gpt-image for this sunset'", () => {
    const plan = classifyWithRegex("use gpt-image for a beautiful sunset");
    expect(plan.type).toBe("single");
    expect(plan.models).toContain("gpt-image");
    expect(plan.reason).toContain("gpt-image");
  });

  it("single model override: 'make it with recraft'", () => {
    const plan = classifyWithRegex("make this portrait with recraft");
    expect(plan.type).toBe("single");
    expect(plan.models).toContain("recraft-v4");
  });

  it("style sweep: 'anime style, realistic style, pixel art style'", () => {
    const plan = classifyWithRegex("create a warrior in anime style, realistic style, and pixel art style");
    expect(plan.type).toBe("style_sweep");
    expect(plan.styles!.length).toBeGreaterThanOrEqual(2);
  });

  it("style sweep: 'different styles' without naming them", () => {
    const plan = classifyWithRegex("show me this landscape in different styles");
    expect(plan.type).toBe("style_sweep");
    expect(plan.styles!.length).toBeGreaterThanOrEqual(2);
  });

  it("style sweep: 'various styles'", () => {
    const plan = classifyWithRegex("try various styles for this portrait");
    expect(plan.type).toBe("style_sweep");
  });

  it("single model mention without 'use' verb → still single (not override)", () => {
    // "a flux of emotions" → single, not model override
    const plan = classifyWithRegex("a flux of emotions in her eyes");
    // This might detect "flux" → model. Acceptable since 1 model → single type.
    expect(plan.type).toBe("single");
  });
});

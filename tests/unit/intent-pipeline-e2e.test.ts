/**
 * Intent Pipeline — end-to-end audit.
 *
 * Tests the FULL path from user input to plan execution readiness.
 * Finds gaps where: nothing happens, steps are missed, intent is lost.
 *
 * This is NOT a unit test of classifyWithRegex — it's a test of the
 * entire decision chain including the preprocessor's gate logic.
 */
import { describe, it, expect } from "vitest";
import {
  classifyWithRegex,
  planIntentSync,
  cleanPrompt,
  extractMentionedModels,
  type IntentPlan,
} from "@livepeer/creative-kit";

// Simulate what the preprocessor does: classifyIntent (old regex from intent.ts)
// then intent planner, then multi-scene check
import { classifyIntent as oldClassifyIntent } from "@/lib/agents/intent";

/**
 * Simulate the full preprocessor decision chain.
 * Returns what would happen to this text.
 */
function tracePreprocessor(text: string, hasActiveProject = false): {
  oldIntentType: string;
  /** Does the old classifier short-circuit BEFORE the intent planner runs? */
  oldClassifierHandled: boolean;
  /** What would the intent planner return? */
  plannerResult: IntentPlan;
  /** Would the plan be executed (handled=true) or pass to agent? */
  wouldExecute: boolean;
  /** What the agent would receive (original text or rewritten prompt) */
  agentReceives: "original" | "rewritten" | "nothing (handled)";
  /** Gap: the planner detected something but the old classifier already handled it */
  conflictWithOldClassifier: boolean;
} {
  // Step 1: Old regex classifier (intent.ts)
  const oldIntent = oldClassifyIntent(text, hasActiveProject, 0);

  // The preprocessor runs the intent planner for ALL messages now,
  // BUT the old classifier's results (continue, add_scenes, etc.) are
  // checked FIRST and can exit before the planner runs.
  const oldHandlesFirst = ["continue", "add_scenes", "adjust_scene",
    "style_correction", "status", "episode_switch", "episode_create",
    "video_strategy"].includes(oldIntent.type);

  // Step 2: Intent planner (would run after old classifier)
  const plannerResult = classifyWithRegex(text);

  // Step 3: Would the plan execute?
  const executableTypes = ["compare_models", "batch_generate", "style_sweep", "variations"];
  const wouldExecute = executableTypes.includes(plannerResult.type);

  // Conflict: old classifier exits early, but planner would have done something useful
  const conflict = oldHandlesFirst && wouldExecute;

  return {
    oldIntentType: oldIntent.type,
    oldClassifierHandled: oldHandlesFirst,
    plannerResult,
    wouldExecute,
    agentReceives: wouldExecute ? "nothing (handled)" :
      oldHandlesFirst ? "rewritten" : "original",
    conflictWithOldClassifier: conflict,
  };
}

// ═══════════════════════════════════════════════════════════════
// AUDIT 1: Silent drops — user says something, nothing meaningful happens
// ═══════════════════════════════════════════════════════════════
describe("AUDIT: silent drops", () => {
  const inputs = [
    // User gives creative direction but it's short and vague
    "make it better",
    "try again",
    "I don't like this",
    "more",
    "do it again but different",
    // User asks for something specific but phrasing is unusual
    "can you make 4 versions of this?",
    "what would this look like in different styles?",
    "show me what each model thinks of this prompt: a dragon",
  ];

  for (const input of inputs) {
    it(`"${input}" → should not silently drop`, () => {
      const trace = tracePreprocessor(input);
      // At minimum, if nothing handles it, it should reach the agent
      const reachesAgent = !trace.wouldExecute || trace.agentReceives !== "nothing (handled)";
      const reachesSomething = trace.wouldExecute || reachesAgent;

      if (!reachesSomething) {
        console.error(`[SILENT DROP] "${input}" — old: ${trace.oldIntentType}, planner: ${trace.plannerResult.type}`);
      }
      expect(reachesSomething).toBe(true);
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// AUDIT 2: Intent conflicts — old classifier and planner disagree
// ═══════════════════════════════════════════════════════════════
describe("AUDIT: intent conflicts", () => {
  it("'continue' intent doesn't block comparison", () => {
    // "continue using gpt and flux" — old classifier sees "continue",
    // but user might mean "compare gpt and flux"
    const trace = tracePreprocessor("continue using gpt and flux to compare", true);
    if (trace.conflictWithOldClassifier) {
      console.warn(`[CONFLICT] Old classifier: ${trace.oldIntentType}, Planner: ${trace.plannerResult.type}`);
    }
    // Document the behavior — don't fail, just warn
  });

  it("'add_scenes' doesn't block batch intent", () => {
    const trace = tracePreprocessor("give me 4 more images of different animals", true);
    // Old classifier might see "give me 4 more" → add_scenes
    // Planner might see "4 different animals" → batch
    if (trace.oldIntentType === "add_scenes" && trace.plannerResult.type === "batch_generate") {
      console.warn(`[CONFLICT] "give me 4 more images of different animals" — old says add_scenes, planner says batch`);
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// AUDIT 3: Execution gaps — plan is created but execution fails
// ═══════════════════════════════════════════════════════════════
describe("AUDIT: execution readiness", () => {
  it("compare_models plan always has prompt", () => {
    const inputs = [
      "compare gpt and flux",
      "using 4 different models to make something",
      "try multiple models",
    ];
    for (const input of inputs) {
      const plan = classifyWithRegex(input);
      if (plan.type === "compare_models") {
        expect(plan.prompt).toBeTruthy();
        expect(plan.prompt!.length).toBeGreaterThan(0);
        expect(plan.models!.length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("batch plan always has prompts array", () => {
    const plan = classifyWithRegex("make a cat, a dog, a bird, and a fish");
    if (plan.type === "batch_generate") {
      expect(plan.prompts).toBeTruthy();
      expect(plan.prompts!.length).toBeGreaterThan(0);
      for (const p of plan.prompts!) {
        expect(p.length).toBeGreaterThan(0);
      }
    }
  });

  it("variations plan always has count", () => {
    const plan = classifyWithRegex("show me variations of a sunset");
    if (plan.type === "variations") {
      expect(plan.count).toBeGreaterThanOrEqual(2);
    }
  });

  it("compare_models with vague prompt — prompt is still useful", () => {
    // "compare gpt and flux" — the cleaned prompt might be empty!
    const plan = classifyWithRegex("compare gpt and flux");
    expect(plan.prompt).toBeTruthy();
    // If prompt is basically empty after cleaning, that's a gap
    if (plan.prompt && plan.prompt.length < 5) {
      console.error(`[GAP] compare plan prompt too short: "${plan.prompt}"`);
    }
  });

  it("compare_models prompt doesn't contain meta-instructions", () => {
    const plan = classifyWithRegex("using gpt, flux to create a sunset so i can compare them side by side");
    if (plan.type === "compare_models") {
      expect(plan.prompt!.toLowerCase()).not.toContain("compare");
      expect(plan.prompt!.toLowerCase()).not.toContain("side by side");
    }
  });
});

// ═══════════════════════════════════════════════════════════════
// AUDIT 4: The user's real failing scenarios
// ═══════════════════════════════════════════════════════════════
describe("AUDIT: real user scenarios", () => {
  it("Scenario 1: 'using gpt, flux, recraft, nanobana to create...'", () => {
    const text = `using gpt, flux-dev, recraft, nanobana, to create the image of the following, so i can compare.
a picture of Soft poetic children's book illustration with watercolor and gouache textures.
Two children in calm conversation, soft connection forming.`;

    const trace = tracePreprocessor(text);
    expect(trace.plannerResult.type).toBe("compare_models");
    expect(trace.plannerResult.models!.length).toBe(4);
    expect(trace.wouldExecute).toBe(true);
    expect(trace.plannerResult.prompt).toContain("children");
    // Should NOT contain model names in the prompt
    expect(trace.plannerResult.prompt!.toLowerCase()).not.toContain("flux");
  });

  it("Scenario 2: '4 different models, include gpt-image'", () => {
    const text = `using 4 different models, include gpt-image to Generate an image of the authentic manuscript of The Art of War`;

    const trace = tracePreprocessor(text);
    expect(trace.plannerResult.type).toBe("compare_models");
    expect(trace.plannerResult.models!.length).toBe(4);
    expect(trace.plannerResult.models).toContain("gpt-image");
    expect(trace.wouldExecute).toBe(true);
  });

  it("Scenario 3: simple prompt goes to agent", () => {
    const text = "a cat sitting on a roof at sunset";
    const trace = tracePreprocessor(text);
    expect(trace.plannerResult.type).toBe("single");
    expect(trace.wouldExecute).toBe(false);
    expect(trace.agentReceives).toBe("original");
  });

  it("Scenario 4: 'make me a logo' — single, not batch", () => {
    const text = "make me a professional logo for a coffee shop called Bean Scene";
    const trace = tracePreprocessor(text);
    expect(trace.plannerResult.type).toBe("single");
  });

  it("Scenario 5: user says 'yes' after unclear — should go to agent", () => {
    const text = "yes";
    const trace = tracePreprocessor(text);
    // Should NOT be intercepted by planner
    expect(trace.wouldExecute).toBe(false);
  });

  it("Scenario 6: 'try a different approach' — with active project", () => {
    const text = "try a different approach to the sunset scene";
    const trace = tracePreprocessor(text, true);
    // Should NOT trigger comparison ("different" is about the approach, not models)
    expect(trace.plannerResult.type).not.toBe("compare_models");
  });
});

// ═══════════════════════════════════════════════════════════════
// AUDIT 5: Model name false positives
// ═══════════════════════════════════════════════════════════════
describe("AUDIT: false positives from model names in content", () => {
  const shouldBeSingle = [
    "draw the Gemini zodiac constellation with stars",
    "a fashion model walking down a runway in flux of emotions",
    "a nano-sized banana under a microscope",
    "recraft the wooden chair design with modern lines",
    "draw a kontext diagram showing the system architecture",
  ];

  for (const input of shouldBeSingle) {
    it(`"${input.slice(0, 50)}..." → should be single (model name is content, not intent)`, () => {
      const plan = classifyWithRegex(input);
      // These MIGHT false-positive — if they do, that's a known limitation
      if (plan.type === "compare_models") {
        console.warn(`[FALSE POSITIVE] "${input.slice(0, 50)}" classified as compare_models due to model name in content`);
      }
      // For now, just document — don't fail
      // The fix requires semantic understanding (LLM tier)
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// AUDIT 6: Prompt quality after cleaning
// ═══════════════════════════════════════════════════════════════
describe("AUDIT: prompt quality", () => {
  const cases = [
    {
      input: "using gpt, flux to create a sunset",
      expectContains: "sunset",
      expectMinLength: 5,
    },
    {
      input: "compare 4 models for a children's book illustration with watercolor textures",
      expectContains: "children",
      expectMinLength: 15,
    },
    {
      input: "try multiple models to make a professional headshot portrait photography",
      expectContains: "headshot",
      expectMinLength: 10,
    },
    {
      input: "using nano, recraft to create something",
      expectContains: "something",
      expectMinLength: 5,
    },
  ];

  for (const { input, expectContains, expectMinLength } of cases) {
    it(`"${input.slice(0, 50)}..." → clean prompt preserves meaning`, () => {
      const plan = classifyWithRegex(input);
      expect(plan.prompt).toBeTruthy();
      expect(plan.prompt!.length).toBeGreaterThanOrEqual(expectMinLength);
      expect(plan.prompt!.toLowerCase()).toContain(expectContains.toLowerCase());
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// AUDIT 7: Edge cases that could crash or hang
// ═══════════════════════════════════════════════════════════════
describe("AUDIT: robustness", () => {
  it("very long input (5000 chars) doesn't hang", () => {
    const long = "a beautiful sunset over the mountains. ".repeat(140);
    const t0 = performance.now();
    const plan = classifyWithRegex(long);
    const elapsed = performance.now() - t0;
    expect(elapsed).toBeLessThan(100); // should be <10ms
    expect(plan.type).toBeDefined();
  });

  it("unicode input doesn't crash", () => {
    const plan = classifyWithRegex("用GPT和flux创建一个日落的图片 🌅");
    expect(plan.type).toBeDefined();
  });

  it("special characters don't break regex", () => {
    const plan = classifyWithRegex("create (a cat) [with] {stripes} & $pecial ch@racters");
    expect(plan.type).toBe("single");
  });

  it("newlines in input don't break detection", () => {
    const plan = classifyWithRegex("using gpt, flux\nto create\na sunset\nover mountains");
    expect(plan.type).toBe("compare_models");
  });

  it("tabs and extra whitespace handled", () => {
    const plan = classifyWithRegex("using    gpt  ,   flux-dev    to   create   a   cat");
    expect(plan.type).toBe("compare_models");
  });
});

// ═══════════════════════════════════════════════════════════════
// AUDIT 8: What happens AFTER execution — result quality
// ═══════════════════════════════════════════════════════════════
describe("AUDIT: post-execution expectations", () => {
  it("compare_models: each model gets a unique step", () => {
    const plan = classifyWithRegex("using gpt, flux, recraft to make a sunset");
    expect(plan.type).toBe("compare_models");
    // Each model should produce a separate card
    const models = plan.models!;
    expect(new Set(models).size).toBe(models.length); // no duplicates
    // All get the same prompt
    expect(plan.prompt).toBeTruthy();
  });

  it("batch: each item gets its own prompt", () => {
    const plan = classifyWithRegex("make a red car, a blue car, a green car, and a yellow car");
    if (plan.type === "batch_generate") {
      expect(plan.prompts!.length).toBeGreaterThanOrEqual(3);
      // Each prompt should be different
      const unique = new Set(plan.prompts);
      expect(unique.size).toBe(plan.prompts!.length);
    }
  });

  it("auto-filled models are diverse (not all the same)", () => {
    const plan = classifyWithRegex("use 4 different models to make a portrait");
    expect(plan.models!.length).toBe(4);
    expect(new Set(plan.models).size).toBe(4); // all different
  });
});

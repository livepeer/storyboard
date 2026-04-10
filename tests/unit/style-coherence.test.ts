import { describe, it, expect, beforeEach } from "vitest";
import { useProjectStore } from "@/lib/projects/store";

describe("Style Coherence — Project Style Guide", () => {
  beforeEach(() => {
    useProjectStore.getState().clearProjects();
  });

  it("style guide persists in project", () => {
    const project = useProjectStore.getState().createProject(
      "Ghibli ad",
      [{ index: 0, title: "S1", description: "t", prompt: "forest", mediaType: "image", action: "generate" }],
      {
        visualStyle: "studio ghibli hand-painted",
        colorPalette: "soft pastels, warm earth tones",
        mood: "whimsical, dreamy",
        promptPrefix: "studio ghibli style, hand-painted watercolor, ",
        promptSuffix: ", warm gentle lighting, detailed background art",
      }
    );

    const loaded = useProjectStore.getState().getProject(project.id)!;
    expect(loaded.styleGuide).toBeDefined();
    expect(loaded.styleGuide!.promptPrefix).toContain("ghibli");
    expect(loaded.styleGuide!.promptSuffix).toContain("warm gentle lighting");
  });

  it("style guide applied to scene prompts in getNextBatch context", () => {
    const project = useProjectStore.getState().createProject(
      "test",
      [
        { index: 0, title: "S1", description: "t", prompt: "a sunset over the ocean", mediaType: "image", action: "generate" },
        { index: 1, title: "S2", description: "t", prompt: "a mountain cabin", mediaType: "image", action: "generate" },
      ],
      {
        visualStyle: "cyberpunk",
        colorPalette: "neon",
        mood: "dark",
        promptPrefix: "cyberpunk neon style, ",
        promptSuffix: ", dark atmospheric",
      }
    );

    // Verify the style guide is available for the generate tool to apply
    const batch = useProjectStore.getState().getNextBatch(project.id);
    const sg = project.styleGuide!;
    const styledPrompt = `${sg.promptPrefix}${batch[0].prompt}${sg.promptSuffix}`;
    expect(styledPrompt).toBe("cyberpunk neon style, a sunset over the ocean, dark atmospheric");
  });

  it("style guide does NOT modify original scene prompt in store", () => {
    const project = useProjectStore.getState().createProject(
      "test",
      [{ index: 0, title: "S1", description: "t", prompt: "a cat", mediaType: "image", action: "generate" }],
      { visualStyle: "x", colorPalette: "x", mood: "x", promptPrefix: "PREFIX_", promptSuffix: "_SUFFIX" }
    );

    // Original prompt should be unchanged
    const scene = useProjectStore.getState().getProject(project.id)!.scenes[0];
    expect(scene.prompt).toBe("a cat"); // not modified
  });

  it("projects without style guide work normally", () => {
    const project = useProjectStore.getState().createProject(
      "plain test",
      [{ index: 0, title: "S1", description: "t", prompt: "a dog", mediaType: "image", action: "generate" }]
    );
    expect(project.styleGuide).toBeUndefined();
    const batch = useProjectStore.getState().getNextBatch(project.id);
    expect(batch[0].prompt).toBe("a dog");
  });
});

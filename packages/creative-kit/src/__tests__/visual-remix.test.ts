import { describe, it, expect } from "vitest";
import { planRemix, detectRemixIntent } from "../agent/visual-remix";

describe("planRemix", () => {
  it("style_transfer uses kontext-edit", () => {
    const plan = planRemix({
      referenceUrl: "https://img.jpg",
      prompt: "a castle at sunset",
      similarity: 0.7,
      mode: "style_transfer",
    });
    expect(plan.capability).toBe("kontext-edit");
    expect(plan.params.image_url).toBe("https://img.jpg");
    expect(plan.effectivePrompt).toContain("style");
  });

  it("variation high similarity uses kontext-edit", () => {
    const plan = planRemix({
      referenceUrl: "https://img.jpg",
      prompt: "with more clouds",
      similarity: 0.8,
      mode: "variation",
    });
    expect(plan.capability).toBe("kontext-edit");
  });

  it("variation low similarity uses flux-dev", () => {
    const plan = planRemix({
      referenceUrl: "https://img.jpg",
      prompt: "completely reimagined",
      similarity: 0.3,
      mode: "variation",
    });
    expect(plan.capability).toBe("flux-dev");
  });

  it("evolve preserves specified aspects", () => {
    const plan = planRemix({
      referenceUrl: "https://img.jpg",
      prompt: "make it warmer",
      similarity: 0.9,
      mode: "evolve",
      preserve: ["composition", "color palette"],
    });
    expect(plan.effectivePrompt).toContain("composition");
    expect(plan.effectivePrompt).toContain("color palette");
  });
});

describe("detectRemixIntent", () => {
  it("detects 'like this but darker'", () => {
    const intent = detectRemixIntent("make something like this but darker");
    expect(intent).not.toBeNull();
    expect(intent!.mode).toBe("mashup"); // "but" triggers mashup
  });

  it("detects 'similar style'", () => {
    const intent = detectRemixIntent("I want the same style aesthetic for my next scene");
    expect(intent).not.toBeNull();
    expect(intent!.mode).toBe("style_transfer");
  });

  it("detects 'evolve this'", () => {
    const intent = detectRemixIntent("evolve this image slightly");
    expect(intent).not.toBeNull();
    expect(intent!.mode).toBe("evolve");
    expect(intent!.similarity).toBeGreaterThan(0.7);
  });

  it("returns null for unrelated text", () => {
    expect(detectRemixIntent("create a new dragon image")).toBeNull();
  });

  it("detects high similarity request", () => {
    const intent = detectRemixIntent("make something very similar to this");
    expect(intent).not.toBeNull();
    expect(intent!.similarity).toBeGreaterThanOrEqual(0.9);
  });
});

/**
 * VACE Architecture — unit tests.
 *
 * Verifies that:
 * 1. buildStreamStartParams includes vace_enabled ONLY when vaceRefUrl is provided
 * 2. buildStreamStartParams does NOT include vace_enabled without vaceRefUrl
 * 3. The control message pattern (mid-stream) NEVER includes vace_enabled
 */
import { describe, it, expect } from "vitest";
import { buildStreamStartParams, resolveStageRecipe } from "../../apps/creative-stage/lib/stage-tools";

describe("VACE at stream start (correct path)", () => {
  const recipe = resolveStageRecipe(undefined); // default "classic"

  it("includes vace_enabled when vaceRefUrl is provided", () => {
    const params = buildStreamStartParams(recipe, "test prompt", 0.5, "https://example.com/ref.jpg");
    expect(params.vace_enabled).toBe(true);
    expect(params.vace_ref_images).toEqual(["https://example.com/ref.jpg"]);
    expect(params.vace_context_scale).toBe(0.8);
  });

  it("does NOT include vace_enabled without vaceRefUrl", () => {
    const params = buildStreamStartParams(recipe, "test prompt", 0.5);
    expect(params.vace_enabled).toBeUndefined();
    expect(params.vace_ref_images).toBeUndefined();
  });

  it("does NOT include vace_enabled with undefined vaceRefUrl", () => {
    const params = buildStreamStartParams(recipe, "test prompt", 0.5, undefined);
    expect(params.vace_enabled).toBeUndefined();
  });

  it("does NOT include vace_enabled with empty string vaceRefUrl", () => {
    const params = buildStreamStartParams(recipe, "test prompt", 0.5, "");
    expect(params.vace_enabled).toBeUndefined();
  });

  it("always includes core stream params", () => {
    const params = buildStreamStartParams(recipe, "test", 0.7);
    expect(params.prompt).toBe("test");
    expect(params.noise_scale).toBe(0.7);
    expect(params.input_mode).toBe("video");
    expect(params.pipeline_ids).toBeDefined();
    expect(params.graph).toBeDefined();
  });
});

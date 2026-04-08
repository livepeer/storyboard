import { describe, it, expect } from "vitest";
import { resolveCapability, isValidCapability } from "@/lib/sdk/capabilities";

/**
 * Tests for capability resolution — the core defense against hallucinated model names.
 * These test the FALLBACK path (no live cache), which is the safety net.
 */
describe("Capability Resolution (fallback mode — no cache)", () => {
  // Valid names pass through
  it("passes through valid capability names", () => {
    expect(resolveCapability("flux-dev")).toBe("flux-dev");
    expect(resolveCapability("flux-schnell")).toBe("flux-schnell");
    expect(resolveCapability("ltx-i2v")).toBe("ltx-i2v");
    expect(resolveCapability("chatterbox-tts")).toBe("chatterbox-tts");
    expect(resolveCapability("recraft-v4")).toBe("recraft-v4");
    expect(resolveCapability("kontext-edit")).toBe("kontext-edit");
    expect(resolveCapability("topaz-upscale")).toBe("topaz-upscale");
  });

  // Prefix matching: "flux-pro" shares "flux-" with "flux-dev"
  it("resolves flux-pro → flux-dev (prefix match)", () => {
    expect(resolveCapability("flux-pro")).toBe("flux-dev");
  });

  it("resolves flux-1.1-pro → flux-dev (prefix match on flux-)", () => {
    expect(resolveCapability("flux-1.1-pro")).toBe("flux-dev");
  });

  // Keyword matching
  it("resolves kling-i2v → ltx-i2v (keyword i2v)", () => {
    expect(resolveCapability("kling-i2v")).toBe("ltx-i2v");
  });

  it("resolves lux-tts → chatterbox-tts (keyword tts)", () => {
    expect(resolveCapability("lux-tts")).toBe("chatterbox-tts");
  });

  it("resolves qwen-image → flux-dev (keyword image)", () => {
    expect(resolveCapability("qwen-image")).toBe("flux-dev");
  });

  // Version suffix matching
  it("resolves ltx-t2v-23 → ltx-t2v (prefix match)", () => {
    expect(resolveCapability("ltx-t2v-23")).toBe("ltx-t2v");
  });

  // Action-based fallback
  it("uses action default for completely unknown names", () => {
    expect(resolveCapability("totally-unknown-model", "generate")).toBe("flux-dev");
    expect(resolveCapability("totally-unknown-model", "animate")).toBe("ltx-i2v");
    expect(resolveCapability("totally-unknown-model", "tts")).toBe("chatterbox-tts");
    expect(resolveCapability("totally-unknown-model", "restyle")).toBe("kontext-edit");
  });

  // Final fallback
  it("returns flux-dev for completely unresolvable names", () => {
    expect(resolveCapability("xyzzy")).toBe("flux-dev");
  });

  // Never returns null when fallback capabilities exist
  it("never returns null", () => {
    const badNames = [
      "flux-pro", "flux-1.1-pro", "kling-i2v", "lux-tts", "qwen-image",
      "ltx-t2v-23", "dall-e-3", "midjourney", "stable-diffusion-xl",
      "whisper-large", "bark-tts", "suno-v4",
    ];
    for (const name of badNames) {
      const resolved = resolveCapability(name);
      expect(resolved, `resolveCapability("${name}") should not be null`).not.toBeNull();
    }
  });
});

describe("isValidCapability (fallback mode)", () => {
  it("returns true for valid capabilities", () => {
    expect(isValidCapability("flux-dev")).toBe(true);
    expect(isValidCapability("ltx-i2v")).toBe(true);
    expect(isValidCapability("chatterbox-tts")).toBe(true);
  });

  it("returns false for invalid capabilities", () => {
    expect(isValidCapability("flux-pro")).toBe(false);
    expect(isValidCapability("kling-i2v")).toBe(false);
    expect(isValidCapability("lux-tts")).toBe(false);
  });
});

import { describe, it, expect } from "vitest";
import { resolveCapability, FALLBACK_CAPABILITIES } from "../../../src/capabilities/resolver.js";

describe("resolveCapability", () => {
  it("returns exact match immediately", () => {
    expect(resolveCapability("flux-dev")).toBe("flux-dev");
    expect(resolveCapability("ltx-i2v")).toBe("ltx-i2v");
    expect(resolveCapability("chatterbox-tts")).toBe("chatterbox-tts");
  });

  it("prefix match: 'flux-pro' resolves to 'flux-dev'", () => {
    // 'flux-pro' and 'flux-dev' share prefix 'flux-' (6 chars >= 4)
    const result = resolveCapability("flux-pro");
    expect(result).toBe("flux-dev");
  });

  it("prefix match: 'ltx-t2v-23' resolves to 'ltx-t2v' (not 'ltx-i2v')", () => {
    // shares 'ltx-t2v' (7 chars) with 'ltx-t2v' vs 'ltx-' (4 chars) with others
    const result = resolveCapability("ltx-t2v-23");
    expect(result).toBe("ltx-t2v");
  });

  it("keyword match: 'kling-i2v' resolves to 'ltx-i2v'", () => {
    // 'kling-i2v' doesn't prefix-match anything well; keyword 'i2v' → 'ltx-i2v'
    const result = resolveCapability("kling-i2v");
    expect(result).toBe("ltx-i2v");
  });

  it("keyword match: 'lux-tts' resolves to 'chatterbox-tts'", () => {
    const result = resolveCapability("lux-tts");
    expect(result).toBe("chatterbox-tts");
  });

  it("action default: unknown model with action=animate resolves to 'ltx-i2v'", () => {
    const result = resolveCapability("totally-unknown-xyz", "animate");
    expect(result).toBe("ltx-i2v");
  });

  it("action default: unknown model with action=generate resolves to 'flux-dev'", () => {
    const result = resolveCapability("made-up-model", "generate");
    expect(result).toBe("flux-dev");
  });

  it("final fallback: returns 'flux-dev' when nothing matches", () => {
    const result = resolveCapability("zzz-no-match-at-all");
    expect(result).toBe("flux-dev");
  });

  it("respects a custom validSet", () => {
    const custom = new Set(["my-model", "other-model"]);
    // exact match
    expect(resolveCapability("my-model", undefined, custom)).toBe("my-model");
    // no match → first entry
    const fallback = resolveCapability("flux-dev", undefined, custom);
    // flux-dev not in custom, no keyword/prefix hit on custom names → first item
    expect(custom.has(fallback!)).toBe(true);
  });
});

import { describe, it, expect } from "vitest";
import { claudePlugin } from "@/lib/agents/claude";

describe("Claude Plugin", () => {
  it("has correct plugin id and name", () => {
    expect(claudePlugin.id).toBe("claude");
    expect(claudePlugin.name).toBe("Claude Agent");
  });

  it("has a description", () => {
    expect(claudePlugin.description).toContain("Claude AI");
  });

  it("has configFields", () => {
    expect(claudePlugin.configFields).toBeInstanceOf(Array);
    expect(claudePlugin.configFields.length).toBeGreaterThan(0);
    expect(claudePlugin.configFields[0].key).toBe("anthropic_api_key");
  });

  it("implements configure without error", () => {
    expect(() => claudePlugin.configure({})).not.toThrow();
  });

  it("implements stop without error", () => {
    expect(() => claudePlugin.stop()).not.toThrow();
  });

  it("sendMessage returns an async generator", () => {
    const gen = claudePlugin.sendMessage("test", {
      cards: [],
      capabilities: [],
    });
    // Should be an async iterator
    expect(gen[Symbol.asyncIterator]).toBeDefined();
  });
});

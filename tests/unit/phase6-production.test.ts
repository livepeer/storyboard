import { describe, it, expect } from "vitest";
import { openaiPlugin } from "@/lib/agents/openai";
import {
  estimateTokens,
  estimateConversationTokens,
  TOKEN_EFFICIENCY_SUITE,
} from "@/lib/agents/benchmark";
import { listTools } from "@/lib/tools/registry";
import { initializeTools, clearTools } from "@/lib/tools";

describe("OpenAI Plugin", () => {
  it("has correct id and name", () => {
    expect(openaiPlugin.id).toBe("openai");
    expect(openaiPlugin.name).toBe("OpenAI Agent");
  });

  it("has config fields for API key", () => {
    expect(openaiPlugin.configFields).toHaveLength(1);
    expect(openaiPlugin.configFields[0].key).toBe("openai_api_key");
    expect(openaiPlugin.configFields[0].type).toBe("password");
  });

  it("implements stop method", () => {
    expect(typeof openaiPlugin.stop).toBe("function");
    openaiPlugin.stop(); // Should not throw
  });

  it("implements configure method", () => {
    expect(typeof openaiPlugin.configure).toBe("function");
    openaiPlugin.configure({}); // Should not throw
  });

  it("sendMessage is an async generator", () => {
    const gen = openaiPlugin.sendMessage("test", {
      cards: [],
      capabilities: [],
    });
    expect(gen[Symbol.asyncIterator]).toBeDefined();
    // Clean up - stop the generator
    openaiPlugin.stop();
  });
});

describe("Token Estimation", () => {
  it("estimates ~1 token per 4 chars", () => {
    expect(estimateTokens("hello world")).toBe(3); // 11 chars / 4 = 2.75 → 3
    expect(estimateTokens("a".repeat(100))).toBe(25);
    expect(estimateTokens("")).toBe(0);
  });

  it("estimates conversation tokens from messages", () => {
    const msgs = [
      { role: "system", content: "You are a helper" },
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there!" },
    ];
    const tokens = estimateConversationTokens(msgs);
    // 16 + 5 + 9 chars = 30 chars = ~8 tokens + 12 overhead = ~20
    expect(tokens).toBeGreaterThan(10);
    expect(tokens).toBeLessThan(30);
  });

  it("estimates tokens for array content blocks", () => {
    const msgs = [
      {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "1", content: '{"image_url":"https://example.com/img.png"}' },
        ],
      },
    ];
    const tokens = estimateConversationTokens(msgs);
    expect(tokens).toBeGreaterThan(5);
  });
});

describe("Token Efficiency Suite", () => {
  it("has 10 test prompts", () => {
    expect(TOKEN_EFFICIENCY_SUITE).toHaveLength(10);
  });

  it("all prompts have optimized target ≤ 20% of naive", () => {
    for (const test of TOKEN_EFFICIENCY_SUITE) {
      const ratio = test.optimizedTarget / test.naiveTokens;
      expect(ratio).toBeLessThanOrEqual(0.2);
    }
  });

  it("covers all categories", () => {
    const categories = new Set(TOKEN_EFFICIENCY_SUITE.map((t) => t.category));
    expect(categories).toContain("single-step");
    expect(categories).toContain("multi-step");
    expect(categories).toContain("storyboard");
    expect(categories).toContain("canvas");
    expect(categories).toContain("memory");
    expect(categories).toContain("edit");
  });
});

describe("Tool Registry — Phase 6", () => {
  it("registers all 15 tools", () => {
    clearTools();
    initializeTools();
    const tools = listTools();
    expect(tools.length).toBe(15);

    const names = tools.map((t) => t.name);
    // Compound
    expect(names).toContain("create_media");
    // SDK
    expect(names).toContain("inference");
    expect(names).toContain("capabilities");
    // Canvas
    expect(names).toContain("canvas_create");
    expect(names).toContain("canvas_update");
    expect(names).toContain("canvas_get");
    expect(names).toContain("canvas_remove");
    // Skills
    expect(names).toContain("load_skill");
    // Memory
    expect(names).toContain("memory_style");
    expect(names).toContain("memory_rate");
    expect(names).toContain("memory_preference");
  });
});

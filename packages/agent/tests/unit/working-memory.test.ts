import { describe, it, expect, beforeEach } from "vitest";
import { WorkingMemoryStore } from "../../src/memory/working.js";
import type { ConversationTurn } from "../../src/types.js";

let store: WorkingMemoryStore;

beforeEach(() => {
  store = new WorkingMemoryStore();
});

function turn(content: string, role: "user" | "assistant" = "user"): ConversationTurn {
  return {
    id: `t_${Math.random()}`,
    ts: Date.now(),
    message: { role, content },
  };
}

describe("WorkingMemoryStore", () => {
  it("starts empty and marshal produces an empty prefix", () => {
    const m = store.marshal();
    expect(m.text).toBe("");
    expect(m.estimated_tokens).toBeLessThan(10);
    expect(m.truncated).toBe(false);
  });

  it("setContext + marshal produces a structured prefix", () => {
    store.setContext({
      style: "Studio Ghibli",
      palette: "warm gold",
      characters: "girl + cat",
      setting: "fishing village",
      rules: "no dialogue",
      mood: "magical",
    });
    const m = store.marshal();
    expect(m.text).toContain("CREATIVE CONTEXT:");
    expect(m.text).toContain("Studio Ghibli");
    expect(m.text).toContain("warm gold");
    expect(m.truncated).toBe(false);
  });

  it("patchContext only modifies given fields", () => {
    store.setContext({
      style: "ghibli",
      palette: "gold",
      characters: "girl",
      setting: "village",
      rules: "",
      mood: "",
    });
    store.patchContext({ mood: "warm" });
    const wm = store.snapshot();
    expect(wm.context.style).toBe("ghibli");
    expect(wm.context.mood).toBe("warm");
  });

  it("addTurn keeps only the most recent N turns", () => {
    for (let i = 0; i < 15; i++) {
      store.addTurn(turn(`message ${i}`));
    }
    const wm = store.snapshot();
    expect(wm.recent_turns.length).toBe(10);
    expect(wm.recent_turns[0].message.content).toBe("message 5");
    expect(wm.recent_turns[9].message.content).toBe("message 14");
  });

  it("pin adds a fact and unpin removes by id", () => {
    const f1 = store.pin("warm lighting always");
    const f2 = store.pin("never show product first");
    expect(store.snapshot().pinned).toHaveLength(2);
    store.unpin(f1.id);
    expect(store.snapshot().pinned.map((f) => f.id)).toEqual([f2.id]);
  });

  it("marshal enforces the 800-token budget by truncating recent_turns first [INV-3 adjacent]", () => {
    // Stuff a lot of long turns to force truncation
    for (let i = 0; i < 10; i++) {
      store.addTurn(turn("x".repeat(500)));
    }
    const m = store.marshal();
    expect(m.estimated_tokens).toBeLessThanOrEqual(800);
    expect(m.truncated).toBe(true);
  });
});

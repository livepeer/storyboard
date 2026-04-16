import { describe, it, expect, beforeEach } from "vitest";
import { SessionMemoryStore } from "../../src/memory/session.js";

let store: SessionMemoryStore;

beforeEach(() => {
  store = new SessionMemoryStore();
});

describe("SessionMemoryStore", () => {
  it("records artifacts with auto-assigned id and current branch", () => {
    const a = store.recordArtifact({ kind: "image", prompt: "a red cat" });
    expect(a.id).toMatch(/^art_/);
    expect(a.branch).toBe("main");
    expect(a.kind).toBe("image");
  });

  it("recall does case-insensitive keyword match against artifacts", () => {
    store.recordArtifact({ kind: "image", prompt: "A cat on a Rooftop" });
    store.recordArtifact({ kind: "image", prompt: "a dog on a beach" });
    const hits = store.recall("rooftop");
    expect(hits).toHaveLength(1);
    expect((hits[0] as any).prompt).toContain("Rooftop");
  });

  it("recall returns nothing for artifacts on a different branch", () => {
    store.recordArtifact({ kind: "image", prompt: "branch A art" });
    store.setBranch("what-if");
    store.recordArtifact({ kind: "image", prompt: "branch B art" });
    const hits = store.recall("art");
    expect(hits).toHaveLength(1);
    expect((hits[0] as any).prompt).toContain("B");
  });

  it("show fetches by id across artifacts and turns", () => {
    const art = store.recordArtifact({ kind: "image", prompt: "lookup test" });
    const found = store.show(art.id);
    expect(found).toEqual(art);
    expect(store.show("does_not_exist")).toBeUndefined();
  });

  it("thread returns artifacts and decisions matching the scope", () => {
    const art = store.recordArtifact({ kind: "image", prompt: "scene 5 rooftop" });
    store.recordDecision({ kind: "accept", target_artifact_id: art.id });
    const t = store.thread("scene 5");
    expect(t.artifacts).toHaveLength(1);
    expect(t.decisions).toHaveLength(1);
  });

  it("summarize reports totals on the current branch", () => {
    store.recordArtifact({ kind: "image", prompt: "p1" });
    store.recordArtifact({ kind: "video", prompt: "p2" });
    const s = store.summarize();
    expect(s).toContain("2 artifacts");
    expect(s).toContain("main");
  });
});

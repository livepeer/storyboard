import { describe, it, expect } from "vitest";
import { classifyIntent } from "@/lib/agents/intent";

describe("Intent Classifier", () => {
  describe("no active project", () => {
    it("returns none for simple prompts", () => {
      expect(classifyIntent("a cat eating pizza", false, 0).type).toBe("none");
    });
    it("returns none for greetings", () => {
      expect(classifyIntent("hello", false, 0).type).toBe("none");
    });
    it("detects multi-scene briefs by scene markers", () => {
      const brief = "Scene 1: a cat. Scene 2: a dog. Scene 3: a bird. Scene 4: a fish.";
      expect(classifyIntent(brief, false, 0).type).toBe("new_project");
    });
    it("detects long briefs as new_project", () => {
      const brief = "x ".repeat(300);
      expect(classifyIntent(brief, false, 0).type).toBe("new_project");
    });
  });

  describe("multi-scene brief with active project (regression)", () => {
    it("treats a multi-scene 'create N streams' brief as new_project even when active project exists", () => {
      // Regression for the scene-iteration false positive: a user
      // typing a new multi-scene stream brief that happens to say
      // "scene 1", "Scene 2", "Scene 3" should NOT be classified as
      // an iteration of the stale active project's scene 1.
      const brief =
        "create 3 streams that show the following scene\n" +
        "scene 1 (stream 1): show a tux cat and a bulldog living in a village\n" +
        "Scene 2: they have trouble with a monster bear\n" +
        "Scene 3: they become friends and live happily after\n" +
        "using lv2v and t2v, studio ghibli style";
      const intent = classifyIntent(brief, true, 3);
      expect(intent.type).toBe("new_project");
    });
  });

  describe("with active project", () => {
    it("detects continue keywords", () => {
      expect(classifyIntent("continue", true, 3).type).toBe("continue");
      expect(classifyIntent("keep going", true, 3).type).toBe("continue");
      expect(classifyIntent("next batch", true, 3).type).toBe("continue");
      expect(classifyIntent("do the rest", true, 3).type).toBe("continue");
    });
    it("detects add_scenes with count", () => {
      const r = classifyIntent("give me 4 more scenes", true, 0);
      expect(r.type).toBe("add_scenes");
      expect(r.count).toBe(4);
    });
    it("detects add_scenes with different count", () => {
      const r = classifyIntent("create 8 more", true, 0);
      expect(r.type).toBe("add_scenes");
      expect(r.count).toBe(8);
    });
    it("detects add_scenes without count defaults to 4", () => {
      const r = classifyIntent("add more scenes", true, 0);
      expect(r.type).toBe("add_scenes");
      expect(r.count).toBe(4);
    });
    it("detects adjust_scene with index", () => {
      const r = classifyIntent("change scene 3 to be darker", true, 0);
      expect(r.type).toBe("adjust_scene");
      expect(r.sceneHint).toBe("3");
    });
    it("detects adjust_scene with ordinal", () => {
      const r = classifyIntent("the 2nd scene needs more light", true, 0);
      expect(r.type).toBe("adjust_scene");
    });
    it("detects style_correction", () => {
      expect(classifyIntent("wrong style, use ghibli", true, 0).type).toBe("style_correction");
      expect(classifyIntent("change style to anime", true, 0).type).toBe("style_correction");
    });
    it("detects status check", () => {
      expect(classifyIntent("where are my pictures?", true, 0).type).toBe("status");
      expect(classifyIntent("nothing is showing up", true, 0).type).toBe("status");
    });
  });
});

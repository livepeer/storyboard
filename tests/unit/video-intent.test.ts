import { describe, it, expect } from "vitest";
import {
  detectVideoIntent,
  extractDurations,
  planVideoStrategy,
  buildLockedPrefix,
  extractColorArc,
  extractCharacterLock,
  extractPerSceneNotes,
} from "@/lib/agents/video-intent";

describe("detectVideoIntent", () => {
  it("detects 'animated short video'", () => {
    expect(detectVideoIntent("Create a 6-scene animated short video in the style of Studio Ghibli")).toBe(true);
  });
  it("detects 'short film'", () => {
    expect(detectVideoIntent("A short film about two strangers")).toBe(true);
  });
  it("detects 'Duration: 45 seconds'", () => {
    expect(detectVideoIntent("Scene 1\u2014TWO WORLDS\nDuration: 45 seconds")).toBe(true);
  });
  it("detects 'Camera: slow pan'", () => {
    expect(detectVideoIntent("Wide shot. Camera: slow pan left to right.")).toBe(true);
  });
  it("returns false for static image briefs", () => {
    expect(detectVideoIntent("Create 5 illustrations of a cat in different poses")).toBe(false);
  });
  it("returns false for short prompts without video signals", () => {
    expect(detectVideoIntent("a happy cat")).toBe(false);
  });
});

describe("extractDurations", () => {
  it("extracts per-scene durations", () => {
    const brief = `SCENE 1 \u2014 Opening\nDuration: 45 seconds\n\nSCENE 2 \u2014 Middle\nDuration: 70 seconds`;
    const durations = extractDurations(brief);
    expect(durations).toHaveLength(2);
    expect(durations[0].seconds).toBe(45);
    expect(durations[1].seconds).toBe(70);
  });
  it("returns empty array when no durations", () => {
    expect(extractDurations("a cat")).toEqual([]);
  });
  it("handles 'Duration: 60s' shorthand", () => {
    const brief = `SCENE 1\nDuration: 60s`;
    expect(extractDurations(brief)[0].seconds).toBe(60);
  });
});

describe("planVideoStrategy", () => {
  it("overview: 1 clip per scene", () => {
    const plan = planVideoStrategy("overview", [45, 70, 60]);
    expect(plan.mode).toBe("overview");
    expect(plan.totalClips).toBe(3);
    expect(plan.perScene).toEqual([1, 1, 1]);
  });
  it("full: ceil(duration/10) clips per scene", () => {
    const plan = planVideoStrategy("full", [45, 70, 60]);
    expect(plan.perScene).toEqual([5, 7, 6]);
    expect(plan.totalClips).toBe(18);
  });
  it("full with no durations returns 0 clips", () => {
    const plan = planVideoStrategy("full", []);
    expect(plan.totalClips).toBe(0);
  });
});

describe("buildLockedPrefix", () => {
  it("combines style + characters + setting", () => {
    const prefix = buildLockedPrefix({
      style: "Studio Ghibli watercolor",
      characters: "TANK the bulldog and KURO the tuxedo cat",
      setting: "Japanese fishing village",
      palette: "warm gold",
      mood: "peaceful",
      rules: "",
    });
    expect(prefix).toContain("Studio Ghibli watercolor");
    expect(prefix).toContain("TANK");
    expect(prefix).toContain("Japanese fishing village");
    expect(prefix.endsWith(", ")).toBe(true);
  });
});

describe("extractColorArc", () => {
  it("parses 'Scene N \u2192 color' lines", () => {
    const brief = `Colour temperature arc:
Scene 1 \u2192 warm gold
Scene 2 \u2192 noon white
Scene 3 \u2192 cold blue-black`;
    const arc = extractColorArc(brief);
    expect(arc).toEqual(["warm gold", "noon white", "cold blue-black"]);
  });
  it("returns empty when no arc", () => {
    expect(extractColorArc("a cat")).toEqual([]);
  });
});

describe("extractCharacterLock", () => {
  it("extracts character names and descriptions", () => {
    const brief = "TANK, a wrinkled English bulldog with an underbite, and KURO, a sleek tuxedo cat with white gloves";
    const lock = extractCharacterLock(brief);
    expect(lock.toUpperCase()).toContain("TANK");
    expect(lock.toUpperCase()).toContain("KURO");
  });
  it("returns empty string when no clear characters", () => {
    expect(extractCharacterLock("a beautiful sunset")).toBe("");
  });
});

describe("extractPerSceneNotes", () => {
  it("extracts visual language and camera notes", () => {
    const sceneText = `SCENE 1 \u2014 Opening
Duration: 45 seconds | Camera: slow pan left
Golden morning. The village wakes.
Visual language: warm saffron morning light`;
    const notes = extractPerSceneNotes(sceneText);
    expect(notes.visualLanguage).toContain("saffron");
    expect(notes.cameraNotes).toContain("pan");
  });
});

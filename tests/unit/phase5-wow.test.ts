import { describe, it, expect, beforeEach } from "vitest";
import {
  addStyleDNA,
  getStyleDNA,
  setActiveStyle,
  getActiveStyle,
  addRating,
  getRatings,
  setPreference,
  getPreference,
  getMemorySummary,
  clearMemory,
} from "@/lib/memory/store";
import {
  memoryStyleTool,
  memoryRateTool,
  memoryPreferenceTool,
} from "@/lib/tools/memory-tools";
import { loadSkillTool } from "@/lib/tools/skill-tools";

describe("Memory Store", () => {
  beforeEach(() => clearMemory());

  it("saves and retrieves style DNA", () => {
    addStyleDNA({
      name: "Moebius",
      description: "Clean line art",
      prompt_prefix: "in Moebius illustration style, clean lines",
    });
    const styles = getStyleDNA();
    expect(styles).toHaveLength(1);
    expect(styles[0].name).toBe("Moebius");
    expect(styles[0].prompt_prefix).toContain("Moebius");
  });

  it("activates and deactivates style DNA", () => {
    addStyleDNA({
      name: "Retro",
      description: "70s style",
      prompt_prefix: "retro 70s warm tones",
    });
    setActiveStyle("Retro");
    expect(getActiveStyle()?.name).toBe("Retro");

    setActiveStyle(null);
    expect(getActiveStyle()).toBeNull();
  });

  it("replaces style with same name", () => {
    addStyleDNA({ name: "Test", description: "v1", prompt_prefix: "v1 prefix" });
    addStyleDNA({ name: "Test", description: "v2", prompt_prefix: "v2 prefix" });
    const styles = getStyleDNA();
    expect(styles).toHaveLength(1);
    expect(styles[0].description).toBe("v2");
  });

  it("saves and retrieves ratings", () => {
    addRating({ ref_id: "img_1", capability: "flux-dev", prompt: "dragon", rating: 4 });
    addRating({ ref_id: "img_2", capability: "recraft-v4", prompt: "robot", rating: 5 });
    const ratings = getRatings();
    expect(ratings).toHaveLength(2);
    expect(ratings[0].rating).toBe(4);
    expect(ratings[1].rating).toBe(5);
  });

  it("saves and retrieves preferences", () => {
    setPreference("default_model", "recraft-v4");
    expect(getPreference("default_model")).toBe("recraft-v4");
    expect(getPreference("nonexistent")).toBeUndefined();
  });

  it("generates memory summary with active style", () => {
    addStyleDNA({ name: "Anime", description: "anime style", prompt_prefix: "anime cel shading" });
    setActiveStyle("Anime");
    const summary = getMemorySummary();
    expect(summary).toContain("Anime");
    expect(summary).toContain("anime cel shading");
  });

  it("generates memory summary with model preferences from ratings", () => {
    addRating({ ref_id: "a", capability: "flux-dev", prompt: "t", rating: 5 });
    addRating({ ref_id: "b", capability: "flux-dev", prompt: "t", rating: 4 });
    addRating({ ref_id: "c", capability: "recraft-v4", prompt: "t", rating: 3 });
    addRating({ ref_id: "d", capability: "recraft-v4", prompt: "t", rating: 2 });
    const summary = getMemorySummary();
    expect(summary).toContain("flux-dev");
    expect(summary).toContain("Preferred models");
  });

  it("empty memory returns empty summary", () => {
    expect(getMemorySummary()).toBe("");
  });
});

describe("Memory Tools", () => {
  beforeEach(() => clearMemory());

  it("memory_style save + list", async () => {
    const save = await memoryStyleTool.execute({
      action: "save",
      name: "Noir",
      description: "Film noir",
      prompt_prefix: "film noir, high contrast, shadows",
    });
    expect(save.success).toBe(true);

    const list = await memoryStyleTool.execute({ action: "list" });
    expect(list.success).toBe(true);
    expect(list.data.styles).toHaveLength(1);
    expect(list.data.styles[0].name).toBe("Noir");
  });

  it("memory_style activate + deactivate", async () => {
    await memoryStyleTool.execute({
      action: "save",
      name: "Pop",
      prompt_prefix: "pop art bold colors",
    });
    const activate = await memoryStyleTool.execute({
      action: "activate",
      name: "Pop",
    });
    expect(activate.success).toBe(true);
    expect(getActiveStyle()?.name).toBe("Pop");

    await memoryStyleTool.execute({ action: "deactivate" });
    expect(getActiveStyle()).toBeNull();
  });

  it("memory_style save requires name and prompt_prefix", async () => {
    const result = await memoryStyleTool.execute({ action: "save" });
    expect(result.success).toBe(false);
  });

  it("memory_rate validates 1-5 range", async () => {
    const bad = await memoryRateTool.execute({ ref_id: "x", rating: 7 });
    expect(bad.success).toBe(false);

    const good = await memoryRateTool.execute({ ref_id: "x", rating: 4 });
    expect(good.success).toBe(true);
  });

  it("memory_preference saves correctly", async () => {
    const result = await memoryPreferenceTool.execute({
      key: "theme",
      value: "dark fantasy",
    });
    expect(result.success).toBe(true);
    expect(getPreference("theme")).toBe("dark fantasy");
  });
});

describe("Skill Registry — Phase 5 skills", () => {
  it("load_skill lists new Phase 5 skills", () => {
    const enums = loadSkillTool.parameters.properties?.skill_id?.enum as string[];
    expect(enums).toContain("storyboard");
    expect(enums).toContain("live-director");
    expect(enums).toContain("refinement");
    expect(enums).toContain("remix");
  });
});

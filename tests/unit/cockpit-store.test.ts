import { describe, it, expect, beforeEach } from "vitest";
import { useCockpitStore } from "@/lib/stream/cockpit-store";
import type { ToolCall } from "@/lib/stream/cockpit-types";

const sampleAction: ToolCall = {
  tool: "scope_apply_preset",
  params: { preset: "dreamy" },
  summary: "applied dreamy preset",
  kind: "preset",
};

describe("CockpitStore", () => {
  beforeEach(() => {
    useCockpitStore.setState({ history: [], pinnedSkills: [] });
  });

  it("starts empty", () => {
    expect(useCockpitStore.getState().history).toHaveLength(0);
    expect(useCockpitStore.getState().pinnedSkills).toHaveLength(0);
  });

  it("records history", () => {
    useCockpitStore.getState().recordHistory("make it dreamy", sampleAction, "kept");
    expect(useCockpitStore.getState().history).toHaveLength(1);
    expect(useCockpitStore.getState().history[0].intent).toBe("make it dreamy");
    expect(useCockpitStore.getState().history[0].outcome).toBe("kept");
  });

  it("caps history at 100 entries", () => {
    for (let i = 0; i < 110; i++) {
      useCockpitStore.getState().recordHistory(`intent ${i}`, sampleAction, "kept");
    }
    expect(useCockpitStore.getState().history).toHaveLength(100);
    expect(useCockpitStore.getState().history[0].intent).toBe("intent 10");
  });

  it("pins a skill from an action", () => {
    const skill = useCockpitStore.getState().pinAction("anime style", sampleAction, "Anime Quick");
    expect(skill.name).toBe("Anime Quick");
    expect(skill.triggers).toContain("anime");
    expect(skill.uses).toBe(0);
    expect(useCockpitStore.getState().pinnedSkills).toHaveLength(1);
  });

  it("auto-generates skill name from intent if not provided", () => {
    const skill = useCockpitStore.getState().pinAction("dreamy soft glow", sampleAction);
    expect(skill.name).toBeTruthy();
    expect(skill.name.length).toBeGreaterThan(0);
  });

  it("removes a pinned skill", () => {
    const skill = useCockpitStore.getState().pinAction("test thing", sampleAction);
    useCockpitStore.getState().unpinSkill(skill.id);
    expect(useCockpitStore.getState().pinnedSkills).toHaveLength(0);
  });

  it("findPinnedSkill matches by trigger keyword", () => {
    useCockpitStore.getState().pinAction("anime style with bright colors", sampleAction, "Anime");
    const match = useCockpitStore.getState().findPinnedSkill("make it anime");
    expect(match?.name).toBe("Anime");
  });

  it("findPinnedSkill returns null when no match", () => {
    useCockpitStore.getState().pinAction("anime style", sampleAction);
    const match = useCockpitStore.getState().findPinnedSkill("cyberpunk neon city");
    expect(match).toBeNull();
  });

  it("getBiasFor returns empty bias when no history", () => {
    const bias = useCockpitStore.getState().getBiasFor("dreamy mood");
    expect(bias.sampleCount).toBe(0);
    expect(bias.preferredPreset).toBeUndefined();
  });

  it("getBiasFor computes preferred preset from history", () => {
    const dreamyAction: ToolCall = {
      tool: "scope_apply_preset",
      params: { preset: "dreamy" },
      summary: "",
      kind: "preset",
    };
    for (let i = 0; i < 3; i++) {
      useCockpitStore.getState().recordHistory("dreamy mood", dreamyAction, "kept");
    }
    const bias = useCockpitStore.getState().getBiasFor("dreamy mood");
    expect(bias.preferredPreset).toBe("dreamy");
    expect(bias.sampleCount).toBe(3);
  });

  it("incrementSkillUses tracks usage", () => {
    const skill = useCockpitStore.getState().pinAction("test thing", sampleAction);
    useCockpitStore.getState().incrementSkillUses(skill.id);
    useCockpitStore.getState().incrementSkillUses(skill.id);
    const updated = useCockpitStore.getState().pinnedSkills.find((s) => s.id === skill.id);
    expect(updated?.uses).toBe(2);
  });
});

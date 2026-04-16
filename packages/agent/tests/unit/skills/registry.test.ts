import { describe, it, expect } from "vitest";
import { SkillRegistry } from "../../../src/skills/registry.js";
import type { Skill } from "../../../src/skills/types.js";

function makeSkill(name: string, prompt: string, body: string): Skill {
  return { name, description: `${name} description`, prompt, body, path: `/skills/${name}.md` };
}

describe("SkillRegistry", () => {
  it("systemBlock contains all registered skill prompts", () => {
    const registry = new SkillRegistry();
    registry.add(makeSkill("image-gen", "Use this skill for image generation", "# Image Gen\n\nDetails..."));
    registry.add(makeSkill("video-edit", "Use this skill for video editing", "# Video Edit\n\nDetails..."));

    const block = registry.systemBlock();
    expect(block).toContain("## Skills");
    expect(block).toContain("image-gen");
    expect(block).toContain("Use this skill for image generation");
    expect(block).toContain("video-edit");
    expect(block).toContain("Use this skill for video editing");
  });

  it("getBody returns the full body of a registered skill (progressive disclosure)", () => {
    const registry = new SkillRegistry();
    const body = "# Full Reference\n\nThis is the complete skill body with all details.\n\n## Parameters\n\n- param1: description";
    registry.add(makeSkill("detailed-skill", "Use this skill for detailed work", body));

    const retrieved = registry.getBody("detailed-skill");
    expect(retrieved).toBe(body);
  });

  it("returns empty string for systemBlock when no skills registered", () => {
    const registry = new SkillRegistry();
    expect(registry.systemBlock()).toBe("");
  });

  it("get returns undefined for unknown skills", () => {
    const registry = new SkillRegistry();
    expect(registry.get("nonexistent")).toBeUndefined();
  });

  it("list returns all registered skills", () => {
    const registry = new SkillRegistry();
    registry.add(makeSkill("skill-a", "Prompt A", "Body A"));
    registry.add(makeSkill("skill-b", "Prompt B", "Body B"));
    expect(registry.list()).toHaveLength(2);
  });
});

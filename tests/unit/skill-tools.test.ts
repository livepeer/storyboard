import { describe, it, expect } from "vitest";
import { loadSkillTool } from "@/lib/tools/skill-tools";
import { createMediaTool } from "@/lib/tools/compound-tools";

describe("Skill Tools", () => {
  it("load_skill has correct schema", () => {
    expect(loadSkillTool.name).toBe("load_skill");
    expect(loadSkillTool.parameters.properties?.skill_id).toBeDefined();
    const enums = loadSkillTool.parameters.properties?.skill_id?.enum;
    expect(enums).toContain("text-to-image");
    expect(enums).toContain("scope-lv2v");
    expect(enums).toContain("lora-training");
    expect(enums).toContain("style-presets");
  });

  it("load_skill description lists available skills", () => {
    expect(loadSkillTool.description).toContain("text-to-image");
    expect(loadSkillTool.description).toContain("scope-lv2v");
  });
});

describe("Compound Tools", () => {
  it("create_media has correct schema", () => {
    expect(createMediaTool.name).toBe("create_media");
    expect(createMediaTool.parameters.properties?.steps).toBeDefined();
    expect(createMediaTool.parameters.required).toContain("steps");
  });

  it("create_media steps have action enum", () => {
    const stepSchema = createMediaTool.parameters.properties?.steps?.items;
    expect(stepSchema?.properties?.action?.enum).toContain("generate");
    expect(stepSchema?.properties?.action?.enum).toContain("restyle");
    expect(stepSchema?.properties?.action?.enum).toContain("animate");
    expect(stepSchema?.properties?.action?.enum).toContain("upscale");
  });

  it("create_media fails with no steps", async () => {
    const result = await createMediaTool.execute({ steps: [] });
    expect(result.success).toBe(false);
    expect(result.error).toContain("No steps");
  });
});

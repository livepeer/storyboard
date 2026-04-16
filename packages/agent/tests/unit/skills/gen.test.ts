import { describe, it, expect } from "vitest";
import { generateSkillFromDescription } from "../../../src/skills/gen.js";
import { MockProvider } from "../../../src/providers/mock.js";

describe("generateSkillFromDescription", () => {
  it("returns valid frontmatter+body when LLM cooperates", async () => {
    const provider = new MockProvider({
      responses: [[
        { kind: "text", text: '---\nname: luxury-skincare\ndescription: ad spec\nprompt: "Use for luxury skincare ads"\n---\n\n# Body\n\nGuidelines...' },
        { kind: "done" },
      ]],
    });
    const skill = await generateSkillFromDescription(provider, "luxury skincare ads");
    expect(skill.name).toBe("luxury-skincare");
    expect(skill.body).toContain("Guidelines");
  });

  it("throws when LLM returns an error chunk", async () => {
    const provider = new MockProvider({
      responses: [[
        { kind: "error", error: "provider unavailable" },
      ]],
    });
    await expect(generateSkillFromDescription(provider, "something")).rejects.toThrow("provider unavailable");
  });
});

import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseSkillFile, loadSkillDir } from "../../../src/skills/loader.js";

describe("parseSkillFile", () => {
  it("parses frontmatter and body correctly", () => {
    const raw = `---
name: test-skill
description: A test skill
prompt: "Use this skill when testing"
---

# Test Skill

This is the body content.`;
    const skill = parseSkillFile(raw, "/tmp/test-skill.md");
    expect(skill.name).toBe("test-skill");
    expect(skill.description).toBe("A test skill");
    expect(skill.prompt).toBe("Use this skill when testing");
    expect(skill.body).toContain("This is the body content.");
    expect(skill.path).toBe("/tmp/test-skill.md");
  });

  it("[INV-3] rejects skills with prompt > 600 chars", () => {
    const longPrompt = "A".repeat(601);
    const raw = `---
name: too-long
description: A skill with an oversized prompt
prompt: "${longPrompt}"
---

# Body
`;
    expect(() => parseSkillFile(raw, "/tmp/too-long.md")).toThrow("600");
  });

  it("throws when frontmatter is missing", () => {
    const raw = `# No frontmatter\n\nJust body content.`;
    expect(() => parseSkillFile(raw, "/tmp/no-fm.md")).toThrow("missing frontmatter");
  });
});

describe("loadSkillDir", () => {
  it("loads skills from nested directories", () => {
    const dir = mkdtempSync(join(tmpdir(), "skills-test-"));
    const subdir = join(dir, "sub");
    mkdirSync(subdir);

    writeFileSync(
      join(dir, "root-skill.md"),
      `---
name: root-skill
description: Root level skill
prompt: "Use this skill for root tasks"
---

# Root Skill Body`,
    );

    writeFileSync(
      join(subdir, "sub-skill.md"),
      `---
name: sub-skill
description: Sub directory skill
prompt: "Use this skill for sub tasks"
---

# Sub Skill Body`,
    );

    const skills = loadSkillDir(dir);
    expect(skills.length).toBe(2);
    const names = skills.map((s) => s.name).sort();
    expect(names).toEqual(["root-skill", "sub-skill"]);
  });
});

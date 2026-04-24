import { describe, it, expect } from "vitest";
import { resolveSkills, wouldConflict, type SkillEntry } from "../routing/skill-resolver";

const ghibli: SkillEntry = { id: "ghibli", category: "style", prompt_prefix: "Studio Ghibli hand-painted watercolor" };
const photo: SkillEntry = { id: "photo", category: "style", prompt_prefix: "photorealistic DSLR photography" };
const darkMood: SkillEntry = { id: "dark-mood", category: "mood", prompt_prefix: "dark moody atmosphere" };
const anime: SkillEntry = { id: "anime", category: "style", prompt_prefix: "anime cel-shaded vibrant" };

describe("resolveSkills", () => {
  it("no conflicts for single skill", () => {
    const result = resolveSkills([ghibli]);
    expect(result.conflicts).toHaveLength(0);
    expect(result.active).toHaveLength(1);
  });

  it("no conflicts for different categories", () => {
    const result = resolveSkills([ghibli, darkMood]);
    expect(result.conflicts).toHaveLength(0);
  });

  it("detects conflict between ghibli + photorealistic", () => {
    const result = resolveSkills([ghibli, photo]);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].category).toBe("style");
    expect(result.conflicts[0].skills).toContain("ghibli");
    expect(result.conflicts[0].skills).toContain("photo");
  });

  it("detects conflict among 3 styles", () => {
    const result = resolveSkills([ghibli, photo, anime]);
    expect(result.conflicts.length).toBeGreaterThan(0);
  });

  it("all skills still pass through (conflicts are warnings)", () => {
    const result = resolveSkills([ghibli, photo]);
    expect(result.active).toHaveLength(2); // both pass, but warned
  });

  it("no conflicts for skills without style prefixes", () => {
    const plain: SkillEntry = { id: "custom", category: "custom", prompt_prefix: "add sparkles" };
    const result = resolveSkills([plain, darkMood]);
    expect(result.conflicts).toHaveLength(0);
  });
});

describe("wouldConflict", () => {
  it("returns null when no conflict", () => {
    expect(wouldConflict([ghibli], darkMood)).toBeNull();
  });

  it("returns conflict when styles clash", () => {
    const conflict = wouldConflict([ghibli], photo);
    expect(conflict).not.toBeNull();
    expect(conflict!.message).toContain("ghibli");
    expect(conflict!.message).toContain("photorealistic");
  });

  it("returns null when same style family", () => {
    // Both are "ghibli" category
    const ghibli2: SkillEntry = { id: "ghibli2", category: "style", prompt_prefix: "Ghibli inspired watercolor" };
    expect(wouldConflict([ghibli], ghibli2)).toBeNull();
  });

  it("returns null when candidate has no style prefix", () => {
    const noPrefix: SkillEntry = { id: "x", category: "x" };
    expect(wouldConflict([ghibli], noPrefix)).toBeNull();
  });
});

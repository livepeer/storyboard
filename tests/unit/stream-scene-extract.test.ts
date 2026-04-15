import { describe, expect, test } from "vitest";
import { extractSceneBlocks } from "@/lib/agents/gemini/index";

const extractScenes = (text: string) => extractSceneBlocks(text, true);

describe("stream scene extractor", () => {
  test("user's exact bug prompt parses into 3 scenes with verbatim content", () => {
    const prompt =
      "create 3 live streams that show the following scene\n" +
      "scene 1 (stream 1): show a tux cat and a bull dog as friends live in an italy village, where they walk together, eat together, play together, watch sun rise, see the sun set\n\n" +
      "Scene 2: two of them have trouble, with a monster bear . the monster bear is huge, and angoy, they run into each other and do not like each other\n\n" +
      "Scene 3, three become friends, and live happily after";
    const scenes = extractScenes(prompt);
    expect(scenes).toHaveLength(3);
    expect(scenes[0].index).toBe(1);
    expect(scenes[0].text).toContain("tux cat");
    expect(scenes[0].text).toContain("bull dog");
    expect(scenes[0].text).toContain("italy village");
    expect(scenes[0].text).toContain("sun rise");
    expect(scenes[1].index).toBe(2);
    expect(scenes[1].text).toContain("monster bear");
    expect(scenes[1].text).toContain("huge");
    expect(scenes[2].index).toBe(3);
    expect(scenes[2].text).toContain("friends");
    expect(scenes[2].text).toContain("happily");
  });

  test("'(stream N)' parenthetical is stripped", () => {
    const scenes = extractScenes("scene 1 (stream 1): a cat");
    expect(scenes[0].text).toBe("a cat");
  });

  test("colon delimiter", () => {
    const scenes = extractScenes("Scene 2: a dog barking");
    expect(scenes[0].index).toBe(2);
    expect(scenes[0].text).toBe("a dog barking");
  });

  test("comma delimiter", () => {
    const scenes = extractScenes("Scene 3, a bird flying");
    expect(scenes[0].index).toBe(3);
    expect(scenes[0].text).toBe("a bird flying");
  });

  test("preserves multi-sentence scene content", () => {
    const scenes = extractScenes(
      "Scene 1: A cat walks into a bakery. She steals a pastry. The baker chases her out with a broom."
    );
    expect(scenes[0].text).toContain("walks into a bakery");
    expect(scenes[0].text).toContain("steals a pastry");
    expect(scenes[0].text).toContain("broom");
  });

  test("caps length at 400 chars", () => {
    const long = "scene 1: " + "a ".repeat(300);
    const scenes = extractScenes(long);
    expect(scenes[0].text.length).toBeLessThanOrEqual(400);
  });

  test("handles 5 scenes", () => {
    const prompt = [
      "Scene 1: a red balloon rising",
      "Scene 2: a blue fish swimming",
      "Scene 3: a yellow sun setting",
      "Scene 4: a green tree growing",
      "Scene 5: a silver moon rising",
    ].join("\n");
    const scenes = extractScenes(prompt);
    expect(scenes).toHaveLength(5);
    expect(scenes.map((s) => s.index)).toEqual([1, 2, 3, 4, 5]);
    expect(scenes[0].text).toContain("balloon");
    expect(scenes[4].text).toContain("moon");
  });

  test("no scenes in plain text → empty", () => {
    expect(extractScenes("make a cat playing with a dog")).toEqual([]);
  });
});

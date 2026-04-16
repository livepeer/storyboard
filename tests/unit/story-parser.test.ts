import { describe, expect, test } from "vitest";
import {
  extractJsonObject,
  validateStoryPayload,
} from "@/lib/story/generator";

const validPayload = {
  title: "The Cat and the Dog",
  audience: "10-year-olds",
  arc: "meet → misunderstand → share → bond",
  context: {
    style: "Warm Studio Ghibli watercolor, sun-soaked pastels",
    palette: "honey gold, sky blue, sage green, peach pink",
    characters: "Mochi: orange tabby. Buddy: golden retriever.",
    setting: "Coastal village",
    rules: "Consistent characters",
    mood: "Playful, tender",
  },
  scenes: [
    { index: 1, title: "First Meeting", description: "Mochi peers from the hedge as Buddy bounds into the garden, tail wagging." },
    { index: 2, title: "The Water Dish", description: "Buddy splashes water at Mochi, who flees up a peach tree with her tail puffed." },
  ],
};

describe("extractJsonObject", () => {
  test("plain JSON", () => {
    const out = extractJsonObject(JSON.stringify(validPayload));
    expect(out).not.toBeNull();
    expect((out as Record<string, unknown>).title).toBe("The Cat and the Dog");
  });

  test("JSON wrapped in ```json ... ``` code fence", () => {
    const raw = "```json\n" + JSON.stringify(validPayload) + "\n```";
    const out = extractJsonObject(raw);
    expect((out as Record<string, unknown>).title).toBe("The Cat and the Dog");
  });

  test("JSON wrapped in ``` ... ``` without language", () => {
    const raw = "```\n" + JSON.stringify(validPayload) + "\n```";
    const out = extractJsonObject(raw);
    expect((out as Record<string, unknown>).title).toBe("The Cat and the Dog");
  });

  test("JSON with leading preamble", () => {
    const raw = 'Here is your story:\n\n' + JSON.stringify(validPayload);
    const out = extractJsonObject(raw);
    expect((out as Record<string, unknown>).title).toBe("The Cat and the Dog");
  });

  test("JSON with trailing prose", () => {
    const raw = JSON.stringify(validPayload) + "\n\nLet me know if you'd like changes!";
    const out = extractJsonObject(raw);
    expect((out as Record<string, unknown>).title).toBe("The Cat and the Dog");
  });

  test("JSON with both preamble and trailing", () => {
    const raw = "Here you go:\n```json\n" + JSON.stringify(validPayload) + "\n```\nThanks!";
    const out = extractJsonObject(raw);
    expect((out as Record<string, unknown>).title).toBe("The Cat and the Dog");
  });

  test("empty string → null", () => {
    expect(extractJsonObject("")).toBeNull();
  });

  test("plain prose with no JSON → null", () => {
    expect(extractJsonObject("I can't help with that.")).toBeNull();
  });

  test("malformed JSON → null", () => {
    expect(extractJsonObject("{title: 'bad'}")).toBeNull();
  });
});

describe("validateStoryPayload", () => {
  test("valid payload passes", () => {
    const result = validateStoryPayload(validPayload, "cat and dog");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.story.title).toBe("The Cat and the Dog");
      expect(result.story.scenes).toHaveLength(2);
      expect(result.story.context.style).toContain("Ghibli");
      expect(result.story.originalPrompt).toBe("cat and dog");
    }
  });

  test("missing title → fail", () => {
    const bad = { ...validPayload, title: "" };
    const result = validateStoryPayload(bad, "test");
    expect(result.ok).toBe(false);
  });

  test("missing context → fail", () => {
    const bad = { ...validPayload, context: undefined };
    const result = validateStoryPayload(bad, "test");
    expect(result.ok).toBe(false);
  });

  test("missing scenes → fail", () => {
    const bad = { ...validPayload, scenes: [] };
    const result = validateStoryPayload(bad, "test");
    expect(result.ok).toBe(false);
  });

  test("scenes with too-short description are filtered", () => {
    const bad = {
      ...validPayload,
      scenes: [
        { index: 1, title: "Good", description: "This is a long enough scene description to be useful." },
        { index: 2, title: "Bad", description: "tiny" }, // 4 chars, filtered
      ],
    };
    const result = validateStoryPayload(bad, "test");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.story.scenes).toHaveLength(1);
  });

  test("all scenes filtered → fail", () => {
    const bad = {
      ...validPayload,
      scenes: [{ index: 1, title: "Bad", description: "x" }],
    };
    const result = validateStoryPayload(bad, "test");
    expect(result.ok).toBe(false);
  });

  test("{error: ...} soft-fail from model", () => {
    const result = validateStoryPayload(
      { error: "Please give me more detail." },
      "a"
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("more detail");
  });

  test("context with no style AND no characters → fail", () => {
    const bad = {
      ...validPayload,
      context: { style: "", palette: "", characters: "", setting: "", rules: "", mood: "" },
    };
    const result = validateStoryPayload(bad, "test");
    expect(result.ok).toBe(false);
  });

  test("context with only style passes", () => {
    const ok = {
      ...validPayload,
      context: { style: "watercolor", palette: "", characters: "", setting: "", rules: "", mood: "" },
    };
    const result = validateStoryPayload(ok, "test");
    expect(result.ok).toBe(true);
  });

  test("audience defaults to 'all ages' if missing", () => {
    const partial = { ...validPayload };
    delete (partial as Record<string, unknown>).audience;
    const result = validateStoryPayload(partial, "test");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.story.audience).toBe("all ages");
  });

  test("scenes[].beats is preserved when present", () => {
    const withBeats = {
      ...validPayload,
      scenes: [
        {
          index: 1,
          title: "Shot",
          description: "A wide establishing shot of the village at dawn, mist rising from the sea.",
          beats: ["wide shot", "slow dolly in"],
        },
      ],
    };
    const result = validateStoryPayload(withBeats, "test");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.story.scenes[0].beats).toEqual(["wide shot", "slow dolly in"]);
  });

  test("null or non-object input → fail", () => {
    expect(validateStoryPayload(null, "x").ok).toBe(false);
    expect(validateStoryPayload("a string", "x").ok).toBe(false);
    expect(validateStoryPayload(42, "x").ok).toBe(false);
  });
});

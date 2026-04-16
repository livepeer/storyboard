import { describe, expect, test } from "vitest";
import {
  buildPrefixFromContext,
  buildMotionPrefixFromContext,
  type CreativeContext,
} from "@/lib/agents/session-context";

const FULL_CTX: CreativeContext = {
  style: "Studio Ghibli, hand-painted watercolor, atmospheric lantern-lit scenes",
  characters: "Young girl around 10, windswept hair, red yukata",
  palette: "burnt sienna, sage green, soft ochre",
  setting: "countryside village, late summer festival, dusk",
  rules: "always in motion, lanterns in every scene",
  mood: "warm, magical, quietly joyful",
};

describe("buildPrefixFromContext — image generation prefix", () => {
  test("includes characters for image consistency", () => {
    const prefix = buildPrefixFromContext(FULL_CTX);
    expect(prefix).toContain("Young girl");
    expect(prefix).toContain("Studio Ghibli");
    expect(prefix).toContain("burnt sienna");
  });

  test("includes setting", () => {
    const prefix = buildPrefixFromContext(FULL_CTX);
    expect(prefix).toContain("countryside village");
  });
});

describe("buildMotionPrefixFromContext — animate image-to-video prefix", () => {
  test("omits characters (prevents Veo safety trigger on minors + fire)", () => {
    const prefix = buildMotionPrefixFromContext(FULL_CTX);
    expect(prefix).not.toContain("Young girl");
    expect(prefix).not.toContain("yukata");
  });

  test("omits setting (already in source image)", () => {
    const prefix = buildMotionPrefixFromContext(FULL_CTX);
    expect(prefix).not.toContain("countryside village");
    expect(prefix).not.toContain("festival");
  });

  test("keeps style, mood, palette for aesthetic consistency", () => {
    const prefix = buildMotionPrefixFromContext(FULL_CTX);
    expect(prefix).toContain("Studio Ghibli");
    expect(prefix).toContain("warm");
    expect(prefix).toContain("burnt sienna");
  });

  test("empty when no fields set", () => {
    expect(
      buildMotionPrefixFromContext({
        style: "",
        characters: "Young girl",
        palette: "",
        setting: "forest",
        rules: "",
        mood: "",
      })
    ).toBe("");
  });

  test("truncates to 40 words max", () => {
    const longCtx: CreativeContext = {
      style: "a ".repeat(50).trim(),
      characters: "",
      palette: "",
      setting: "",
      rules: "",
      mood: "",
    };
    const prefix = buildMotionPrefixFromContext(longCtx);
    const words = prefix.trim().replace(/,$/, "").split(/\s+/);
    expect(words.length).toBeLessThanOrEqual(40);
  });

  test("ends with comma+space so it concatenates cleanly to motion prompt", () => {
    const prefix = buildMotionPrefixFromContext(FULL_CTX);
    expect(prefix).toMatch(/,\s$/);
  });
});

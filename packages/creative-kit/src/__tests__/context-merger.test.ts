import { describe, it, expect } from "vitest";
import { buildPrefix, buildMotionPrefix, mergeWithEpisode, resolveStyle } from "../agent/context-merger";

describe("buildPrefix", () => {
  it("joins all fields", () => {
    const prefix = buildPrefix({ style: "Ghibli", palette: "warm", characters: "girl", setting: "forest", rules: "", mood: "dreamy" });
    expect(prefix).toContain("Ghibli");
    expect(prefix).toContain("warm");
    expect(prefix).toContain("girl");
    expect(prefix).toContain("forest");
    expect(prefix).toContain("dreamy");
    expect(prefix.endsWith(", ")).toBe(true);
  });

  it("returns empty for empty context", () => {
    expect(buildPrefix({ style: "", palette: "", characters: "", setting: "", rules: "", mood: "" })).toBe("");
  });
});

describe("buildMotionPrefix", () => {
  it("drops characters and setting", () => {
    const prefix = buildMotionPrefix({ style: "cinematic", palette: "teal", characters: "girl", setting: "forest", rules: "", mood: "epic" });
    expect(prefix).toContain("cinematic");
    expect(prefix).toContain("teal");
    expect(prefix).toContain("epic");
    expect(prefix).not.toContain("girl");
    expect(prefix).not.toContain("forest");
  });
});

describe("mergeWithEpisode", () => {
  const base = { style: "ghibli", palette: "warm", characters: "girl", setting: "forest", rules: "", mood: "dreamy" };

  it("episode overrides non-empty fields", () => {
    const merged = mergeWithEpisode(base, { style: "noir", mood: "dark" });
    expect(merged.style).toBe("noir");
    expect(merged.mood).toBe("dark");
    expect(merged.palette).toBe("warm"); // not overridden
    expect(merged.characters).toBe("girl"); // not overridden
  });

  it("empty episode fields keep base values", () => {
    const merged = mergeWithEpisode(base, { style: "" });
    expect(merged.style).toBe("ghibli"); // empty string doesn't override
  });
});

describe("resolveStyle", () => {
  const session = { style: "ghibli watercolor", palette: "warm pastels", characters: "young girl", setting: "countryside", rules: "", mood: "magical" };

  it("returns session prefix for generate", () => {
    const result = resolveStyle("generate", "test", { sessionContext: session });
    expect(result.prefix).toContain("ghibli");
    expect(result.prefix).toContain("young girl");
    expect(result.sources).toContain("session");
  });

  it("returns motion prefix for animate (no characters)", () => {
    const result = resolveStyle("animate", "test", { sessionContext: session });
    expect(result.prefix).toContain("ghibli");
    expect(result.prefix).not.toContain("young girl");
    expect(result.prefix).not.toContain("countryside");
  });

  it("returns empty for tts", () => {
    const result = resolveStyle("tts", "test", { sessionContext: session });
    expect(result.prefix).toBe("");
  });

  it("episode overrides session", () => {
    const result = resolveStyle("generate", "test", {
      sessionContext: session,
      episodeOverride: { style: "noir" },
    });
    expect(result.prefix).toContain("noir");
    expect(result.sources).toContain("episode");
  });

  it("falls back to project prefix when no session", () => {
    const result = resolveStyle("generate", "test", {
      sessionContext: null,
      projectPrefix: "editorial photo, ",
    });
    expect(result.prefix).toBe("editorial photo, ");
    expect(result.sources).toContain("project");
  });

  it("applies skill prefix and suffix", () => {
    const result = resolveStyle("generate", "test", {
      sessionContext: session,
      skills: [{ prompt_prefix: "LEGO style, ", prompt_suffix: ", toy photography" }],
    });
    expect(result.prefix).toMatch(/^LEGO style, /);
    expect(result.suffix).toContain("toy photography");
    expect(result.sources).toContain("skill");
  });

  it("skill model_hint is captured", () => {
    const result = resolveStyle("generate", "test", {
      sessionContext: session,
      skills: [{ model_hint: "recraft-v4" }],
    });
    expect(result.modelHint).toBe("recraft-v4");
  });

  it("video skill addition applied for animate", () => {
    const result = resolveStyle("animate", "test", {
      sessionContext: session,
      skills: [{ video_prompt_addition: "smooth motion" }],
    });
    expect(result.suffix).toContain("smooth motion");
  });
});

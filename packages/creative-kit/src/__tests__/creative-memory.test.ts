import { describe, it, expect, beforeEach } from "vitest";
import { recordPositive, recordNegative, getTopPreferences, getPreferredModel, getPreferredStyle, buildPreferencePrefix, clearMemory, getAllPreferences } from "../agent/creative-memory";

beforeEach(() => { clearMemory(); });

describe("Creative Memory", () => {
  it("records positive signals", () => {
    recordPositive("style", "ghibli watercolor");
    recordPositive("style", "ghibli watercolor");
    const prefs = getTopPreferences("style");
    expect(prefs).toHaveLength(1);
    expect(prefs[0].value).toBe("ghibli watercolor");
    expect(prefs[0].score).toBe(2);
    expect(prefs[0].usageCount).toBe(2);
  });

  it("records negative signals", () => {
    recordPositive("style", "photorealistic", 5);
    recordNegative("style", "photorealistic", 2);
    const prefs = getTopPreferences("style");
    expect(prefs[0].score).toBe(3); // 5 - 2
  });

  it("sorts by score", () => {
    recordPositive("style", "anime", 3);
    recordPositive("style", "ghibli", 5);
    recordPositive("style", "noir", 1);
    const prefs = getTopPreferences("style");
    expect(prefs[0].value).toBe("ghibli");
    expect(prefs[1].value).toBe("anime");
    expect(prefs[2].value).toBe("noir");
  });

  it("filters by category", () => {
    recordPositive("style", "ghibli");
    recordPositive("model", "flux-dev");
    recordPositive("mood", "dreamy");
    expect(getTopPreferences("style")).toHaveLength(1);
    expect(getTopPreferences("model")).toHaveLength(1);
    expect(getTopPreferences("mood")).toHaveLength(1);
  });

  it("getPreferredModel returns top model", () => {
    recordPositive("model", "seedream-5-lite", 5);
    recordPositive("model", "flux-dev", 3);
    expect(getPreferredModel()).toBe("seedream-5-lite");
  });

  it("getPreferredModel returns null when no prefs", () => {
    expect(getPreferredModel()).toBeNull();
  });

  it("getPreferredStyle returns top style", () => {
    recordPositive("style", "cinematic", 4);
    expect(getPreferredStyle()).toBe("cinematic");
  });

  it("buildPreferencePrefix with strong prefs", () => {
    recordPositive("style", "watercolor", 5);
    recordPositive("mood", "dreamy", 4);
    const prefix = buildPreferencePrefix();
    expect(prefix).toContain("watercolor");
    expect(prefix).toContain("dreamy");
  });

  it("buildPreferencePrefix empty with weak prefs", () => {
    recordPositive("style", "watercolor", 1); // below threshold of 3
    expect(buildPreferencePrefix()).toBe("");
  });

  it("caps at max preferences", () => {
    for (let i = 0; i < 120; i++) {
      recordPositive("style", `style-${i}`);
    }
    const all = getAllPreferences();
    expect(all.preferences.length).toBeLessThanOrEqual(100);
  });

  it("clearMemory resets everything", () => {
    recordPositive("style", "test", 5);
    clearMemory();
    expect(getAllPreferences().preferences).toHaveLength(0);
    expect(getAllPreferences().totalSignals).toBe(0);
  });

  it("score clamped to [-10, 10]", () => {
    recordPositive("style", "test", 15);
    expect(getTopPreferences("style")[0].score).toBe(10);
    clearMemory();
    recordNegative("style", "test", 15);
    // Negative score doesn't appear in getTopPreferences (filters score > 0)
    expect(getTopPreferences("style")).toHaveLength(0);
  });
});

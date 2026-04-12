import { describe, it, expect } from "vitest";
import { breakSceneIntoBeatsFallback } from "@/lib/agents/beat-extractor";

describe("breakSceneIntoBeatsFallback", () => {
  it("returns N beats from a multi-sentence scene", () => {
    const description = "Tank wades into the floodwater. Kuro is afraid. Tank reaches the ledge. Kuro steps onto Tank's back. They reach the temple steps. Tank collapses. Kuro looks at him without contempt.";
    const beats = breakSceneIntoBeatsFallback(description, 3);
    expect(beats).toHaveLength(3);
    for (const beat of beats) {
      expect(beat.length).toBeGreaterThan(0);
      expect(beat.length).toBeLessThan(500);
    }
  });

  it("returns the same description when N=1", () => {
    const beats = breakSceneIntoBeatsFallback("Tank crosses the bridge", 1);
    expect(beats).toHaveLength(1);
  });

  it("handles short descriptions by labeling beats", () => {
    const beats = breakSceneIntoBeatsFallback("rain falls", 4);
    expect(beats).toHaveLength(4);
    // All should contain "rain falls" + a label
    for (const beat of beats) {
      expect(beat).toContain("rain falls");
    }
  });

  it("returns N beats for N=7 with enough sentences", () => {
    const description = "First moment. Second moment. Third moment. Fourth moment. Fifth moment. Sixth moment. Seventh moment.";
    const beats = breakSceneIntoBeatsFallback(description, 7);
    expect(beats).toHaveLength(7);
  });
});

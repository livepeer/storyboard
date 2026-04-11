import { describe, it, expect, beforeEach } from "vitest";
import { useWorkingMemory } from "@/lib/agents/working-memory";

describe("WorkingMemory", () => {
  beforeEach(() => {
    useWorkingMemory.getState().reset();
  });

  it("starts with empty state", () => {
    const m = useWorkingMemory.getState();
    expect(m.project).toBeNull();
    expect(m.digest).toBe("");
    expect(m.recentActions).toHaveLength(0);
  });

  it("sets active project", () => {
    useWorkingMemory.getState().setProject({
      id: "proj_1",
      brief: "8-scene Ghibli storyboard",
      totalScenes: 8,
      completedScenes: 5,
      sceneList: [
        { index: 0, title: "Hill Top", status: "done", refId: "img-1" },
        { index: 1, title: "First Rush", status: "done", refId: "img-2" },
        { index: 2, title: "Market", status: "pending", refId: undefined },
      ],
      styleGuide: { style: "Ghibli watercolor", palette: "warm amber", characters: "girl with skateboard" },
    });
    const m = useWorkingMemory.getState();
    expect(m.project?.id).toBe("proj_1");
    expect(m.project?.completedScenes).toBe(5);
    expect(m.project?.sceneList).toHaveLength(3);
  });

  it("records actions and keeps last 5", () => {
    const mem = useWorkingMemory.getState();
    for (let i = 0; i < 7; i++) {
      mem.recordAction({ tool: "create_media", summary: `batch ${i}`, outcome: `${i + 1} created`, success: true });
    }
    expect(useWorkingMemory.getState().recentActions).toHaveLength(5);
    expect(useWorkingMemory.getState().recentActions[0].summary).toBe("batch 2");
  });

  it("appends to digest and keeps under 200 words", () => {
    const mem = useWorkingMemory.getState();
    mem.appendDigest("User asked for 8 Ghibli scenes.");
    mem.appendDigest("Generated all 8 with flux-dev.");
    expect(useWorkingMemory.getState().digest).toContain("Ghibli");
    expect(useWorkingMemory.getState().digest).toContain("flux-dev");
  });

  it("truncates digest at 200 words", () => {
    const mem = useWorkingMemory.getState();
    mem.appendDigest("word ".repeat(250));
    const wordCount = useWorkingMemory.getState().digest.split(/\s+/).filter(Boolean).length;
    expect(wordCount).toBeLessThanOrEqual(200);
  });

  it("updates preferences", () => {
    const mem = useWorkingMemory.getState();
    mem.updatePreference("preferredModel", "flux-dev");
    expect(useWorkingMemory.getState().preferences.preferredModel).toBe("flux-dev");
  });

  it("reset clears everything", () => {
    const mem = useWorkingMemory.getState();
    mem.setProject({ id: "p1", brief: "test", totalScenes: 1, completedScenes: 0, sceneList: [], styleGuide: null });
    mem.appendDigest("something");
    mem.recordAction({ tool: "t", summary: "s", outcome: "o", success: true });
    mem.updatePreference("k", "v");
    mem.reset();
    const m = useWorkingMemory.getState();
    expect(m.project).toBeNull();
    expect(m.digest).toBe("");
    expect(m.recentActions).toHaveLength(0);
    expect(Object.keys(m.preferences)).toHaveLength(0);
  });
});

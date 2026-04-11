import { describe, it, expect } from "vitest";
import { buildAgentContext } from "@/lib/agents/context-builder";
import type { Intent } from "@/lib/agents/intent";
import type { ProjectSnapshot } from "@/lib/agents/working-memory";

const mockProject: ProjectSnapshot = {
  id: "proj_1",
  brief: "8-scene Ghibli storyboard with skateboard girl",
  totalScenes: 8,
  completedScenes: 5,
  sceneList: [
    { index: 0, title: "Hill Top", status: "done", refId: "img-1" },
    { index: 1, title: "First Rush", status: "done", refId: "img-2" },
    { index: 2, title: "Market", status: "done", refId: "img-3" },
    { index: 3, title: "Bridge", status: "done", refId: "img-4" },
    { index: 4, title: "Alley", status: "done", refId: "img-5" },
    { index: 5, title: "Square", status: "pending", refId: undefined },
    { index: 6, title: "Orchard", status: "pending", refId: undefined },
    { index: 7, title: "Hilltop Return", status: "pending", refId: undefined },
  ],
  styleGuide: { style: "Ghibli watercolor", palette: "warm amber", characters: "girl ~10 with skateboard" },
};

describe("Context Builder", () => {
  it("builds minimal context for simple create", () => {
    const ctx = buildAgentContext(
      { type: "none" },
      { project: null, digest: "", recentActions: [], preferences: {} }
    );
    expect(ctx).toContain("creative partner");
    expect(ctx.length).toBeLessThan(3000);
  });

  it("includes project state for continue intent", () => {
    const ctx = buildAgentContext(
      { type: "continue" },
      { project: mockProject, digest: "", recentActions: [], preferences: {} }
    );
    expect(ctx).toContain("project_generate");
    expect(ctx).toContain("proj_1");
    expect(ctx).toContain("5/8");
  });

  it("includes scene details for adjust intent", () => {
    const ctx = buildAgentContext(
      { type: "adjust_scene", sceneHint: "3", feedback: "too dark" },
      { project: mockProject, digest: "", recentActions: [], preferences: {} }
    );
    expect(ctx).toContain("project_iterate");
    expect(ctx).toContain("too dark");
  });

  it("includes style for add_scenes intent", () => {
    const ctx = buildAgentContext(
      { type: "add_scenes", count: 4 },
      { project: mockProject, digest: "", recentActions: [], preferences: {} }
    );
    expect(ctx).toContain("create_media");
    expect(ctx).toContain("Ghibli watercolor");
  });

  it("includes new_project routing", () => {
    const ctx = buildAgentContext(
      { type: "new_project" },
      { project: null, digest: "", recentActions: [], preferences: {} }
    );
    expect(ctx).toContain("project_create");
    expect(ctx).toContain("UNDER 20 WORDS");
  });

  it("includes digest when present", () => {
    const ctx = buildAgentContext(
      { type: "none" },
      { project: null, digest: "User created 8 Ghibli scenes. Loved the style.", recentActions: [], preferences: {} }
    );
    expect(ctx).toContain("Ghibli scenes");
  });

  it("includes recent actions", () => {
    const ctx = buildAgentContext(
      { type: "none" },
      {
        project: null, digest: "",
        recentActions: [{ tool: "create_media", summary: "5 scenes", outcome: "5 created", success: true, timestamp: Date.now() }],
        preferences: {},
      }
    );
    expect(ctx).toContain("5 created");
  });

  it("stays under 3000 chars even with full context", () => {
    const ctx = buildAgentContext(
      { type: "continue" },
      {
        project: mockProject,
        digest: "word ".repeat(100),
        recentActions: Array(5).fill({ tool: "create_media", summary: "batch", outcome: "done", success: true, timestamp: Date.now() }),
        preferences: { preferredModel: "flux-dev", styleNote: "warm colors" },
      }
    );
    expect(ctx.length).toBeLessThan(3000);
  });

  it("includes general routing for none intent", () => {
    const ctx = buildAgentContext(
      { type: "none" },
      { project: null, digest: "", recentActions: [], preferences: {} }
    );
    expect(ctx).toContain("Routing");
    expect(ctx).toContain("create_media");
  });

  it("includes style correction context", () => {
    const ctx = buildAgentContext(
      { type: "style_correction", feedback: "use anime style" },
      { project: mockProject, digest: "", recentActions: [], preferences: {} }
    );
    expect(ctx).toContain("use anime style");
    expect(ctx).toContain("Ghibli watercolor"); // current style shown
  });

  it("includes status with project info", () => {
    const ctx = buildAgentContext(
      { type: "status" },
      { project: mockProject, digest: "", recentActions: [], preferences: {} }
    );
    expect(ctx).toContain("5/8");
    expect(ctx).toContain("project_generate");
  });
});

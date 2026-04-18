import { describe, it, expect, beforeEach } from "vitest";
import { useProjectStore } from "@/lib/projects/store";
import { projectCreateTool, projectGenerateTool, projectIterateTool, projectStatusTool } from "@/lib/tools/project-tools";
import { initializeTools, clearTools, listTools } from "@/lib/tools";

describe("Project Store", () => {
  beforeEach(() => {
    useProjectStore.getState().clearProjects();
  });

  it("creates a project with scenes", () => {
    const project = useProjectStore.getState().createProject(
      "9-scene BYD ad",
      [
        { index: 0, title: "Hero", description: "Mountain shot", prompt: "car on mountain", mediaType: "image", action: "generate" },
        { index: 1, title: "Charge", description: "Home charging", prompt: "electric car charging", mediaType: "image", action: "generate" },
        { index: 2, title: "Interior", description: "Cabin tech", prompt: "car interior tech", mediaType: "image", action: "generate" },
      ]
    );
    expect(project.id).toMatch(/^\w+[-_]/); // friendly name prefix
    expect(project.scenes).toHaveLength(3);
    expect(project.scenes[0].status).toBe("pending");
    expect(project.status).toBe("planning");
    expect(project.brief).toBe("9-scene BYD ad");
  });

  it("creates project with style guide", () => {
    const project = useProjectStore.getState().createProject(
      "Ghibli storyboard",
      [{ index: 0, title: "S1", description: "test", prompt: "forest", mediaType: "image", action: "generate" }],
      { visualStyle: "ghibli", colorPalette: "pastels", mood: "dreamy", promptPrefix: "ghibli style, ", promptSuffix: ", warm light" }
    );
    expect(project.styleGuide?.promptPrefix).toBe("ghibli style, ");
    expect(project.styleGuide?.promptSuffix).toBe(", warm light");
  });

  it("tracks active project", () => {
    const p1 = useProjectStore.getState().createProject("p1", [
      { index: 0, title: "S1", description: "t", prompt: "t", mediaType: "image", action: "generate" },
    ]);
    expect(useProjectStore.getState().activeProjectId).toBe(p1.id);
    expect(useProjectStore.getState().getActiveProject()?.id).toBe(p1.id);
  });

  it("getNextBatch returns pending scenes up to batchSize", () => {
    const project = useProjectStore.getState().createProject(
      "test",
      Array.from({ length: 8 }, (_, i) => ({
        index: i, title: `S${i}`, description: "t", prompt: `scene ${i}`, mediaType: "image" as const, action: "generate" as const,
      }))
    );
    const batch = useProjectStore.getState().getNextBatch(project.id);
    expect(batch).toHaveLength(5); // default batchSize
    expect(batch[0].index).toBe(0);
    expect(batch[4].index).toBe(4);
  });

  it("updates scene status and cardRefId", () => {
    const project = useProjectStore.getState().createProject("test", [
      { index: 0, title: "S1", description: "t", prompt: "t", mediaType: "image", action: "generate" },
    ]);
    useProjectStore.getState().updateSceneStatus(project.id, 0, "done", "card_123");
    const updated = useProjectStore.getState().getProject(project.id)!;
    expect(updated.scenes[0].status).toBe("done");
    expect(updated.scenes[0].cardRefId).toBe("card_123");
    expect(updated.scenes[0].iterations).toBe(1);
  });

  it("rejects scenes and marks for regeneration", () => {
    const project = useProjectStore.getState().createProject("test", [
      { index: 0, title: "S1", description: "t", prompt: "t", mediaType: "image", action: "generate" },
      { index: 1, title: "S2", description: "t", prompt: "t", mediaType: "image", action: "generate" },
    ]);
    // Mark both as done first
    useProjectStore.getState().updateSceneStatus(project.id, 0, "done", "c1");
    useProjectStore.getState().updateSceneStatus(project.id, 1, "done", "c2");

    // Reject scene 1
    useProjectStore.getState().rejectScenes(project.id, [1], "needs more drama");
    const updated = useProjectStore.getState().getProject(project.id)!;
    expect(updated.scenes[0].status).toBe("done"); // preserved
    expect(updated.scenes[1].status).toBe("regenerating");
    expect(updated.scenes[1].feedback).toBe("needs more drama");
    expect(updated.status).toBe("iterating");
  });

  it("isProjectComplete checks all scenes done", () => {
    const project = useProjectStore.getState().createProject("test", [
      { index: 0, title: "S1", description: "t", prompt: "t", mediaType: "image", action: "generate" },
      { index: 1, title: "S2", description: "t", prompt: "t", mediaType: "image", action: "generate" },
    ]);
    expect(useProjectStore.getState().isProjectComplete(project.id)).toBe(false);
    useProjectStore.getState().updateSceneStatus(project.id, 0, "done");
    expect(useProjectStore.getState().isProjectComplete(project.id)).toBe(false);
    useProjectStore.getState().updateSceneStatus(project.id, 1, "done");
    expect(useProjectStore.getState().isProjectComplete(project.id)).toBe(true);
  });
});

describe("Project Tools — Schema", () => {
  it("project_create has correct schema", () => {
    expect(projectCreateTool.name).toBe("project_create");
    expect(projectCreateTool.parameters.required).toContain("brief");
    expect(projectCreateTool.parameters.required).toContain("scenes");
  });

  it("project_generate requires project_id", () => {
    expect(projectGenerateTool.name).toBe("project_generate");
    expect(projectGenerateTool.parameters.required).toContain("project_id");
  });

  it("project_iterate requires project_id + scene_indices + feedback", () => {
    expect(projectIterateTool.name).toBe("project_iterate");
    expect(projectIterateTool.parameters.required).toContain("project_id");
    expect(projectIterateTool.parameters.required).toContain("scene_indices");
    expect(projectIterateTool.parameters.required).toContain("feedback");
  });

  it("project_status exists", () => {
    expect(projectStatusTool.name).toBe("project_status");
  });
});

describe("Project Tools — Execution", () => {
  beforeEach(() => {
    useProjectStore.getState().clearProjects();
    clearTools();
    initializeTools();
  });

  it("project_create creates project from input", async () => {
    const result = await projectCreateTool.execute({
      brief: "3-scene test storyboard",
      scenes: [
        { index: 0, title: "Scene 1", prompt: "a sunset", action: "generate" },
        { index: 1, title: "Scene 2", prompt: "a mountain", action: "generate" },
        { index: 2, title: "Scene 3", prompt: "an ocean", action: "generate" },
      ],
    });
    expect(result.success).toBe(true);
    expect(result.data.total_scenes).toBe(3);
    expect(result.data.batches_needed).toBe(1); // 3 scenes, batch size 5
    expect(result.data.project_id).toMatch(/^\w+[-_]/); // friendly name prefix

    const project = useProjectStore.getState().getProject(result.data.project_id);
    expect(project).toBeDefined();
    expect(project!.scenes).toHaveLength(3);
  });

  it("project_create with 9 scenes calculates 2 batches", async () => {
    const scenes = Array.from({ length: 9 }, (_, i) => ({
      index: i, title: `S${i + 1}`, prompt: `scene ${i + 1}`, action: "generate",
    }));
    const result = await projectCreateTool.execute({
      brief: "9-scene ad",
      scenes,
    });
    expect(result.data.batches_needed).toBe(2); // 9 / 5 = 2
  });

  it("project_status returns scene summary", async () => {
    const createResult = await projectCreateTool.execute({
      brief: "test",
      scenes: [
        { index: 0, title: "S1", prompt: "test", action: "generate" },
        { index: 1, title: "S2", prompt: "test", action: "generate" },
      ],
    });

    const status = await projectStatusTool.execute({ project_id: createResult.data.project_id });
    expect(status.success).toBe(true);
    expect(status.data.total).toBe(2);
    expect(status.data.done).toBe(0);
    expect(status.data.scenes).toHaveLength(2);
    expect(status.data.scenes[0].status).toBe("pending");
  });

  it("project_generate fails gracefully with no project", async () => {
    const result = await projectGenerateTool.execute({ project_id: "nonexistent" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });
});

describe("Tool Registry — Project Tools Registered", () => {
  beforeEach(() => {
    clearTools();
    initializeTools();
  });

  it("registers all 19+ tools including project tools", () => {
    const tools = listTools();
    const names = tools.map((t: { name: string }) => t.name);
    expect(names).toContain("project_create");
    expect(names).toContain("project_generate");
    expect(names).toContain("project_iterate");
    expect(names).toContain("project_status");
    expect(tools.length).toBeGreaterThanOrEqual(19);
  });
});

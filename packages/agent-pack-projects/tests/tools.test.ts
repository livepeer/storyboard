import { describe, it, expect } from "vitest";
import { ToolRegistry } from "@livepeer/agent";
import { ProjectStore } from "../src/store.js";
import { projectCreateTool } from "../src/tools/create.js";
import { projectIterateTool } from "../src/tools/iterate.js";
import { projectGenerateTool } from "../src/tools/generate.js";
import { projectStatusTool } from "../src/tools/status.js";
import { registerProjectsPack } from "../src/index.js";

function makeRegistry() {
  const tools = new ToolRegistry();
  const store = new ProjectStore();
  return { tools, store };
}

describe("project_create tool", () => {
  it("registers and produces a project_id when executed", async () => {
    const { tools, store } = makeRegistry();
    tools.register(projectCreateTool(store));
    const tool = tools.get("project_create")!;
    expect(tool).toBeDefined();
    const result = await tool.execute(
      {
        title: "My Film",
        scenes: [{ id: "s1", title: "Opening", prompt: "A misty forest at dawn" }],
      },
      {},
    );
    const parsed = JSON.parse(result);
    expect(parsed.project_id).toMatch(/^prj_/);
    expect(parsed.scene_count).toBe(1);
  });

  it("has mcp_exposed === false", () => {
    const { tools, store } = makeRegistry();
    tools.register(projectCreateTool(store));
    expect(tools.get("project_create")!.mcp_exposed).toBe(false);
  });
});

describe("project_iterate tool", () => {
  it("updates scene status to in_progress", async () => {
    const { tools, store } = makeRegistry();
    tools.register(projectCreateTool(store));
    tools.register(projectIterateTool(store));

    const createResult = JSON.parse(
      await tools.get("project_create")!.execute(
        { title: "p", scenes: [{ id: "s1", title: "S1", prompt: "original" }] },
        {},
      ),
    );

    const result = JSON.parse(
      await tools.get("project_iterate")!.execute(
        { project_id: createResult.project_id, scene_id: "s1", new_prompt: "updated prompt" },
        {},
      ),
    );

    expect(result.ok).toBe(true);
    expect(result.scene.status).toBe("in_progress");
    expect(result.scene.prompt).toBe("updated prompt");
  });
});

describe("project_generate tool", () => {
  it("transitions all scenes to done", async () => {
    const { tools, store } = makeRegistry();
    tools.register(projectCreateTool(store));
    tools.register(projectGenerateTool(store));

    const createResult = JSON.parse(
      await tools.get("project_create")!.execute(
        {
          title: "p",
          scenes: [
            { id: "s1", title: "S1", prompt: "scene one" },
            { id: "s2", title: "S2", prompt: "scene two" },
          ],
        },
        {},
      ),
    );

    const result = JSON.parse(
      await tools.get("project_generate")!.execute(
        { project_id: createResult.project_id },
        {},
      ),
    );

    expect(result.generated).toBe(2);
    expect(result.failed).toBe(0);
    // Verify store state
    const project = store.get(createResult.project_id)!;
    expect(project.scenes.every((s) => s.status === "done")).toBe(true);
  });
});

describe("project_status tool", () => {
  it("returns counts by status", async () => {
    const { tools, store } = makeRegistry();
    tools.register(projectCreateTool(store));
    tools.register(projectStatusTool(store));

    const createResult = JSON.parse(
      await tools.get("project_create")!.execute(
        {
          title: "multi",
          scenes: [
            { id: "s1", title: "S1", prompt: "p1" },
            { id: "s2", title: "S2", prompt: "p2", status: "done" },
            { id: "s3", title: "S3", prompt: "p3", status: "failed" },
          ],
        },
        {},
      ),
    );

    const result = JSON.parse(
      await tools.get("project_status")!.execute(
        { project_id: createResult.project_id },
        {},
      ),
    );

    expect(result.title).toBe("multi");
    expect(result.scene_count).toBe(3);
    expect(result.by_status.pending).toBe(1);
    expect(result.by_status.done).toBe(1);
    expect(result.by_status.failed).toBe(1);
  });
});

describe("registerProjectsPack", () => {
  it("registers all 4 tools into a shared ToolRegistry", () => {
    const tools = new ToolRegistry();
    registerProjectsPack({ tools });
    expect(tools.get("project_create")).toBeDefined();
    expect(tools.get("project_iterate")).toBeDefined();
    expect(tools.get("project_generate")).toBeDefined();
    expect(tools.get("project_status")).toBeDefined();
  });

  it("[INV-7] none of the project pack tools are mcp_exposed", () => {
    const tools = new ToolRegistry();
    registerProjectsPack({ tools });
    const exposed = tools.mcpExposed();
    expect(exposed).toHaveLength(0);
  });
});

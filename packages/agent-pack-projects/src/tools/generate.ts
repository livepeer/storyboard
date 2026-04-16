import type { ToolDefinition } from "@livepeer/agent";
import type { ProjectStore } from "../store.js";

export function projectGenerateTool(store: ProjectStore): ToolDefinition {
  return {
    name: "project_generate",
    description: "Kick off generation for all pending scenes in a project",
    mcp_exposed: false,
    parameters: {
      type: "object",
      required: ["project_id"],
      properties: {
        project_id: { type: "string", description: "The project ID to generate" },
      },
    },
    async execute(args, _ctx) {
      // TODO (Phase 13): Replace stub with real inference calls via SDK client.
      // For each scene, call sdkClient.inference({ capability, prompt }) and
      // update scene with { status: "done", url: result.url }.
      const { project_id } = args as { project_id: string };
      const project = store.get(project_id);
      if (!project) throw new Error(`Unknown project: ${project_id}`);

      let generated = 0;
      let failed = 0;
      for (const scene of project.scenes) {
        if (scene.status === "done") continue;
        // Stub: transition to in_progress then done
        store.updateScene(project_id, scene.id, { status: "in_progress" });
        // TODO (Phase 13): await sdkClient.inference(...)
        store.updateScene(project_id, scene.id, { status: "done" });
        generated++;
      }

      return JSON.stringify({
        project_id,
        generated,
        failed,
        total: project.scenes.length,
      });
    },
  };
}

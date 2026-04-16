import type { ToolDefinition } from "@livepeer/agent";
import type { ProjectStore } from "../store.js";

export function projectStatusTool(store: ProjectStore): ToolDefinition {
  return {
    name: "project_status",
    description: "Get status summary for a project: scene counts by status",
    mcp_exposed: false,
    parameters: {
      type: "object",
      required: ["project_id"],
      properties: {
        project_id: { type: "string", description: "The project ID" },
      },
    },
    async execute(args, _ctx) {
      // TODO (Phase 13): Optionally include per-scene URLs once inference is wired
      const { project_id } = args as { project_id: string };
      const project = store.get(project_id);
      if (!project) throw new Error(`Unknown project: ${project_id}`);

      const by_status = { pending: 0, in_progress: 0, done: 0, failed: 0 };
      for (const scene of project.scenes) {
        const s = (scene.status ?? "pending") as keyof typeof by_status;
        if (s in by_status) by_status[s]++;
      }

      return JSON.stringify({
        project_id,
        title: project.title,
        scene_count: project.scenes.length,
        by_status,
      });
    },
  };
}

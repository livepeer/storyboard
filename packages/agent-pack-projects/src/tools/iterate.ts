import type { ToolDefinition } from "@livepeer/agent";
import type { ProjectStore } from "../store.js";

export function projectIterateTool(store: ProjectStore): ToolDefinition {
  return {
    name: "project_iterate",
    description: "Update a specific scene's prompt and reset it to in_progress status for regeneration",
    mcp_exposed: false,
    parameters: {
      type: "object",
      required: ["project_id", "scene_id"],
      properties: {
        project_id: { type: "string", description: "The project ID" },
        scene_id: { type: "string", description: "The scene ID to iterate on" },
        new_prompt: { type: "string", description: "Optional new prompt for the scene" },
      },
    },
    async execute(args, _ctx) {
      // TODO (Phase 13): After updating the scene, trigger re-inference via SDK client
      const { project_id, scene_id, new_prompt } = args as {
        project_id: string;
        scene_id: string;
        new_prompt?: string;
      };
      const patch: Record<string, unknown> = { status: "in_progress" };
      if (new_prompt !== undefined) patch.prompt = new_prompt;
      store.updateScene(project_id, scene_id, patch);
      const project = store.get(project_id);
      const scene = project?.scenes.find((s) => s.id === scene_id);
      return JSON.stringify({ ok: true, scene });
    },
  };
}

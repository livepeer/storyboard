import type { ToolDefinition } from "@livepeer/agent";
import type { ProjectStore, Scene, ProjectStyle } from "../store.js";

export function projectCreateTool(store: ProjectStore): ToolDefinition {
  return {
    name: "project_create",
    description: "Create a multi-scene project from a structured brief",
    mcp_exposed: false,
    parameters: {
      type: "object",
      required: ["title", "scenes"],
      properties: {
        title: { type: "string", description: "Project title" },
        scenes: {
          type: "array",
          description: "Array of scenes with id, title, prompt",
          items: {
            type: "object",
            required: ["id", "title", "prompt"],
            properties: {
              id: { type: "string" },
              title: { type: "string" },
              prompt: { type: "string" },
              capability: { type: "string" },
            },
          },
        },
        style: {
          type: "object",
          description: "Optional style guide (visual_style, color_palette, mood, prompt_prefix)",
          properties: {
            visual_style: { type: "string" },
            color_palette: { type: "string" },
            mood: { type: "string" },
            prompt_prefix: { type: "string" },
          },
        },
      },
    },
    async execute(args, _ctx) {
      const { title, scenes, style } = args as {
        title: string;
        scenes: Scene[];
        style?: ProjectStyle;
      };
      const project = store.create({ title, scenes, style: style ?? {} });
      return JSON.stringify({ project_id: project.id, scene_count: scenes.length });
    },
  };
}

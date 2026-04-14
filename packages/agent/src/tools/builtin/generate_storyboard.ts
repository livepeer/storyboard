import type { ToolDefinition } from "../types.js";

export interface GenerateStoryboardArgs {
  brief: string;
  scene_count?: number;
}

export const generateStoryboardTool: ToolDefinition<GenerateStoryboardArgs, unknown> = {
  name: "livepeer.generate_storyboard",
  description:
    "Generate a complete storyboard from a brief — extracts scenes, enriches prompts, and creates media for each scene.",
  mcp_exposed: true,
  tier: 1,
  parameters: {
    type: "object",
    properties: {
      brief: { type: "string", description: "Storyboard brief or concept description" },
      scene_count: { type: "number", description: "Target number of scenes (optional)" },
    },
    required: ["brief"],
  },
  async execute(_args, _ctx) {
    return "generate_storyboard: not yet implemented (Phase 4 wires it)";
  },
};

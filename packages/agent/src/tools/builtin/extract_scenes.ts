import type { ToolDefinition } from "../types.js";

export interface ExtractScenesArgs {
  brief: string;
}

export const extractScenesTool: ToolDefinition<ExtractScenesArgs, unknown> = {
  name: "livepeer.extract_scenes",
  description:
    "Parse a multi-scene storyboard brief into a structured list of scenes. The preprocessor handles this client-side without an LLM call.",
  mcp_exposed: true,
  tier: 0,
  parameters: {
    type: "object",
    properties: {
      brief: { type: "string", description: "Full storyboard brief text" },
    },
    required: ["brief"],
  },
  async execute(_args, _ctx) {
    return "extract_scenes: not yet implemented (Phase 4 wires it)";
  },
};

import type { ToolDefinition } from "../types.js";

export interface EnrichPromptArgs {
  prompt: string;
}

export const enrichPromptTool: ToolDefinition<EnrichPromptArgs, unknown> = {
  name: "livepeer.enrich_prompt",
  description:
    "Expand a short creative prompt into a richly detailed prompt suitable for image or video generation.",
  mcp_exposed: true,
  tier: 1,
  parameters: {
    type: "object",
    properties: {
      prompt: { type: "string", description: "Short prompt to expand" },
    },
    required: ["prompt"],
  },
  async execute(_args, _ctx) {
    return "enrich_prompt: not yet implemented (Phase 4 wires it)";
  },
};

import type { ToolDefinition } from "../types.js";

export interface GenSkillArgs {
  description: string;
}

export const genSkillTool: ToolDefinition<GenSkillArgs, unknown> = {
  name: "livepeer.gen_skill",
  description:
    "Generate a new skill pack from a natural language description. The skill is written to the skill library and can be applied via apply_skill_pack.",
  mcp_exposed: true,
  tier: 2,
  parameters: {
    type: "object",
    properties: {
      description: { type: "string", description: "Natural language description of the skill to generate" },
    },
    required: ["description"],
  },
  async execute(_args, _ctx) {
    return "gen_skill: not yet implemented (Phase 6 wires it)";
  },
};

import type { ToolDefinition } from "../types.js";

export interface ApplySkillPackArgs {
  pack_id: string;
}

export const applySkillPackTool: ToolDefinition<ApplySkillPackArgs, unknown> = {
  name: "livepeer.apply_skill_pack",
  description:
    "Apply a named skill pack to the current session, injecting its system prompt constraints into working memory.",
  mcp_exposed: true,
  tier: 0,
  parameters: {
    type: "object",
    properties: {
      pack_id: { type: "string", description: "Skill pack identifier to apply" },
    },
    required: ["pack_id"],
  },
  async execute(_args, _ctx) {
    return "apply_skill_pack: not yet implemented (Phase 6 wires it)";
  },
};

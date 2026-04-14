import type { ToolDefinition } from "../types.js";

export const listCapabilitiesTool: ToolDefinition<Record<string, never>, unknown> = {
  name: "livepeer.list_capabilities",
  description:
    "List available AI capabilities (models) on the connected SDK service.",
  mcp_exposed: true,
  tier: 0,
  parameters: {
    type: "object",
    properties: {},
  },
  async execute(_args, _ctx) {
    return "list_capabilities: not yet implemented (Phase 4 wires it)";
  },
};

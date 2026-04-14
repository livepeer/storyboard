import type { ToolDefinition } from "../types.js";

export interface CreateMediaArgs {
  prompt: string;
  capability?: string;
  source_url?: string;
}

export interface CreateMediaContext {
  /** Filled in by Phase 5 (capabilities client). */
  sdkClient?: unknown;
}

export const createMediaTool: ToolDefinition<CreateMediaArgs, CreateMediaContext> = {
  name: "livepeer.create_media",
  description:
    "Generate a single image, video, or audio artifact from a prompt. The capability is auto-resolved from the prompt unless you pass capability explicitly.",
  mcp_exposed: true,
  tier: 1,
  parameters: {
    type: "object",
    properties: {
      prompt: { type: "string", description: "Creative prompt for the artifact" },
      capability: { type: "string", description: "Optional explicit capability (e.g. 'flux-dev')" },
      source_url: { type: "string", description: "Optional source URL for image-to-X tasks" },
    },
    required: ["prompt"],
  },
  async execute(_args, _ctx) {
    return "create_media: not yet implemented (Phase 4 wires up the capabilities client)";
  },
};

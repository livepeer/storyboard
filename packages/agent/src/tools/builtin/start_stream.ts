import type { ToolDefinition } from "../types.js";

export interface StartStreamArgs {
  prompt: string;
  source?: string;
}

export const startStreamTool: ToolDefinition<StartStreamArgs, unknown> = {
  name: "livepeer.start_stream",
  description:
    "Start a live video-to-video stream with the given prompt. Optionally specify a source (webcam, image URL, video URL).",
  mcp_exposed: true,
  tier: 1,
  parameters: {
    type: "object",
    properties: {
      prompt: { type: "string", description: "Style or transformation prompt for the stream" },
      source: { type: "string", description: "Optional source type or URL (webcam, image, video)" },
    },
    required: ["prompt"],
  },
  async execute(_args, _ctx) {
    return "start_stream: not yet implemented (Phase 4 wires it)";
  },
};

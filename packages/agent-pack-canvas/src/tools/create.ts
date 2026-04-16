import type { ToolDefinition } from "@livepeer/agent";
import type { CanvasStore, CanvasCard } from "../store.js";

export function canvasCreateTool(store: CanvasStore): ToolDefinition {
  return {
    name: "canvas_create",
    description: "Add a new card to the canvas. Returns the created card.",
    mcp_exposed: false,
    parameters: {
      type: "object",
      required: ["id", "refId", "type"],
      properties: {
        id: { type: "string", description: "Unique card ID" },
        refId: { type: "string", description: "Reference ID (used by agents to refer to this card)" },
        type: {
          type: "string",
          enum: ["image", "video", "audio", "stream", "text"],
          description: "Card media type",
        },
        url: { type: "string", description: "Optional media URL" },
        x: { type: "number", description: "X position (default 0)" },
        y: { type: "number", description: "Y position (default 0)" },
        w: { type: "number", description: "Width (default 320)" },
        h: { type: "number", description: "Height (default 200)" },
        batchId: { type: "string", description: "Optional batch group ID" },
        meta: { type: "object", description: "Optional metadata" },
      },
    },
    async execute(args, _ctx) {
      const input = args as Partial<CanvasCard> & { id: string; refId: string; type: CanvasCard["type"] };
      const card: CanvasCard = {
        x: 0,
        y: 0,
        w: 320,
        h: 200,
        ...input,
      };
      store.add(card);
      return JSON.stringify(card);
    },
  };
}

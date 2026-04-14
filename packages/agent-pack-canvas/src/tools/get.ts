import type { ToolDefinition } from "@livepeer/agent";
import type { CanvasStore } from "../store.js";

export function canvasGetTool(store: CanvasStore): ToolDefinition {
  return {
    name: "canvas_get",
    description: "Get a canvas card by its ID or refId. Returns card metadata including URL, position, and type.",
    mcp_exposed: false,
    parameters: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string", description: "Card ID or refId to look up" },
      },
    },
    async execute(args, _ctx) {
      const { id } = args as { id: string };
      const card = store.get(id) ?? store.getByRefId(id);
      if (!card) throw new Error(`Card not found: ${id}`);
      return JSON.stringify(card);
    },
  };
}

import type { ToolDefinition } from "@livepeer/agent";
import type { CanvasStore } from "../store.js";

export function canvasRemoveTool(store: CanvasStore): ToolDefinition {
  return {
    name: "canvas_remove",
    description: "Remove a card from the canvas by its ID",
    mcp_exposed: false,
    parameters: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string", description: "Card ID to remove" },
      },
    },
    async execute(args, _ctx) {
      const { id } = args as { id: string };
      const removed = store.remove(id);
      return JSON.stringify({ ok: removed, id });
    },
  };
}

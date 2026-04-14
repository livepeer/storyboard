import type { ToolDefinition } from "@livepeer/agent";
import type { CanvasStore, CanvasCard } from "../store.js";

export function canvasUpdateTool(store: CanvasStore): ToolDefinition {
  return {
    name: "canvas_update",
    description: "Update properties of an existing canvas card (position, size, url, meta, etc.)",
    mcp_exposed: false,
    parameters: {
      type: "object",
      required: ["id"],
      properties: {
        id: { type: "string", description: "Card ID to update" },
        url: { type: "string" },
        x: { type: "number" },
        y: { type: "number" },
        w: { type: "number" },
        h: { type: "number" },
        batchId: { type: "string" },
        meta: { type: "object" },
      },
    },
    async execute(args, _ctx) {
      const { id, ...patch } = args as { id: string } & Partial<CanvasCard>;
      store.update(id, patch);
      const card = store.get(id)!;
      return JSON.stringify(card);
    },
  };
}

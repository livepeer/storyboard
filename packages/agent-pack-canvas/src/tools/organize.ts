import type { ToolDefinition } from "@livepeer/agent";
import type { CanvasStore } from "../store.js";
import { autoLayout, narrativeLayout } from "../layout.js";

export function canvasOrganizeTool(store: CanvasStore): ToolDefinition {
  return {
    name: "canvas_organize",
    description:
      "Arrange cards on the canvas. mode='auto' uses a grid layout grouped by batch; mode='narrative' places each batch on its own row.",
    mcp_exposed: false,
    parameters: {
      type: "object",
      required: ["mode"],
      properties: {
        mode: {
          type: "string",
          enum: ["auto", "narrative"],
          description: "Layout mode: 'auto' for grid, 'narrative' for one row per prompt batch",
        },
        cols: {
          type: "number",
          description: "Number of columns for 'auto' mode (default 4)",
        },
      },
    },
    async execute(args, _ctx) {
      const { mode, cols } = args as { mode: "auto" | "narrative"; cols?: number };
      if (mode === "narrative") {
        narrativeLayout(store);
      } else {
        autoLayout(store, cols ?? 4);
      }
      const cards = store.list();
      return JSON.stringify({ ok: true, mode, card_count: cards.length });
    },
  };
}

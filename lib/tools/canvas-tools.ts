import type { ToolDefinition } from "./types";
import { useCanvasStore } from "@/lib/canvas/store";
import type { CardType } from "@/lib/canvas/types";

/**
 * canvas_create — create a new card on the canvas.
 */
export const canvasCreateTool: ToolDefinition = {
  name: "canvas_create",
  description: "Create a new media card on the canvas.",
  parameters: {
    type: "object",
    properties: {
      type: {
        type: "string",
        enum: ["image", "video", "audio", "stream"],
        description: "Card media type",
      },
      title: {
        type: "string",
        description: "Card title",
      },
      ref_id: {
        type: "string",
        description: "Reference ID for linking cards",
      },
      url: {
        type: "string",
        description: "URL of the media content",
      },
    },
    required: ["type", "title"],
  },
  execute: async (input) => {
    const card = useCanvasStore.getState().addCard({
      type: input.type as CardType,
      title: input.title as string,
      refId: input.ref_id as string | undefined,
      url: input.url as string | undefined,
    });
    return {
      success: true,
      data: { id: card.id, refId: card.refId, type: card.type },
    };
  },
};

/**
 * canvas_update — update an existing card on the canvas.
 */
export const canvasUpdateTool: ToolDefinition = {
  name: "canvas_update",
  description: "Update properties of an existing canvas card.",
  parameters: {
    type: "object",
    properties: {
      id: {
        type: "string",
        description: "Card ID to update",
      },
      url: {
        type: "string",
        description: "New media URL",
      },
      title: {
        type: "string",
        description: "New title",
      },
      error: {
        type: "string",
        description: "Error message to display",
      },
    },
    required: ["id"],
  },
  execute: async (input) => {
    const { id, ...patch } = input;
    useCanvasStore.getState().updateCard(id as string, patch);
    return { success: true, data: { id } };
  },
};

/**
 * canvas_get — get current canvas state (cards and edges).
 */
export const canvasGetTool: ToolDefinition = {
  name: "canvas_get",
  description: "Get the current canvas state: cards and edges.",
  parameters: {
    type: "object",
    properties: {
      ref_id: {
        type: "string",
        description:
          "Optional: get a specific card by refId. Omit for all cards.",
      },
    },
  },
  execute: async (input) => {
    const state = useCanvasStore.getState();
    if (input.ref_id) {
      const card = state.cards.find((c) => c.refId === input.ref_id);
      if (!card) {
        return { success: false, error: `Card with refId "${input.ref_id}" not found` };
      }
      const edges = state.edges.filter(
        (e) => e.fromRefId === card.refId || e.toRefId === card.refId
      );
      return { success: true, data: { card, edges } };
    }
    return {
      success: true,
      data: {
        cards: state.cards.map((c) => ({
          id: c.id,
          refId: c.refId,
          type: c.type,
          title: c.title,
          url: c.url,
          error: c.error,
        })),
        edges: state.edges,
      },
    };
  },
};

/** All canvas tools */
export const canvasTools: ToolDefinition[] = [
  canvasCreateTool,
  canvasUpdateTool,
  canvasGetTool,
];

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
 * Token-efficient: ~10 tokens per card when returning all.
 */
export const canvasGetTool: ToolDefinition = {
  name: "canvas_get",
  description:
    "Get canvas state. Returns compact card summaries (~10 tokens each). Use to answer 'what's on my canvas?' or find cards by type/title.",
  parameters: {
    type: "object",
    properties: {
      ref_id: {
        type: "string",
        description: "Get a specific card by refId. Omit for all cards.",
      },
      filter_type: {
        type: "string",
        enum: ["image", "video", "audio", "stream"],
        description: "Filter cards by media type.",
      },
    },
  },
  execute: async (input) => {
    const state = useCanvasStore.getState();
    if (input.ref_id) {
      const card = state.cards.find((c) => c.refId === input.ref_id);
      if (!card) {
        return {
          success: false,
          error: `Card with refId "${input.ref_id}" not found`,
        };
      }
      const edges = state.edges.filter(
        (e) => e.fromRefId === card.refId || e.toRefId === card.refId
      );
      return { success: true, data: { card, edges } };
    }
    let cards = state.cards;
    if (input.filter_type) {
      cards = cards.filter((c) => c.type === input.filter_type);
    }
    // Include URLs so the agent can reference cards for restyle/combine/animate
    return {
      success: true,
      data: {
        total: state.cards.length,
        cards: cards.map((c) => ({
          refId: c.refId,
          type: c.type,
          title: c.title,
          url: c.url || undefined,
          error: c.error || undefined,
        })),
        edge_count: state.edges.length,
      },
    };
  },
};

/**
 * canvas_remove — remove cards from the canvas by refId or type filter.
 */
export const canvasRemoveTool: ToolDefinition = {
  name: "canvas_remove",
  description:
    "Remove cards from canvas. Specify ref_id for one card, or filter_type to remove all cards of a type.",
  parameters: {
    type: "object",
    properties: {
      ref_id: {
        type: "string",
        description: "Remove a specific card by refId.",
      },
      filter_type: {
        type: "string",
        enum: ["image", "video", "audio", "stream"],
        description: "Remove all cards of this media type.",
      },
    },
  },
  execute: async (input) => {
    const state = useCanvasStore.getState();
    const removed: string[] = [];

    if (input.ref_id) {
      const card = state.cards.find((c) => c.refId === input.ref_id);
      if (card) {
        useCanvasStore.getState().removeCard(card.id);
        removed.push(card.refId);
      } else {
        return {
          success: false,
          error: `Card "${input.ref_id}" not found`,
        };
      }
    } else if (input.filter_type) {
      const toRemove = state.cards.filter(
        (c) => c.type === input.filter_type
      );
      for (const card of toRemove) {
        useCanvasStore.getState().removeCard(card.id);
        removed.push(card.refId);
      }
    } else {
      return { success: false, error: "Provide ref_id or filter_type" };
    }

    return {
      success: true,
      data: { removed, count: removed.length },
    };
  },
};

/**
 * canvas_organize — auto-layout all cards using the layout agent.
 */
export const canvasOrganizeTool: ToolDefinition = {
  name: "canvas_organize",
  description: "Auto-organize all cards on the canvas using the best layout strategy. Optionally specify a mode: basic, narrative, episode, graphic-novel, ads-board, movie-board, balanced.",
  parameters: {
    type: "object",
    properties: {
      mode: {
        type: "string",
        description: "Layout mode (optional \u2014 auto-selects if omitted)",
        enum: ["basic", "narrative", "episode", "graphic-novel", "ads-board", "movie-board", "balanced"],
      },
    },
  },
  execute: async (input) => {
    const { organizeCanvas } = await import("@/lib/layout/agent");
    const { useCanvasStore } = await import("@/lib/canvas/store");
    const mode = (input.mode as string) || undefined;
    const positions = organizeCanvas(mode);
    useCanvasStore.getState().applyLayout(positions);
    const count = useCanvasStore.getState().cards.length;
    return { success: true, data: { organized: count, mode: mode || "auto", message: `${count} cards organized` } };
  },
};

/** All canvas tools */
export const canvasTools: ToolDefinition[] = [
  canvasCreateTool,
  canvasUpdateTool,
  canvasGetTool,
  canvasOrganizeTool,
  canvasRemoveTool,
];

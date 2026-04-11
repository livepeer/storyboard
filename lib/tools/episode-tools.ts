import type { ToolDefinition } from "./types";
import { useEpisodeStore } from "@/lib/episodes/store";
import { useCanvasStore } from "@/lib/canvas/store";

const episodeCreateTool: ToolDefinition = {
  name: "episode_create",
  description: "Group canvas cards into a named episode with its own creative context override.",
  parameters: {
    type: "object",
    properties: {
      name: { type: "string", description: "Episode name" },
      card_ref_ids: { type: "array", items: { type: "string" }, description: "Card refIds to include" },
      context: {
        type: "object",
        description: "Optional context override (only fields that differ from storyboard)",
        properties: {
          style: { type: "string" }, palette: { type: "string" }, characters: { type: "string" },
          setting: { type: "string" }, mood: { type: "string" }, rules: { type: "string" },
        },
      },
    },
    required: ["name", "card_ref_ids"],
  },
  execute: async (input) => {
    const name = input.name as string;
    const refIds = input.card_ref_ids as string[];
    const context = input.context as Record<string, string> | undefined;

    const cards = useCanvasStore.getState().cards;
    const cardIds: string[] = [];
    const notFound: string[] = [];
    for (const refId of refIds) {
      const card = cards.find((c) => c.refId === refId);
      if (card) cardIds.push(card.id);
      else notFound.push(refId);
    }
    if (cardIds.length === 0) {
      return { success: false, error: `No cards found for refIds: ${refIds.join(", ")}` };
    }

    const ep = useEpisodeStore.getState().createEpisode(name, cardIds, context);
    useEpisodeStore.getState().activateEpisode(ep.id);

    return {
      success: true,
      data: {
        episode_id: ep.id, name: ep.name, cards: cardIds.length, color: ep.color,
        not_found: notFound.length > 0 ? notFound : undefined,
      },
    };
  },
};

const episodeUpdateTool: ToolDefinition = {
  name: "episode_update",
  description: "Update an episode's name, context, or card membership.",
  parameters: {
    type: "object",
    properties: {
      episode_id: { type: "string", description: "Episode ID" },
      name: { type: "string", description: "New name" },
      add_cards: { type: "array", items: { type: "string" }, description: "Card refIds to add" },
      remove_cards: { type: "array", items: { type: "string" }, description: "Card refIds to remove" },
      context: {
        type: "object",
        description: "Context fields to update (merge)",
        properties: {
          style: { type: "string" }, palette: { type: "string" }, characters: { type: "string" },
          setting: { type: "string" }, mood: { type: "string" }, rules: { type: "string" },
        },
      },
    },
    required: ["episode_id"],
  },
  execute: async (input) => {
    const episodeId = input.episode_id as string;
    const store = useEpisodeStore.getState();
    const ep = store.getEpisode(episodeId);
    if (!ep) return { success: false, error: `Episode ${episodeId} not found` };

    if (input.name) store.updateEpisode(episodeId, { name: input.name as string });
    if (input.context) {
      const merged = { ...ep.context, ...(input.context as Record<string, string>) };
      store.updateEpisode(episodeId, { context: merged });
    }

    const cards = useCanvasStore.getState().cards;
    if (input.add_cards) {
      const ids = (input.add_cards as string[]).map((ref) => cards.find((c) => c.refId === ref)?.id).filter(Boolean) as string[];
      if (ids.length) store.addCards(episodeId, ids);
    }
    if (input.remove_cards) {
      const ids = (input.remove_cards as string[]).map((ref) => cards.find((c) => c.refId === ref)?.id).filter(Boolean) as string[];
      if (ids.length) store.removeCards(episodeId, ids);
    }

    const updated = store.getEpisode(episodeId)!;
    return { success: true, data: { episode_id: episodeId, name: updated.name, cards: updated.cardIds.length } };
  },
};

const episodeActivateTool: ToolDefinition = {
  name: "episode_activate",
  description: "Switch the active episode. Agent context changes to match. Pass empty/null for storyboard level.",
  parameters: {
    type: "object",
    properties: {
      episode_id: { type: "string", description: "Episode ID to activate, or omit for storyboard level" },
    },
  },
  execute: async (input) => {
    const id = (input.episode_id as string) || null;
    if (id) {
      const ep = useEpisodeStore.getState().getEpisode(id);
      if (!ep) return { success: false, error: `Episode ${id} not found` };
    }
    useEpisodeStore.getState().activateEpisode(id);
    const active = useEpisodeStore.getState().getActiveEpisode();
    return {
      success: true,
      data: {
        active_episode: active ? { id: active.id, name: active.name } : null,
        message: active ? `Switched to "${active.name}"` : "Switched to storyboard level",
      },
    };
  },
};

const episodeListTool: ToolDefinition = {
  name: "episode_list",
  description: "List all episodes with card counts and context summaries.",
  parameters: { type: "object", properties: {} },
  execute: async () => {
    const { episodes, activeEpisodeId } = useEpisodeStore.getState();
    return {
      success: true,
      data: {
        episodes: episodes.map((ep) => ({
          id: ep.id, name: ep.name, cards: ep.cardIds.length,
          active: ep.id === activeEpisodeId,
          context: Object.entries(ep.context).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`).join(", ") || "(inherits storyboard)",
        })),
        total: episodes.length,
      },
    };
  },
};

export const episodeTools: ToolDefinition[] = [episodeCreateTool, episodeUpdateTool, episodeActivateTool, episodeListTool];

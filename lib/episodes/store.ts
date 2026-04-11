import { create } from "zustand";
import type { Episode } from "./types";
import type { CreativeContext } from "@/lib/agents/session-context";

const EPISODE_COLORS = [
  "#8b5cf6", "#06b6d4", "#f59e0b", "#10b981",
  "#ec4899", "#6366f1", "#84cc16", "#f97316",
];

let colorIndex = 0;

interface EpisodeState {
  episodes: Episode[];
  activeEpisodeId: string | null;

  createEpisode: (name: string, cardIds: string[], context?: Partial<CreativeContext>) => Episode;
  updateEpisode: (id: string, patch: Partial<Pick<Episode, "name" | "context" | "color">>) => void;
  removeEpisode: (id: string) => void;
  activateEpisode: (id: string | null) => void;
  addCards: (episodeId: string, cardIds: string[]) => void;
  removeCards: (episodeId: string, cardIds: string[]) => void;
  getEpisode: (id: string) => Episode | undefined;
  getActiveEpisode: () => Episode | undefined;
  getEpisodeForCard: (cardId: string) => Episode | undefined;
  getEffectiveContext: (episodeId: string, storyboardCtx: CreativeContext) => CreativeContext | null;
}

export const useEpisodeStore = create<EpisodeState>((set, get) => ({
  episodes: [],
  activeEpisodeId: null,

  createEpisode: (name, cardIds, context) => {
    const ep: Episode = {
      id: `ep_${Date.now()}`,
      name,
      cardIds: [...cardIds],
      context: context || {},
      color: EPISODE_COLORS[colorIndex++ % EPISODE_COLORS.length],
      createdAt: Date.now(),
    };
    set((s) => ({ episodes: [...s.episodes, ep] }));
    return ep;
  },

  updateEpisode: (id, patch) =>
    set((s) => ({
      episodes: s.episodes.map((ep) => ep.id === id ? { ...ep, ...patch } : ep),
    })),

  removeEpisode: (id) =>
    set((s) => ({
      episodes: s.episodes.filter((ep) => ep.id !== id),
      activeEpisodeId: s.activeEpisodeId === id ? null : s.activeEpisodeId,
    })),

  activateEpisode: (id) => set({ activeEpisodeId: id }),

  addCards: (episodeId, cardIds) =>
    set((s) => ({
      episodes: s.episodes.map((ep) =>
        ep.id === episodeId
          ? { ...ep, cardIds: [...new Set([...ep.cardIds, ...cardIds])] }
          : ep
      ),
    })),

  removeCards: (episodeId, cardIds) => {
    const toRemove = new Set(cardIds);
    set((s) => ({
      episodes: s.episodes.map((ep) =>
        ep.id === episodeId
          ? { ...ep, cardIds: ep.cardIds.filter((id) => !toRemove.has(id)) }
          : ep
      ),
    }));
  },

  getEpisode: (id) => get().episodes.find((ep) => ep.id === id),

  getActiveEpisode: () => {
    const { activeEpisodeId, episodes } = get();
    return activeEpisodeId ? episodes.find((ep) => ep.id === activeEpisodeId) : undefined;
  },

  getEpisodeForCard: (cardId) =>
    get().episodes.find((ep) => ep.cardIds.includes(cardId)),

  getEffectiveContext: (episodeId, storyboardCtx) => {
    const ep = get().getEpisode(episodeId);
    if (!ep) return storyboardCtx;
    return {
      style: ep.context.style || storyboardCtx.style,
      palette: ep.context.palette || storyboardCtx.palette,
      characters: ep.context.characters || storyboardCtx.characters,
      setting: ep.context.setting || storyboardCtx.setting,
      rules: ep.context.rules || storyboardCtx.rules,
      mood: ep.context.mood || storyboardCtx.mood,
    };
  },
}));

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Episode, Epic, Story } from "./types";
import type { CreativeContext } from "@/lib/agents/session-context";

const EPISODE_COLORS = [
  "#8b5cf6", "#06b6d4", "#f59e0b", "#10b981",
  "#ec4899", "#6366f1", "#84cc16", "#f97316",
];
const EPIC_COLORS = ["#3b82f6", "#ef4444", "#14b8a6", "#f59e0b", "#a855f7", "#06b6d4"];
const STORY_COLORS = ["#fbbf24", "#f472b6", "#34d399", "#818cf8", "#fb923c"];

let colorIndex = 0;
let epicColorIndex = 0;
let storyColorIndex = 0;

interface EpisodeState {
  episodes: Episode[];
  epics: Epic[];
  stories: Story[];
  activeEpisodeId: string | null;

  // Episodes
  createEpisode: (name: string, cardIds: string[], context?: Partial<CreativeContext>) => Episode;
  updateEpisode: (id: string, patch: Partial<Pick<Episode, "name" | "context" | "color" | "epicId">>) => void;
  removeEpisode: (id: string) => void;
  activateEpisode: (id: string | null) => void;
  addCards: (episodeId: string, cardIds: string[]) => void;
  removeCards: (episodeId: string, cardIds: string[]) => void;
  getEpisode: (id: string) => Episode | undefined;
  getActiveEpisode: () => Episode | undefined;
  getEpisodeForCard: (cardId: string) => Episode | undefined;
  getEffectiveContext: (episodeId: string, storyboardCtx: CreativeContext) => CreativeContext | null;

  // Epics
  createEpic: (name: string, episodeIds: string[]) => Epic;
  removeEpic: (id: string) => void;
  addEpisodesToEpic: (epicId: string, episodeIds: string[]) => void;
  removeEpisodesFromEpic: (epicId: string, episodeIds: string[]) => void;
  getEpic: (id: string) => Epic | undefined;
  getEpicForEpisode: (episodeId: string) => Epic | undefined;

  // Stories
  createStory: (name: string, epicIds: string[]) => Story;
  removeStory: (id: string) => void;
  addEpicsToStory: (storyId: string, epicIds: string[]) => void;
  removeEpicsFromStory: (storyId: string, epicIds: string[]) => void;
  getStory: (id: string) => Story | undefined;
  getStoryForEpic: (epicId: string) => Story | undefined;
}

export const useEpisodeStore = create<EpisodeState>()(
  persist(
    (set, get) => ({
  episodes: [],
  epics: [],
  stories: [],
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

  // ── Epics ──
  createEpic: (name, episodeIds) => {
    const epic: Epic = {
      id: `epic_${Date.now()}`,
      name,
      episodeIds: [...episodeIds],
      color: EPIC_COLORS[epicColorIndex++ % EPIC_COLORS.length],
      createdAt: Date.now(),
    };
    // Link episodes to this epic
    set((s) => ({
      epics: [...s.epics, epic],
      episodes: s.episodes.map((ep) =>
        episodeIds.includes(ep.id) ? { ...ep, epicId: epic.id } : ep
      ),
    }));
    return epic;
  },

  removeEpic: (id) =>
    set((s) => ({
      epics: s.epics.filter((e) => e.id !== id),
      episodes: s.episodes.map((ep) => ep.epicId === id ? { ...ep, epicId: undefined } : ep),
    })),

  addEpisodesToEpic: (epicId, episodeIds) =>
    set((s) => ({
      epics: s.epics.map((e) => e.id === epicId
        ? { ...e, episodeIds: [...new Set([...e.episodeIds, ...episodeIds])] } : e),
      episodes: s.episodes.map((ep) => episodeIds.includes(ep.id) ? { ...ep, epicId } : ep),
    })),

  removeEpisodesFromEpic: (epicId, episodeIds) => {
    const toRemove = new Set(episodeIds);
    set((s) => ({
      epics: s.epics.map((e) => e.id === epicId
        ? { ...e, episodeIds: e.episodeIds.filter((id) => !toRemove.has(id)) } : e),
      episodes: s.episodes.map((ep) => toRemove.has(ep.id) && ep.epicId === epicId ? { ...ep, epicId: undefined } : ep),
    }));
  },

  getEpic: (id) => get().epics.find((e) => e.id === id),
  getEpicForEpisode: (episodeId) => get().epics.find((e) => e.episodeIds.includes(episodeId)),

  // ── Stories ──
  createStory: (name, epicIds) => {
    const story: Story = {
      id: `story_${Date.now()}`,
      name,
      epicIds: [...epicIds],
      color: STORY_COLORS[storyColorIndex++ % STORY_COLORS.length],
      createdAt: Date.now(),
    };
    set((s) => ({
      stories: [...s.stories, story],
      epics: s.epics.map((e) => epicIds.includes(e.id) ? { ...e, storyId: story.id } : e),
    }));
    return story;
  },

  removeStory: (id) =>
    set((s) => ({
      stories: s.stories.filter((st) => st.id !== id),
      epics: s.epics.map((e) => e.storyId === id ? { ...e, storyId: undefined } : e),
    })),

  addEpicsToStory: (storyId, epicIds) =>
    set((s) => ({
      stories: s.stories.map((st) => st.id === storyId
        ? { ...st, epicIds: [...new Set([...st.epicIds, ...epicIds])] } : st),
      epics: s.epics.map((e) => epicIds.includes(e.id) ? { ...e, storyId } : e),
    })),

  removeEpicsFromStory: (storyId, epicIds) => {
    const toRemove = new Set(epicIds);
    set((s) => ({
      stories: s.stories.map((st) => st.id === storyId
        ? { ...st, epicIds: st.epicIds.filter((id) => !toRemove.has(id)) } : st),
      epics: s.epics.map((e) => toRemove.has(e.id) && e.storyId === storyId ? { ...e, storyId: undefined } : e),
    }));
  },

  getStory: (id) => get().stories.find((st) => st.id === id),
  getStoryForEpic: (epicId) => get().stories.find((st) => st.epicIds.includes(epicId)),
}),
    {
      name: "storyboard_episodes",
      version: 2,
      migrate: (persisted: unknown) => {
        // v1 → v2: add epics and stories arrays
        const state = persisted as Record<string, unknown>;
        if (!state.epics) state.epics = [];
        if (!state.stories) state.stories = [];
        return state as any;
      },
    },
  ),
);

/**
 * Story store — zustand + localStorage persistence for /story drafts
 * and applied stories. Holds the pendingStory (the one currently
 * displayed in chat awaiting user action) separately from the full
 * archive so natural-language apply ("apply them", "yes") can resolve
 * to the most recent pending draft without scanning the whole list.
 */

import { create } from "zustand";
import type { Story, StoryListItem, StoryStatus } from "./types";
import { STORY_STORE_CAP, STORY_DRAFT_TTL_MS } from "./types";

const STORAGE_KEY = "storyboard:stories";

function shortId(): string {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 6);
  return `story_${t}_${r}`;
}

function ageLabel(createdAt: number): string {
  const ms = Date.now() - createdAt;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d`;
  return `${Math.floor(d / 30)}mo`;
}

function loadFromStorage(): Story[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Story[];
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    // Auto-archive drafts older than TTL.
    return parsed.map((s) =>
      s.status === "draft" && now - s.createdAt > STORY_DRAFT_TTL_MS
        ? { ...s, status: "archived" as StoryStatus }
        : s
    );
  } catch {
    return [];
  }
}

function saveToStorage(stories: Story[]): void {
  if (typeof window === "undefined") return;
  try {
    // Cap the archive — keep the most recent N regardless of status.
    const capped = [...stories]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, STORY_STORE_CAP);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(capped));
  } catch {
    // localStorage quota or disabled — silently skip
  }
}

interface StoryState {
  stories: Story[];
  /** The draft currently awaiting user action in the chat. */
  pendingStoryId: string | null;

  addStory: (story: Omit<Story, "id" | "createdAt" | "status"> & { id?: string }) => Story;
  updateStory: (id: string, patch: Partial<Pick<Story, "title" | "audience" | "arc" | "context" | "scenes">>) => void;
  markApplied: (id: string) => void;
  archive: (id: string) => void;
  remove: (id: string) => void;
  setPending: (id: string | null) => void;
  getPending: () => Story | null;
  getById: (id: string) => Story | undefined;
  listRecent: (limit?: number) => StoryListItem[];
  clear: () => void;
}

export const useStoryStore = create<StoryState>((set, get) => ({
  stories: loadFromStorage(),
  pendingStoryId: null,

  addStory: (partial) => {
    const now = Date.now();
    const story: Story = {
      ...partial,
      id: partial.id ?? shortId(),
      createdAt: now,
      status: "draft",
    };
    set((s) => {
      const next = [story, ...s.stories.filter((x) => x.id !== story.id)];
      saveToStorage(next);
      return { stories: next, pendingStoryId: story.id };
    });
    return story;
  },

  updateStory: (id, patch) =>
    set((s) => {
      const next = s.stories.map((x) =>
        x.id === id ? { ...x, ...patch } : x
      );
      saveToStorage(next);
      return { stories: next };
    }),

  markApplied: (id) =>
    set((s) => {
      const next = s.stories.map((x) =>
        x.id === id ? { ...x, status: "applied" as StoryStatus, appliedAt: Date.now() } : x
      );
      saveToStorage(next);
      return { stories: next };
    }),

  archive: (id) =>
    set((s) => {
      const next = s.stories.map((x) =>
        x.id === id ? { ...x, status: "archived" as StoryStatus } : x
      );
      saveToStorage(next);
      return {
        stories: next,
        pendingStoryId: s.pendingStoryId === id ? null : s.pendingStoryId,
      };
    }),

  remove: (id) =>
    set((s) => {
      const next = s.stories.filter((x) => x.id !== id);
      saveToStorage(next);
      return {
        stories: next,
        pendingStoryId: s.pendingStoryId === id ? null : s.pendingStoryId,
      };
    }),

  setPending: (id) => set({ pendingStoryId: id }),

  getPending: () => {
    const { stories, pendingStoryId } = get();
    if (!pendingStoryId) return null;
    return stories.find((s) => s.id === pendingStoryId) ?? null;
  },

  getById: (id) => get().stories.find((s) => s.id === id),

  listRecent: (limit = 20) => {
    const all = [...get().stories].sort((a, b) => b.createdAt - a.createdAt);
    return all.slice(0, limit).map((s) => ({
      id: s.id,
      title: s.title,
      status: s.status,
      createdAt: s.createdAt,
      sceneCount: s.scenes.length,
      ageLabel: ageLabel(s.createdAt),
    }));
  },

  clear: () => {
    saveToStorage([]);
    set({ stories: [], pendingStoryId: null });
  },
}));

/** Exposed for unit tests — keeps `shortId` and `ageLabel` covered without
 * reaching into zustand internals. */
export const _testing = { shortId, ageLabel };

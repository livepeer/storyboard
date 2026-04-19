import { create } from "zustand";
import type { StreamPlan } from "./types";

const STORAGE_KEY = "storyboard:streams";

let nextStreamNum = 0;

/** Generate a friendly stream name from the title or prompt. */
function friendlyStreamId(title: string): string {
  const stopWords = new Set(["a", "an", "the", "of", "for", "with", "in", "on", "at", "to", "and"]);
  const words = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !stopWords.has(w));
  const slug = words.slice(0, 3).join("-") || "stream";
  return `stream-${slug}-${nextStreamNum++}`;
}

function load(): StreamPlan[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]"); }
  catch { return []; }
}

function save(plans: StreamPlan[]) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(plans.slice(0, 20))); }
  catch { /* quota */ }
}

interface StreamStore {
  plans: StreamPlan[];
  pendingId: string | null;
  addPlan: (p: Omit<StreamPlan, "id" | "createdAt" | "status">) => StreamPlan;
  markStreaming: (id: string, streamId: string) => void;
  markDone: (id: string) => void;
  setPending: (id: string | null) => void;
  getPending: () => StreamPlan | null;
  getById: (id: string) => StreamPlan | undefined;
  listRecent: (limit?: number) => StreamPlan[];
}

export const useStreamStore = create<StreamStore>((set, get) => ({
  plans: load(),
  pendingId: null,

  addPlan: (partial) => {
    const plan: StreamPlan = { ...partial, id: friendlyStreamId(partial.title || partial.originalPrompt), createdAt: Date.now(), status: "draft" };
    set((s) => { const next = [plan, ...s.plans]; save(next); return { plans: next, pendingId: plan.id }; });
    return plan;
  },

  markStreaming: (id, streamId) => set((s) => {
    const next = s.plans.map((p) => p.id === id ? { ...p, status: "streaming" as const, streamId } : p);
    save(next);
    return { plans: next };
  }),

  markDone: (id) => set((s) => {
    const next = s.plans.map((p) => p.id === id ? { ...p, status: "done" as const } : p);
    save(next);
    return { plans: next };
  }),

  setPending: (id) => set({ pendingId: id }),
  getPending: () => { const { plans, pendingId } = get(); return pendingId ? plans.find((p) => p.id === pendingId) ?? null : null; },
  getById: (id) => {
    const lower = id.toLowerCase();
    return get().plans.find((p) =>
      p.id === id || p.id.toLowerCase().startsWith(lower) || p.title.toLowerCase().startsWith(lower)
    );
  },
  listRecent: (limit = 10) => get().plans.slice(0, limit),
}));

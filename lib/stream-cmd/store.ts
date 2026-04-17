import { create } from "zustand";
import type { StreamPlan } from "./types";

const STORAGE_KEY = "storyboard:streams";

function shortId(): string {
  return `stream_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
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
    const plan: StreamPlan = { ...partial, id: shortId(), createdAt: Date.now(), status: "draft" };
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
  getById: (id) => get().plans.find((p) => p.id === id),
  listRecent: (limit = 10) => get().plans.slice(0, limit),
}));

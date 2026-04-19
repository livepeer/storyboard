/**
 * User-saved stream graph store — persists custom graph configurations
 * to localStorage so they can be reused by name.
 *
 * Built-in templates (from scope-graphs.ts) are always available.
 * User graphs are saved via /stream graphs save <name> or created
 * during /stream plan generation.
 */

import { create } from "zustand";
import type { ScopeGraphConfig } from "@/lib/stream/scope-params";
import { GRAPH_TEMPLATES } from "@/lib/stream/scope-graphs";

const STORAGE_KEY = "storyboard:user-graphs";

export interface SavedGraph {
  id: string;
  name: string;
  description: string;
  graph: ScopeGraphConfig;
  createdAt: number;
}

interface GraphStore {
  userGraphs: SavedGraph[];
  saveGraph: (name: string, description: string, graph: ScopeGraphConfig) => SavedGraph;
  removeGraph: (id: string) => void;
  getByName: (name: string) => SavedGraph | undefined;
  listAll: () => Array<{ id: string; name: string; description: string; builtIn: boolean }>;
}

function load(): SavedGraph[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]"); }
  catch { return []; }
}

function save(graphs: SavedGraph[]) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(graphs.slice(0, 20))); }
  catch { /* quota */ }
}

export const useGraphStore = create<GraphStore>((set, get) => ({
  userGraphs: load(),

  saveGraph: (name, description, graph) => {
    const id = `graph_${Date.now().toString(36)}`;
    const saved: SavedGraph = { id, name, description, graph, createdAt: Date.now() };
    set((s) => {
      // Replace if same name exists
      const filtered = s.userGraphs.filter((g) => g.name.toLowerCase() !== name.toLowerCase());
      const next = [saved, ...filtered];
      save(next);
      return { userGraphs: next };
    });
    return saved;
  },

  removeGraph: (id) => set((s) => {
    const next = s.userGraphs.filter((g) => g.id !== id);
    save(next);
    return { userGraphs: next };
  }),

  getByName: (name) => {
    const lower = name.toLowerCase();
    return get().userGraphs.find((g) => g.name.toLowerCase() === lower);
  },

  listAll: () => {
    const builtIn = GRAPH_TEMPLATES.map((t) => ({
      id: t.id,
      name: t.id,
      description: t.description,
      builtIn: true,
    }));
    const user = get().userGraphs.map((g) => ({
      id: g.id,
      name: g.name,
      description: g.description,
      builtIn: false,
    }));
    return [...builtIn, ...user];
  },
}));

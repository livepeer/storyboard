import { create } from "zustand";

export interface ProjectSnapshot {
  id: string;
  brief: string;
  totalScenes: number;
  completedScenes: number;
  sceneList: Array<{
    index: number;
    title: string;
    status: string;
    refId: string | undefined;
  }>;
  styleGuide: {
    style: string;
    palette: string;
    characters: string;
  } | null;
}

export interface ActionRecord {
  tool: string;
  summary: string;
  outcome: string;
  success: boolean;
  timestamp?: number;
}

interface WorkingMemoryState {
  project: ProjectSnapshot | null;
  digest: string;
  recentActions: ActionRecord[];
  preferences: Record<string, string>;

  setProject: (p: ProjectSnapshot | null) => void;
  recordAction: (action: ActionRecord) => void;
  appendDigest: (text: string) => void;
  updatePreference: (key: string, value: string) => void;
  syncFromProjectStore: () => void;
  reset: () => void;
}

const MAX_ACTIONS = 5;
const MAX_DIGEST_WORDS = 200;

export const useWorkingMemory = create<WorkingMemoryState>((set, get) => ({
  project: null,
  digest: "",
  recentActions: [],
  preferences: {},

  setProject: (p) => set({ project: p }),

  recordAction: (action) =>
    set((s) => {
      const actions = [...s.recentActions, { ...action, timestamp: Date.now() }];
      return { recentActions: actions.slice(-MAX_ACTIONS) };
    }),

  appendDigest: (text) =>
    set((s) => {
      const combined = s.digest ? `${s.digest} ${text}` : text;
      const words = combined.split(/\s+/);
      return {
        digest: words.length > MAX_DIGEST_WORDS
          ? words.slice(-MAX_DIGEST_WORDS).join(" ")
          : combined,
      };
    }),

  updatePreference: (key, value) =>
    set((s) => ({ preferences: { ...s.preferences, [key]: value } })),

  syncFromProjectStore: () => {
    // Dynamic import to avoid circular dependencies
    // Will be wired in Task 4 when we integrate with the project store
    try {
      const { useProjectStore } = require("@/lib/projects/store");
      const { useSessionContext } = require("@/lib/agents/session-context");
      const projStore = useProjectStore.getState();
      const active = projStore.getActiveProject();
      if (!active) {
        set({ project: null });
        return;
      }
      const ctx = useSessionContext.getState().context;
      set({
        project: {
          id: active.id,
          brief: active.brief?.slice(0, 300) || "",
          totalScenes: active.scenes.length,
          completedScenes: active.scenes.filter((s: { status: string }) => s.status === "done").length,
          sceneList: active.scenes.map((s: { index: number; title: string; status: string; cardRefId?: string }) => ({
            index: s.index,
            title: s.title,
            status: s.status,
            refId: s.cardRefId,
          })),
          styleGuide: ctx
            ? { style: ctx.style, palette: ctx.palette, characters: ctx.characters }
            : active.styleGuide
              ? { style: active.styleGuide.visualStyle || "", palette: active.styleGuide.colorPalette || "", characters: "" }
              : null,
        },
      });
    } catch {
      // Project store not available (e.g., in unit tests)
    }
  },

  reset: () =>
    set({ project: null, digest: "", recentActions: [], preferences: {} }),
}));

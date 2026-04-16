import { create } from "zustand";
import type { Project, Scene, StyleGuide, ProjectStatus, SceneStatus } from "./types";

const STORAGE_KEY = "storyboard_projects";

let nextProjectId = 0;

interface ProjectState {
  projects: Project[];
  activeProjectId: string | null;

  createProject: (brief: string, scenes: Omit<Scene, "status" | "iterations" | "cardRefId">[], styleGuide?: StyleGuide) => Project;
  getProject: (id: string) => Project | undefined;
  getActiveProject: () => Project | undefined;
  setActiveProject: (id: string | null) => void;

  updateProjectStatus: (id: string, status: ProjectStatus) => void;
  updateSceneStatus: (projectId: string, sceneIndex: number, status: SceneStatus, cardRefId?: string) => void;
  updateScenePrompt: (projectId: string, sceneIndex: number, prompt: string) => void;
  addFeedback: (projectId: string, feedback: string) => void;

  /** Get the next batch of pending/rejected scenes (up to batchSize) */
  getNextBatch: (projectId: string) => Scene[];
  /** Get scenes that need regeneration */
  getScenesForIteration: (projectId: string, indices?: number[]) => Scene[];
  /** Mark specific scenes as rejected with feedback */
  rejectScenes: (projectId: string, indices: number[], feedback: string) => void;
  /** Check if all scenes are done */
  isProjectComplete: (projectId: string) => boolean;

  /** Accumulate token usage on a project (per-project grand total). */
  addProjectTokens: (
    projectId: string,
    usage: { input: number; output: number; cached?: number },
  ) => void;

  clearProjects: () => void;
}

function loadProjects(): Project[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveProjects(projects: Project[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: loadProjects(),
  activeProjectId: null,

  createProject: (brief, scenes, styleGuide) => {
    const id = `proj_${Date.now()}_${nextProjectId++}`;
    const project: Project = {
      id,
      brief,
      styleGuide,
      scenes: scenes.map((s) => ({
        ...s,
        status: "pending" as const,
        iterations: 0,
      })),
      status: "planning",
      feedback: [],
      createdAt: Date.now(),
      batchSize: 5,
    };
    set((state) => {
      const updated = [...state.projects, project];
      saveProjects(updated);
      return { projects: updated, activeProjectId: id };
    });
    return project;
  },

  getProject: (id) => get().projects.find((p) => p.id === id),

  getActiveProject: () => {
    const { projects, activeProjectId } = get();
    return activeProjectId ? projects.find((p) => p.id === activeProjectId) : undefined;
  },

  setActiveProject: (id) => set({ activeProjectId: id }),

  updateProjectStatus: (id, status) => {
    set((state) => {
      const updated = state.projects.map((p) =>
        p.id === id ? { ...p, status } : p
      );
      saveProjects(updated);
      return { projects: updated };
    });
  },

  updateSceneStatus: (projectId, sceneIndex, status, cardRefId) => {
    set((state) => {
      const updated = state.projects.map((p) => {
        if (p.id !== projectId) return p;
        const scenes = p.scenes.map((s) =>
          s.index === sceneIndex
            ? { ...s, status, cardRefId: cardRefId || s.cardRefId, iterations: status === "done" ? s.iterations + 1 : s.iterations }
            : s
        );
        return { ...p, scenes };
      });
      saveProjects(updated);
      return { projects: updated };
    });
  },

  updateScenePrompt: (projectId, sceneIndex, prompt) => {
    set((state) => {
      const updated = state.projects.map((p) => {
        if (p.id !== projectId) return p;
        const scenes = p.scenes.map((s) =>
          s.index === sceneIndex ? { ...s, prompt } : s
        );
        return { ...p, scenes };
      });
      saveProjects(updated);
      return { projects: updated };
    });
  },

  addFeedback: (projectId, feedback) => {
    set((state) => {
      const updated = state.projects.map((p) =>
        p.id === projectId ? { ...p, feedback: [...p.feedback, feedback] } : p
      );
      saveProjects(updated);
      return { projects: updated };
    });
  },

  getNextBatch: (projectId) => {
    const project = get().getProject(projectId);
    if (!project) return [];
    const pending = project.scenes.filter((s) => s.status === "pending" || s.status === "regenerating");
    return pending.slice(0, project.batchSize);
  },

  getScenesForIteration: (projectId, indices) => {
    const project = get().getProject(projectId);
    if (!project) return [];
    if (indices) return project.scenes.filter((s) => indices.includes(s.index));
    return project.scenes.filter((s) => s.status === "rejected" || s.status === "regenerating");
  },

  rejectScenes: (projectId, indices, feedback) => {
    set((state) => {
      const updated = state.projects.map((p) => {
        if (p.id !== projectId) return p;
        const scenes = p.scenes.map((s) =>
          indices.includes(s.index)
            ? { ...s, status: "regenerating" as const, feedback }
            : s
        );
        return { ...p, scenes, status: "iterating" as const, feedback: [...p.feedback, feedback] };
      });
      saveProjects(updated);
      return { projects: updated };
    });
  },

  isProjectComplete: (projectId) => {
    const project = get().getProject(projectId);
    if (!project) return false;
    return project.scenes.every((s) => s.status === "done");
  },

  addProjectTokens: (projectId, usage) => {
    set((state) => {
      const projects = state.projects.map((p) => {
        if (p.id !== projectId) return p;
        const prev = p.tokensUsed ?? { input: 0, output: 0, cached: 0, turns: 0 };
        return {
          ...p,
          tokensUsed: {
            input: prev.input + (usage.input ?? 0),
            output: prev.output + (usage.output ?? 0),
            cached: prev.cached + (usage.cached ?? 0),
            turns: prev.turns + 1,
          },
        };
      });
      saveProjects(projects);
      return { projects };
    });
  },

  clearProjects: () => {
    if (typeof window !== "undefined") localStorage.removeItem(STORAGE_KEY);
    set({ projects: [], activeProjectId: null });
  },
}));

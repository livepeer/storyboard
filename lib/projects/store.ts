import { create } from "zustand";
import type { Project, Scene, StyleGuide, ProjectStatus, SceneStatus } from "./types";

const STORAGE_KEY = "storyboard_projects";

let nextProjectId = 0;

/**
 * Generate a short, friendly project name from the brief.
 * "give me 5 pictures of people riding bikes" → "people-riding-bikes"
 * "Story: The Grand Journey of Leo" → "grand-journey-leo"
 * "Film: Sunset over Tokyo" → "sunset-over-tokyo"
 */
function friendlyName(brief: string): string {
  let text = brief
    .replace(/^(Story|Film|Stream|Project|Brief):\s*/i, "")
    .replace(/[—–\-]+[\s\S]*/, "") // strip after em-dash (arc/style suffix)
    .toLowerCase()
    .trim();
  // Remove common filler words
  const stopWords = new Set(["give", "me", "make", "create", "generate", "a", "an", "the", "of", "for", "with", "in", "on", "at", "to", "and", "some", "few", "pictures", "images", "photos", "scene", "scenes"]);
  const words = text
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 1 && !stopWords.has(w));
  // Take up to 4 meaningful words
  const slug = words.slice(0, 4).join("-");
  return slug || `project-${nextProjectId}`;
}

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
    const all: Project[] = raw ? JSON.parse(raw) : [];
    // Trim on load — previous sessions may have accumulated >MAX
    if (all.length > MAX_PROJECTS) {
      const trimmed = all.slice(all.length - MAX_PROJECTS);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
      return trimmed;
    }
    return all;
  } catch { return []; }
}

const MAX_PROJECTS = 30;

function saveProjects(projects: Project[]) {
  if (typeof window === "undefined") return;
  // Cap to most recent N projects to prevent localStorage bloat.
  // Keep the newest ones (end of array = most recent).
  const capped = projects.length > MAX_PROJECTS
    ? projects.slice(projects.length - MAX_PROJECTS)
    : projects;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(capped));
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: loadProjects(),
  activeProjectId: null,

  createProject: (brief, scenes, styleGuide) => {
    const name = friendlyName(brief);
    const id = `${name}_${(nextProjectId++).toString(36)}`;
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
